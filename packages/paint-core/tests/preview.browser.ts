import { brushToFormValues } from '@app-game/abr-brush/form';
import { generateComputedBrushTip, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { percent, pixels } from '@app-game/abr-parser';
import type { PreviewConfiguration, PreviewReply } from '../src/preview/protocol';
import { createPreviewRuntime } from '../src/preview/runtime';

/** Browser-only contracts for the production engines. No CPU stroke renderer participates. */
export async function verifyPreviewEngine() {
  const runtime = createPreviewRuntime();
  let id = 0;
  const passed: string[] = [];
  const check = (name: string, condition: boolean) => {
    if (!condition) {
      throw new Error(name);
    }
    passed.push(name);
  };
  const read = async (reply: PreviewReply) => {
    if (reply.type !== 'image') {
      throw new Error(reply.type === 'error' ? reply.message : 'Missing image');
    }
    const canvas = new OffscreenCanvas(reply.bitmap.width, reply.bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(reply.bitmap, 0, 0);
    reply.bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const render = async (configuration: PreviewConfiguration, points = path(), chunks = 1) => {
    const revision = ++id;
    let reply = await runtime.run({
      id: ++id,
      target: 1,
      revision,
      action: 'begin',
      configuration,
      points: points.slice(0, 1)
    });
    if (reply.type === 'error') {
      throw new Error(reply.message);
    }
    if (reply.type === 'image') {
      reply.bitmap.close();
    }
    const step = Math.max(1, Math.ceil((points.length - 1) / chunks));
    for (let i = 1; i < points.length; i += step) {
      reply = await runtime.run({ id: ++id, target: 1, revision, action: 'add', points: points.slice(i, i + step) });
      if (reply.type === 'image') {
        reply.bitmap.close();
      }
      if (reply.type === 'error') {
        throw new Error(reply.message);
      }
    }
    return read(await runtime.run({ id: ++id, target: 1, revision, action: 'finish', points: [] }));
  };
  const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((value, i) => value === b[i]);
  const sum = (pixels: Uint8ClampedArray) => pixels.reduce((total, value, i) => total + (i % 4 === 0 ? value : 0), 0);
  try {
    const base = fixture();
    const normal = await render(base);
    check('round engine produces visible paint', sum(normal) > 10000);
    const doubled = fixture();
    doubled.width *= 2;
    doubled.height *= 2;
    doubled.dpr = 2;
    Object.assign(doubled.input, { width: doubled.width, height: doubled.height, dpr: 2 });
    const highDensity = await render(doubled);
    check('DPR preserves document-space brush size', Math.abs(sum(highDensity) / (sum(normal) * 4) - 1) < 0.05);

    const jitter = fixture();
    jitter.input.values.useShapeDynamics = true;
    jitter.input.values.shapeDynamics.sizeJitter = 70;
    const jittered = await render(jitter);
    check('jitter is deterministic across incremental packet sizes', equal(jittered, await render(jitter, path(), 15)));
    check('jitter changes geometry', !equal(normal, jittered));

    const pressure = fixture();
    pressure.input.values.useShapeDynamics = true;
    pressure.input.values.shapeDynamics.sizeControl = 2;
    const tapered = path().map((point, i) => ({ ...point, pressure: 0.1 + (0.9 * i) / 63 }));
    check('pen pressure changes coverage', !equal(normal, await render(pressure, tapered)));
    pressure.input.values.useBrushPose = true;
    pressure.input.values.brushPose.overridePressure = true;
    pressure.input.values.brushPose.pressure = 50;
    check('pose overrides real pressure', equal(await render(pressure, tapered), await render(pressure)));

    const ceiling = fixture();
    ceiling.input.flow = 0.5;
    ceiling.input.opacity = 0.5;
    const contact = [{ ...path()[0]!, x: 0.5, y: 0.5 }];
    const faint = await render(ceiling, contact);
    const center = (32 * 128 + 64) * 4;
    check('global opacity applies after flow', Math.abs(faint[center]! - 64) <= 2);
    ceiling.input.values.useBuildUp = true;
    const revision = ++id;
    const first = await read(
      await runtime.run({ id: ++id, target: 1, revision, action: 'begin', configuration: ceiling, points: contact })
    );
    const held = await read(
      await runtime.run({ id: ++id, target: 1, revision, action: 'add', points: [], elapsedMs: 1000 })
    );
    check('idle builds coverage while contact is held', held[center]! > first[center]!);
    check('build-up respects the stroke opacity ceiling', held[center]! <= 129);
    await runtime.run({ id: ++id, target: 1, revision, action: 'cancel', points: [] });

    const smoothing = fixture();
    const jagged = path().map((point, i) => ({ ...point, y: i % 2 ? 0.25 : 0.75 }));
    const rough = await render(smoothing, jagged);
    smoothing.input.values.useSmoothing = true;
    smoothing.input.values.smoothing.amount = 90;
    check('preset smoothing changes a jagged path', !equal(rough, await render(smoothing, jagged)));

    const sampled = fixture();
    sampled.input.values.tipKind = 'sampledBrush';
    sampled.tip = { width: 32, height: 8, depth: 8, data: new Uint8Array(256).fill(255) };
    const source = sampled.tip.data.slice();
    check('sampled tip geometry differs from computed', !equal(normal, await render(sampled)));
    check(
      'sample bytes survive rendering',
      sampled.tip.data.every((byte, i) => byte === source[i])
    );

    for (const effect of ['texture', 'dual', 'color', 'noise', 'wet'] as const) {
      const configuration = fixture();
      const values = configuration.input.values;
      if (effect === 'texture') {
        values.useTexture = true;
        values.texture.mode = 'Mltp';
        values.texture.depth = 100;
        const native = nativeFixture(configuration);
        const settings = native.brush.engine!.settings as { patternId?: string };
        settings.patternId = 'pattern';
        native.resources!.push({
          id: 'pattern',
          width: 4,
          height: 4,
          format: 'r8unorm',
          pixels: Uint8Array.from({ length: 16 }, (_, i) => (i % 2 ? 255 : 0))
        });
        check('texture changes real stroke pixels', !equal(normal, await render(native)));
      } else if (effect === 'dual') {
        values.useDualBrush = true;
        values.dualBrush.tipId = 'dual';
        values.dualBrush.mode = 'Mltp';
        values.dualBrush.diameter = 16;
        const native = nativeFixture(configuration);
        const settings = native.brush.engine!.settings as { dualId?: string };
        settings.dualId = 'dual';
        native.resources!.push({
          id: 'dual',
          width: 32,
          height: 32,
          format: 'r8unorm',
          pixels: new Uint8Array(1024).fill(128)
        });
        check('dual mask changes real stroke pixels', !equal(normal, await render(native)));
      } else {
        if (effect === 'color') {
          values.useColorDynamics = true;
          values.colorDynamics.applyPerTip = true;
          values.colorDynamics.foregroundBackgroundJitter = 100;
          configuration.input.secondaryColor = '#ff0000';
        } else if (effect === 'noise') {
          values.useNoise = true;
        } else {
          values.useWetEdges = true;
        }
        check(`${effect} changes real stroke pixels`, !equal(normal, await render(configuration)));
      }
    }

    for (const type of ['MixB', 'SmTl', 'BlTl', 'ShTl', 'ErTl'] as const) {
      const configuration = fixture();
      configuration.input.values.tool.type = type;
      const tool = configuration.input.values.tool;
      Object.assign(tool, { wetness: 80, mix: 70, load: 100, strength: 100, fingerPainting: true });
      const pixels = await render(configuration);
      check(`${type} changes the sample document`, sum(pixels) > 0 && !equal(normal, pixels));
      check(`${type} starts with fresh document and tool state`, equal(pixels, await render(configuration)));
      if (type === 'ErTl') {
        tool.eraseToHistory = true;
        check('history eraser restores source layer', !equal(pixels, await render(configuration)));
      }
    }
    const native = {
      kind: 'brush' as const,
      brush: { size: 20, color: '#ff0000' },
      width: 128,
      height: 64,
      dpr: 1,
      background: '#000000'
    };
    const red = await render(native);
    check(
      'native round presets retain saved color',
      red.some((value, i) => i % 4 === 0 && value > red[i + 1]!)
    );
    return passed;
  } finally {
    runtime.dispose();
  }
}

function fixture() {
  const values = brushToFormValues({
    name: 'Fixture',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      tip: { kind: 'computed', diameter: pixels(20), spacing: percent(10), hardness: percent(100) }
    }
  });
  values.useSmoothing = false;
  return {
    kind: 'abr' as const,
    width: 128,
    height: 64,
    dpr: 1,
    background: '#000000',
    tip: generateComputedBrushTip(20, 100),
    input: {
      values,
      width: 128,
      height: 64,
      dpr: 1,
      background: '#000000',
      color: '#ffffff',
      secondaryColor: '#ffffff',
      flow: 1,
      opacity: 1
    }
  };
}
function path(): PreviewPoint[] {
  return Array.from({ length: 64 }, (_, i) => ({
    x: 0.15 + (0.7 * i) / 63,
    y: 0.5,
    pressure: 1,
    tiltX: 0,
    tiltY: 0,
    rotation: 0,
    time: i * 10
  }));
}
function nativeFixture(configuration: ReturnType<typeof fixture>) {
  const tip = configuration.tip;
  return {
    kind: 'brush' as const,
    width: 128,
    height: 64,
    dpr: 1,
    background: '#000000',
    brush: {
      color: '#ffffff',
      size: 20,
      flow: 1,
      opacity: 1,
      mixing: 'classic' as const,
      engine: {
        id: 'abr',
        settings: { values: configuration.input.values, tipId: 'tip', seed: 12345, secondaryColor: '#ffffff' }
      }
    },
    resources: [{ id: 'tip', width: tip.width, height: tip.height, format: 'r8unorm' as const, pixels: tip.data }]
  };
}
