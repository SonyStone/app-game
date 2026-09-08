import { defaultBrush, type Brush } from './brush';
import { viewerBrush } from './brushLibrary/viewerBrush';
import { verifyBrushResourceTransport } from './composition/resourceVerification';
import { texturedBrush } from './composition/texturedBrushEngine';
import { verifyEraserPersistence } from './eraserPersistenceVerification';
import { createMainThreadEndpoint, type PaintEndpoint } from './mainThreadEndpoint';
import Worker from './paint.worker?worker';
import { readPaintFile } from './paintFile';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';
import { verifySymmetryPersistence } from './symmetryPersistenceVerification';
import { unpackTile } from './tilePixels';

/** Verifies real DOM-canvas rendering and document exchange between both execution modes in an isolated database. */
export async function verifyMainThread(report: (message: string) => void) {
  const storageName = `paint-main-qa-${crypto.randomUUID()}`;
  let endpoint: PaintEndpoint = createMainThreadEndpoint();
  const waiters = new Set<(event: PaintEvent) => void>();
  const connect = () => {
    endpoint.onmessage = ({ data }) => {
      for (const receive of [...waiters]) receive(data);
    };
    endpoint.onerror = ({ message }) => {
      for (const receive of [...waiters]) receive({ type: 'error', message, recoverable: false });
    };
  };
  const wait = <T extends PaintEvent['type']>(type: T) =>
    new Promise<Extract<PaintEvent, { type: T }>>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(receive);
        reject(new Error(`Timed out waiting for ${type}`));
      }, 30_000);
      const receive = (event: PaintEvent) => {
        if (event.type !== type && event.type !== 'error') return;
        clearTimeout(timer);
        waiters.delete(receive);
        if (event.type === 'error') reject(new Error(event.message));
        else resolve(event as Extract<PaintEvent, { type: T }>);
      };
      waiters.add(receive);
    });
  const command = async <T extends PaintEvent['type']>(message: PaintRuntimeCommand, response: T) => {
    const result = wait(response);
    endpoint.postMessage(message);
    return result;
  };
  const init = async (
    main: boolean,
    tools?: Extract<PaintEvent, { type: 'checkpointed' }>['tools'],
    historySource?: Extract<PaintEvent, { type: 'checkpointed' }>['historySource']
  ) => {
    connect();
    const ready = wait('ready');
    const size = { width: 256, height: 256 };
    if (main) {
      const canvas = document.createElement('canvas');
      // No transferControlToOffscreen call: the renderer must use this exact DOM canvas.
      endpoint.postMessage({ type: 'init', canvas, size, dpr: 1, storageName, tools, historySource });
    } else {
      const canvas = new OffscreenCanvas(256, 256);
      endpoint.postMessage({ type: 'init', canvas, size, dpr: 1, storageName, tools, historySource }, [canvas]);
    }
    await ready;
    if (historySource) {
      const received = (await command({ type: 'checkpoint', includeTools: true }, 'checkpointed')).historySource;
      const json = (source: NonNullable<typeof historySource>) =>
        JSON.stringify({ ...source, layers: source.layers.map((layer) => ({ ...layer, tiles: [...layer.tiles] })) });
      if (!received || json(received) !== json(historySource))
        throw new Error('Runtime handoff lost the selected history source.');
    }
    if (tools?.mixer) {
      const restored = (await command({ type: 'checkpoint', includeTools: true }, 'checkpointed')).tools?.mixer;
      const { pixels, ...metadata } = tools.mixer;
      if (!restored) throw new Error('The endpoint discarded Mixer tool state during init.');
      const { pixels: restoredPixels, ...restoredMetadata } = restored;
      if (
        JSON.stringify(metadata) !== JSON.stringify(restoredMetadata) ||
        pixels.length !== restoredPixels.length ||
        pixels.some((value, i) => value !== restoredPixels[i])
      )
        throw new Error('Main/worker handoff changed Mixer pigment, Auto Load source or capacity.');
    }
    await verifyBrushResourceTransport((message) => command(message, 'brush-resources'), report);
  };
  const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
  const equal = async (a: Blob, b: Blob) => {
    const x = await bytes(a),
      y = await bytes(b);
    if (x.length !== y.length || !x.every((v, i) => v === y[i])) throw new Error('Mode switch changed document pixels');
  };
  const paintMixer = async (y: number) => {
    const preset = viewerBrush({
      id: 'mixer-transport',
      name: 'Mixer transport',
      type: 'computed',
      diameter: 32,
      hardness: 100,
      spacing: 12.5,
      settings: { toolOptions: { __classId: 'MixB', wetness: 50, dryness: 100, mix: 40, flow: 75, autoFill: true } }
    });
    for (const resource of preset.resources) {
      const uploaded = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!uploaded.result.ok) throw new Error(uploaded.result.error);
    }
    const brush: Brush = {
      ...defaultBrush(),
      color: '#0000ff',
      size: 32,
      flow: preset.flow!,
      opacity: preset.opacity!,
      stroke: { ...defaultBrush().stroke, mode: 'none' },
      engine: { ...preset.engine, settings: { ...preset.engine.settings, seed: 1 } }
    };
    const idleDocument = (await command({ type: 'download' }, 'download')).blob;
    for (const [action, accepted] of [
      ['clean', true],
      [{ type: 'load-canvas', point: { x: 0, y: 0 } }, true],
      ['load', true],
      ['invalid', false],
      [{ type: 'load-canvas', point: { x: NaN, y: 0 } }, false]
    ] as const) {
      const requestId = crypto.randomUUID();
      const response = await command({ type: 'brush-command', requestId, brush, command: action }, 'brush-command');
      if (response.requestId !== requestId || response.result.ok !== accepted)
        throw new Error('Idle brush command validation/correlation failed.');
    }
    await equal(idleDocument, (await command({ type: 'download' }, 'download')).blob);
    const idleResources = await command(
      { type: 'brush-resources', action: 'stats', requestId: crypto.randomUUID() },
      'brush-resources'
    );
    if (!idleResources.result.ok || idleResources.result.value.stats.pinnedBytes !== 0)
      throw new Error('An idle brush command leaked pinned resources.');
    endpoint.postMessage({
      type: 'begin',
      brush,
      samples: [{ x: -40, y, pressure: 1, time: 1 }]
    });
    const during = await command(
      { type: 'brush-command', requestId: crypto.randomUUID(), brush, command: 'clean' },
      'brush-command'
    );
    if (during.result.ok || !during.result.error.includes('Lift the pen'))
      throw new Error('An idle brush command interrupted an active stroke.');
    endpoint.postMessage({ type: 'samples', samples: [{ x: 40, y, pressure: 1, time: 100 }] });
    endpoint.postMessage({ type: 'end' });
    const painted = (await command({ type: 'download' }, 'download')).blob;
    const decoded = await readPaintFile(painted);
    if (!decoded.layers[0]?.tiles.size) throw new Error('Mixer did not commit across the runtime boundary.');
    return painted;
  };
  /** Filters existing ink through the runtime protocol, then leaves the original document intact. */
  const checkFilters = async () => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    for (const type of ['BlTl', 'ShTl'] as const) {
      const preset = viewerBrush({
        id: `filter-transport-${type}`,
        name: `Filter transport ${type}`,
        type: 'computed',
        diameter: 64,
        hardness: 100,
        spacing: 25,
        settings: { toolOptions: { __classId: type, 'Prs ': 100, detailBoost: false } }
      });
      for (const resource of preset.resources) {
        const response = await command(
          { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
          'brush-resources'
        );
        if (!response.result.ok) throw new Error(response.result.error);
      }
      const brush: Brush = {
        ...defaultBrush(),
        size: 64,
        stroke: { ...defaultBrush().stroke, mode: 'none' },
        engine: preset.engine
      };
      endpoint.postMessage({ type: 'begin', brush, samples: [{ x: 0, y: 0, pressure: 1, time: 1 }] });
      endpoint.postMessage({ type: 'samples', samples: [{ x: 20, y: 0, pressure: 1, time: 100 }] });
      endpoint.postMessage({ type: 'end' });
      const after = (await command({ type: 'download' }, 'download')).blob;
      const a = await readPaintFile(before),
        b = await readPaintFile(after);
      const changed = a.layers.some((layer, i) =>
        [...layer.tiles].some(([key, tile]) => {
          const filtered = b.layers[i]?.tiles.get(key);
          if (!filtered) return false;
          const pixels = unpackTile(filtered);
          return unpackTile(tile).some((v, j) => v !== pixels[j]);
        })
      );
      if (!changed) throw new Error(`${type} did not filter existing ink through the runtime endpoint.`);
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
      endpoint.postMessage({ type: 'redo' });
      await equal(after, (await command({ type: 'download' }, 'download')).blob);
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
    }
    report('PASS: Blur/Sharpen filter existing pixels through this endpoint with exact undo/redo');
  };
  /** Two contacts at the same location must alternate foreground/background without creating transparency. */
  const checkPencil = async () => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    const preset = viewerBrush({
      id: 'pencil-runtime',
      name: 'Pencil runtime',
      type: 'computed',
      diameter: 16,
      hardness: 0,
      spacing: 10,
      settings: { toolOptions: { __classId: 'PcTl', PncA: true } }
    });
    for (const resource of preset.resources) {
      const response = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!response.result.ok) throw new Error(response.result.error);
    }
    const brush: Brush = {
      ...defaultBrush(),
      size: 16,
      color: '#ff0000',
      backgroundColor: '#0000ff',
      flow: 0.01,
      opacity: 1,
      stroke: { ...defaultBrush().stroke, mode: 'none' },
      // Host background must override the preset's white fallback through both transports.
      engine: preset.engine
    };
    for (const expected of [
      [255, 0, 0, 255],
      [0, 0, 255, 255]
    ]) {
      endpoint.postMessage({ type: 'begin', brush, samples: [{ x: 16, y: 160, pressure: 1, time: 1 }] });
      endpoint.postMessage({ type: 'samples', samples: [{ x: 40, y: 160, pressure: 1, time: 100 }] });
      endpoint.postMessage({ type: 'end' });
      const decoded = await readPaintFile((await command({ type: 'download' }, 'download')).blob);
      const tile = decoded.layers[0]!.tiles.get('0,0');
      if (!tile) throw new Error('Pencil runtime did not commit a tile.');
      const pixel = unpackTile(tile).subarray((160 * 256 + 24) * 4, (160 * 256 + 24) * 4 + 4);
      if (pixel.some((value, i) => value !== expected[i]))
        throw new Error('Pencil runtime lost Auto Erase color selection.');
    }
    const ink = (await command({ type: 'download' }, 'download')).blob;
    const eraser = viewerBrush({
      id: 'eraser-pencil-runtime',
      name: 'Pencil eraser runtime',
      type: 'computed',
      diameter: 16,
      hardness: 0,
      spacing: 10,
      settings: { toolOptions: { __classId: 'ErTl', ErsB: 2, Opct: 25, flow: 1 } }
    });
    for (const resource of eraser.resources) {
      const response = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!response.result.ok) throw new Error(response.result.error);
    }
    endpoint.postMessage({
      type: 'begin',
      brush: { ...brush, opacity: eraser.opacity!, engine: eraser.engine },
      samples: [{ x: 16, y: 160, pressure: 1, time: 1 }]
    });
    endpoint.postMessage({ type: 'samples', samples: [{ x: 40, y: 160, pressure: 1, time: 100 }] });
    endpoint.postMessage({ type: 'end' });
    const erased = (await command({ type: 'download' }, 'download')).blob;
    const tile = (await readPaintFile(erased)).layers[0]!.tiles.get('0,0');
    if (!tile) throw new Error('Pencil eraser lost the existing tile.');
    const pixel = unpackTile(tile).subarray((160 * 256 + 24) * 4, (160 * 256 + 24) * 4 + 4);
    if (pixel.some((value, i) => Math.abs(value - [0, 0, 191, 191][i]!) > 1))
      throw new Error('Pencil eraser did not apply 25% opacity independently of Flow.');
    endpoint.postMessage({ type: 'undo' });
    await equal(ink, (await command({ type: 'download' }, 'download')).blob);
    endpoint.postMessage({ type: 'redo' });
    await equal(erased, (await command({ type: 'download' }, 'download')).blob);
    endpoint.postMessage({
      type: 'begin',
      zoom: 2,
      brush: {
        ...brush,
        size: 512,
        opacity: 0.01,
        engine: {
          ...eraser.engine,
          settings: {
            ...eraser.engine.settings,
            values: { ...eraser.engine.settings.values, tool: { ...eraser.engine.settings.values.tool, eraserMode: 3 } }
          }
        }
      },
      samples: [{ x: 24, y: 160, pressure: 0.01, time: 1 }]
    });
    endpoint.postMessage({ type: 'end' });
    const blockFile = (await command({ type: 'download' }, 'download')).blob;
    const blockTile = (await readPaintFile(blockFile)).layers[0]!.tiles.get('0,0');
    if (!blockTile) throw new Error('Block runtime lost the existing tile.');
    const blockPixels = unpackTile(blockTile);
    if (blockPixels[(160 * 256 + 24) * 4 + 3] !== 0 || Math.abs(blockPixels[(160 * 256 + 30) * 4 + 3]! - 191) > 1)
      throw new Error('Block runtime ignored the contact zoom or opacity override.');
    endpoint.postMessage({ type: 'undo' });
    await equal(erased, (await command({ type: 'download' }, 'download')).blob);
    for (let i = 0; i < 3; i++) endpoint.postMessage({ type: 'undo' });
    await equal(before, (await command({ type: 'download' }, 'download')).blob);
    // A host color edit must reach Color Dynamics, without rewriting the selected ABR preset.
    const colorValues = structuredClone(preset.engine.settings.values);
    colorValues.tool.autoErase = false;
    colorValues.useColorDynamics = true;
    colorValues.colorDynamics.control = 2;
    colorValues.colorDynamics.foregroundBackgroundJitter = 0;
    for (const [backgroundColor, channel] of [
      ['#0000ff', 2],
      ['#00ff00', 1]
    ] as const) {
      endpoint.postMessage({
        type: 'begin',
        brush: {
          ...brush,
          backgroundColor,
          engine: { ...preset.engine, settings: { ...preset.engine.settings, values: colorValues } }
        },
        samples: [{ x: 24, y: 160, pressure: 0.25, time: 1 }]
      });
      endpoint.postMessage({ type: 'end' });
      const file = await readPaintFile((await command({ type: 'download' }, 'download')).blob);
      const pixels = unpackTile(file.layers[0]!.tiles.get('0,0')!);
      const pixel = pixels.subarray((160 * 256 + 24) * 4, (160 * 256 + 24) * 4 + 4);
      if (pixel[3] !== 255 || pixel[channel]! <= pixel[0]! || pixel[0] === 0 || pixel[3 - channel] !== 0)
        throw new Error('Color Dynamics ignored the edited host background or pressure blend.');
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
    }
    report(
      'PASS: host background edits drive Auto Erase and pressure Color Dynamics; Eraser Pencil and zoom-aware Block preserve saved pixels and undo/redo'
    );
  };
  const checkSavedColors = async (model: 'HSB' | 'Lab' | 'Gray' = 'HSB') => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    const preset = viewerBrush({
      id: `${model}-runtime`,
      name: `${model} runtime`,
      type: 'computed',
      diameter: 16,
      hardness: 100,
      spacing: 10,
      settings: {
        toolOptions: {
          __classId: 'PcTl',
          PncA: true,
          FrgC:
            model === 'Gray'
              ? { __classId: 'Grsc', 'Gry ': 50 }
              : model === 'Lab'
                ? { __classId: 'LbCl', Lmnc: 50, 'A   ': 0, 'B   ': 0 }
                : { __classId: 'HSBC', 'H   ': { unit: '#Ang', value: 30 }, Strt: 100, Brgh: 100 },
          BckC:
            model === 'Gray'
              ? { __classId: 'Grsc', 'Gry ': 25 }
              : model === 'Lab'
                ? { __classId: 'LbCl', Lmnc: 75, 'A   ': 0, 'B   ': 0 }
                : { __classId: 'HSBC', 'H   ': { unit: '#Ang', value: 240 }, Strt: 100, Brgh: 100 }
        }
      }
    });
    for (const resource of preset.resources) {
      const response = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!response.result.ok) throw new Error(response.result.error);
    }
    const brush: Brush = {
      ...defaultBrush(),
      size: 16,
      color: preset.color!,
      backgroundColor: preset.backgroundColor,
      flow: 1,
      opacity: 1,
      engine: preset.engine,
      stroke: { ...defaultBrush().stroke, mode: 'none' }
    };
    for (const expected of model === 'Gray'
      ? [
          [128, 128, 128, 255],
          [191, 191, 191, 255]
        ]
      : model === 'Lab'
        ? [
            [119, 119, 119, 255],
            [185, 185, 185, 255]
          ]
        : [
            [255, 128, 0, 255],
            [0, 0, 255, 255]
          ]) {
      endpoint.postMessage({ type: 'begin', brush, samples: [{ x: 160, y: 2100, pressure: 1, time: 1 }] });
      endpoint.postMessage({ type: 'end' });
      const file = await readPaintFile((await command({ type: 'download' }, 'download')).blob);
      const tile = file.layers[0]!.tiles.get('0,8');
      if (!tile) throw new Error('Saved color did not paint.');
      const offset = ((2100 - 8 * 256) * 256 + 160) * 4;
      const pixel = unpackTile(tile).subarray(offset, offset + 4);
      if (pixel.some((value, index) => value !== expected[index]))
        throw new Error('Saved foreground/background was lost in rendering or Auto Erase.');
    }
    endpoint.postMessage({ type: 'undo' });
    endpoint.postMessage({ type: 'undo' });
    await equal(before, (await command({ type: 'download' }, 'download')).blob);
    report(`PASS: saved ${model} foreground/background render exact RGB pixels, drive Auto Erase and preserve Undo`);
  };
  const checkPressureOverrides = async () => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    const preset = viewerBrush({
      id: 'pressure-override-runtime',
      name: 'Pressure override runtime',
      type: 'computed',
      diameter: 16,
      hardness: 100,
      spacing: 10,
      settings: {}
    });
    for (const resource of preset.resources) {
      const response = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!response.result.ok) throw new Error(response.result.error);
    }
    for (const transferEnabled of [false, true]) {
      for (const pressure of [0.1, 0.5, 1]) {
        const values = structuredClone(preset.engine.settings.values);
        values.useTransfer = transferEnabled;
        values.transfer.opacityControl = 3;
        values.transfer.opacityJitter = 80;
        values.transfer.opacityMinimum = 80;
        values.tool.pressureOverridesOpacity = true;
        const brush: Brush = {
          ...defaultBrush(),
          size: 16,
          flow: 1,
          opacity: 0.6,
          stroke: { ...defaultBrush().stroke, mode: 'none' },
          engine: { ...preset.engine, settings: { ...preset.engine.settings, values } }
        };
        endpoint.postMessage({ type: 'begin', brush, samples: [{ x: 160, y: 2000, pressure, time: 1 }] });
        endpoint.postMessage({ type: 'end' });
        const file = (await command({ type: 'download' }, 'download')).blob;
        const tile = (await readPaintFile(file)).layers[0]!.tiles.get('0,7');
        if (!tile) throw new Error('Pressure override did not paint.');
        const alpha = unpackTile(tile)[((2000 - 7 * 256) * 256 + 160) * 4 + 3]!;
        if (Math.abs(alpha - Math.round(255 * 0.6 * pressure)) > 1)
          throw new Error(`Pressure opacity retained saved minimum/jitter: ${alpha} at ${pressure}.`);
        endpoint.postMessage({ type: 'undo' });
        await equal(before, (await command({ type: 'download' }, 'download')).blob);
      }
    }
    report('PASS: pressure opacity overrides saved minimum/jitter, including dormant Transfer, with exact Undo');
  };
  const checkAirbrush = async () => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    const preset = viewerBrush({
      id: 'airbrush-runtime',
      name: 'Airbrush runtime',
      type: 'computed',
      diameter: 16,
      hardness: 100,
      spacing: 10,
      settings: { toolOptions: { __classId: 'PbTl', 'Rpt ': true, flow: 5, Opct: 50 } }
    });
    for (const resource of preset.resources) {
      const response = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!response.result.ok) throw new Error(response.result.error);
    }
    const coverage: Record<string, number> = {};
    for (const mode of ['off', 'airbrush', 'smoothed', 'pencil', 'slack'] as const) {
      const values = structuredClone(preset.engine.settings.values);
      values.useBuildUp = mode !== 'off';
      values.smoothing.amount = mode === 'smoothed' || mode === 'slack' ? 100 : 0;
      values.smoothing.pulledString = mode === 'slack';
      if (mode === 'pencil') values.tool.type = 'PcTl';
      const brush: Brush = {
        ...defaultBrush(),
        size: 16,
        flow: 0.05,
        opacity: 0.5,
        stroke: { ...defaultBrush().stroke, mode: mode === 'smoothed' || mode === 'slack' ? 'studio' : 'none' },
        engine: { ...preset.engine, settings: { ...preset.engine.settings, values } }
      };
      endpoint.postMessage({ type: 'begin', brush, samples: [{ x: 160, y: 1900, pressure: 1, time: 1 }] });
      await new Promise((resolve) => setTimeout(resolve, 650));
      const state = await command({ type: 'debug', enabled: false }, 'state');
      if (state.saveState !== 'unsaved') throw new Error('Airbrush started saving an active stroke.');
      endpoint.postMessage({ type: 'end' });
      const file = (await command({ type: 'download' }, 'download')).blob;
      if (mode === 'slack') {
        await equal(before, file);
        continue;
      }
      const tile = (await readPaintFile(file)).layers[0]!.tiles.get('0,7');
      if (!tile) throw new Error(`Airbrush ${mode} did not paint.`);
      coverage[mode] = unpackTile(tile)[((1900 - 7 * 256) * 256 + 160) * 4 + 3]!;
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
    }
    if (
      Math.abs(coverage.off! - Math.round(255 * 0.05)) > 1 ||
      coverage.off! < 1 ||
      coverage.airbrush! < 50 ||
      coverage.smoothed! < 50 ||
      coverage.airbrush! > 128 ||
      coverage.smoothed! > 128 ||
      coverage.pencil !== 128
    )
      throw new Error(
        `Airbrush failed held Flow buildup, opacity ceiling or Pencil isolation: ${JSON.stringify(coverage)}`
      );
    report(
      'PASS: Airbrush holds build Flow without pointer events with raw/smoothed input, respect Opacity, exclude Pencil/slack string, keep active strokes unsaved and preserve exact Undo'
    );
  };
  const checkSmoothing = async () => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    const preset = viewerBrush({
      id: 'smoothing-runtime',
      name: 'Smoothing runtime',
      type: 'computed',
      diameter: 4,
      hardness: 100,
      spacing: 10,
      settings: {
        toolOptions: { __classId: 'PbTl', smoothing: true, smoothingValue: 100, smoothingCatchupAtEnd: false }
      }
    });
    for (const resource of preset.resources) {
      const response = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!response.result.ok) throw new Error(response.result.error);
    }
    for (const mode of ['no-catch-up', 'catch-up', 'pulled', 'slack', 'none'] as const) {
      const values = structuredClone(preset.engine.settings.values);
      values.smoothing.catchUp = mode !== 'no-catch-up';
      values.smoothing.pulledString = mode === 'pulled' || mode === 'slack';
      const brush: Brush = {
        ...defaultBrush(),
        size: 4,
        flow: 1,
        opacity: 1,
        engine: { ...preset.engine, settings: { ...preset.engine.settings, values } },
        stroke: { ...defaultBrush().stroke, mode: mode === 'none' ? 'none' : 'studio' }
      };
      endpoint.postMessage({
        type: 'begin',
        brush,
        samples: [
          { x: 16, y: 1800, pressure: 1, time: 1 },
          { x: mode === 'slack' ? 26 : 116, y: 1800, pressure: 1, time: 20 }
        ]
      });
      if (mode === 'catch-up' || mode === 'pulled') await new Promise((resolve) => setTimeout(resolve, 1600));
      endpoint.postMessage({ type: 'end' });
      const file = (await command({ type: 'download' }, 'download')).blob;
      if (mode === 'slack') {
        await equal(before, file);
        continue;
      }
      const tile = (await readPaintFile(file)).layers[0]!.tiles.get('0,7');
      if (!tile) throw new Error(`Smoothing ${mode} produced no stroke.`);
      const pixels = unpackTile(tile);
      const at = (x: number) => pixels[((1800 - 7 * 256) * 256 + x) * 4 + 3]!;
      if (!at(50) || Boolean(at(112)) !== (mode === 'catch-up' || mode === 'none'))
        throw new Error(`Smoothing ${mode} did not honor held-stroke catch-up or the raw bypass.`);
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
    }
    report(
      'PASS: held-stroke catch-up reaches the pen without pointer events; pulled string remains taut, slack contact paints nothing, None bypasses smoothing, undo restores exact pixels'
    );
  };
  const checkHistory = async () => {
    const before = (await command({ type: 'download' }, 'download')).blob;
    const state = await command({ type: 'debug', enabled: false }, 'state');
    await command({ type: 'history-source', id: state.document.historyCurrentId }, 'state');
    await equal(before, (await command({ type: 'download' }, 'download')).blob);
    const preset = viewerBrush({
      id: 'restore-runtime',
      name: 'Restore',
      type: 'computed',
      diameter: 32,
      hardness: 100,
      spacing: 10,
      settings: { toolOptions: { __classId: 'ErTl', ErsB: 2, Opct: 100 } }
    });
    for (const resource of preset.resources) {
      const result = await command(
        { type: 'brush-resources', action: 'put', requestId: resource.id, resource },
        'brush-resources'
      );
      if (!result.result.ok) throw new Error(result.result.error);
    }
    const draw = async (restore: boolean, altKey = false, eraserMode = 2) => {
      endpoint.postMessage({
        type: 'begin',
        modifiers: { altKey },
        brush: {
          ...defaultBrush(),
          size: 32,
          opacity: 1,
          stroke: { ...defaultBrush().stroke, mode: 'none' },
          engine: {
            ...preset.engine,
            settings: {
              ...preset.engine.settings,
              values: {
                ...preset.engine.settings.values,
                tool: { ...preset.engine.settings.values.tool, eraseToHistory: restore, eraserMode }
              }
            }
          }
        },
        samples: [{ x: 0, y: 0, pressure: 1, time: 1 }]
      });
      endpoint.postMessage({ type: 'samples', samples: [{ x: 20, y: 0, pressure: 1, time: 100 }] });
      endpoint.postMessage({ type: 'end' });
      return (await command({ type: 'download' }, 'download')).blob;
    };
    const erased = await draw(false);
    const restored = await draw(true);
    await equal(before, restored);
    endpoint.postMessage({ type: 'undo' });
    await equal(erased, (await command({ type: 'download' }, 'download')).blob);
    endpoint.postMessage({ type: 'redo' });
    await equal(restored, (await command({ type: 'download' }, 'download')).blob);
    endpoint.postMessage({ type: 'undo' });
    endpoint.postMessage({ type: 'undo' });
    await equal(before, (await command({ type: 'download' }, 'download')).blob);
    // The same saved preset must erase normally again after the temporary Alt stroke.
    for (const mode of [1, 2, 3]) {
      const erased = await draw(false, false, mode);
      const originalBytes = await bytes(before),
        erasedBytes = await bytes(erased);
      if (originalBytes.length === erasedBytes.length && originalBytes.every((byte, i) => byte === erasedBytes[i]))
        throw new Error('History eraser verification did not remove any ink.');
      const explicitRestore = await draw(true, false, mode);
      endpoint.postMessage({ type: 'undo' });
      await equal(erased, (await command({ type: 'download' }, 'download')).blob);
      await equal(explicitRestore, await draw(false, true, mode));
      endpoint.postMessage({ type: 'undo' });
      await equal(erased, (await command({ type: 'download' }, 'download')).blob);
      endpoint.postMessage({ type: 'redo' });
      await equal(explicitRestore, (await command({ type: 'download' }, 'download')).blob);
      endpoint.postMessage({ type: 'undo' });
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
      await equal(erased, await draw(false, false, mode));
      endpoint.postMessage({ type: 'undo' });
      await equal(before, (await command({ type: 'download' }, 'download')).blob);
    }
    report(
      'PASS: selected history source and temporary Alt restore exact pixels in Brush/Pencil/Block modes; Alt does not latch, undo/redo is exact'
    );
  };
  try {
    await init(true);
    const uploaded = await command(
      {
        type: 'brush-resources',
        requestId: 'textured-tip',
        action: 'put',
        resource: {
          id: 'qa-textured-tip',
          width: 2,
          height: 2,
          format: 'r8unorm',
          pixels: new Uint8Array([255, 255, 255, 255])
        }
      },
      'brush-resources'
    );
    if (!uploaded.result.ok) throw new Error(uploaded.result.error);
    endpoint.postMessage({
      type: 'begin',
      brush: { ...defaultBrush(), engine: texturedBrush.select({ tipId: 'qa-textured-tip', spacing: 0.04 }) },
      samples: [{ x: -40, y: -40, pressure: 0.4, time: 1 }]
    });
    endpoint.postMessage({ type: 'samples', samples: [{ x: 40, y: 40, pressure: 0.8, time: 2 }] });
    endpoint.postMessage({ type: 'end' });
    const original = await paintMixer(0);
    const decoded = await readPaintFile(original);
    if (!decoded.layers[0]?.tiles.size) throw new Error('DOM canvas mode did not commit the stroke');
    const png = (await command({ type: 'png' }, 'download')).blob;
    const bitmap = await createImageBitmap(png);
    const copy = document.createElement('canvas');
    copy.width = bitmap.width;
    copy.height = bitmap.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const center = ((copy.height >> 1) * copy.width + (copy.width >> 1)) * 4;
    if (pixels[0]! < 230 || pixels[1]! < 230 || pixels[2]! < 230 || pixels[3] !== 255)
      throw new Error('DOM canvas PNG lost the paper background');
    if (pixels[center]! >= 200 || pixels[center + 3] !== 255)
      throw new Error('DOM canvas PNG contains no visible ink at the stroke center');
    report('PASS: textured main-thread engine draws on HTMLCanvasElement and exports visible ink to PNG');
    await checkFilters();
    await checkPencil();
    await checkHistory();
    await checkSmoothing();
    await checkSavedColors();
    await checkSavedColors('Lab');
    await checkSavedColors('Gray');
    await checkPressureOverrides();
    await checkAirbrush();
    const mainHandoff = await command({ type: 'checkpoint', includeTools: true }, 'checkpointed');
    const mainTools = mainHandoff.tools;
    if (!mainTools?.mixer) throw new Error('Main renderer did not capture Mixer tool state.');
    await command({ type: 'dispose' }, 'disposed');
    endpoint = new Worker();
    await init(false, mainTools, mainHandoff.historySource);
    await equal(original, (await command({ type: 'download' }, 'download')).blob);
    report('PASS: worker restores the exact document saved by main-thread mode');
    await checkFilters();
    await checkPencil();
    await checkHistory();
    await checkSmoothing();
    await checkSavedColors();
    await checkSavedColors('Lab');
    await checkSavedColors('Gray');
    await checkPressureOverrides();
    await checkAirbrush();
    const mixed = await paintMixer(80);
    endpoint.postMessage({ type: 'undo' });
    await equal(original, (await command({ type: 'download' }, 'download')).blob);
    endpoint.postMessage({ type: 'redo' });
    await equal(mixed, (await command({ type: 'download' }, 'download')).blob);
    report(
      'PASS: native MixB draws in both modes; Load/Clean/canvas sampling preserve document bytes, reject invalid and active-stroke commands; worker undo/redo is exact'
    );
    const workerHandoff = await command({ type: 'checkpoint', includeTools: true }, 'checkpointed');
    const workerTools = workerHandoff.tools;
    if (!workerTools?.mixer) throw new Error('Worker renderer did not capture Mixer tool state.');
    await command({ type: 'dispose' }, 'disposed');
    endpoint.terminate();
    endpoint = createMainThreadEndpoint();
    await init(true, workerTools, workerHandoff.historySource);
    await equal(mixed, (await command({ type: 'download' }, 'download')).blob);
    await command({ type: 'dispose' }, 'disposed');
    report(
      'PASS: both directions preserve exact document pixels, rgba16float Mixer wells, Auto Load source and remaining paint'
    );
    await verifyEraserPersistence(report);
    await verifySymmetryPersistence(report);
    report('ALL EXECUTION MODE CHECKS PASSED');
  } finally {
    endpoint.terminate();
    indexedDB.deleteDatabase(storageName);
  }
}
