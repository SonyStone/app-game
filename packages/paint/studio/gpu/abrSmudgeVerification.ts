import type { ColorMixing } from '@app-game/abr-brush/effects';
import { defaultBrush, type Sample } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';
import { verifySmudgePickup } from './smudgePickupVerification';

/** Native SmTl must transport existing pixels, react to strength, and sample other layers only when requested. */
export async function verifyAbrSmudge(report: (message: string) => void) {
  await verifySmudgePickup(report);
  const run = async (
    strength: number,
    capacity: number,
    batch: number,
    otherLayer = false,
    allLayers = false,
    finger = false,
    dual = false,
    directSmudge = true,
    mixing: ColorMixing = 'classic',
    progress = false,
    dense = false,
    multiDab = directSmudge
  ) => {
    const document = createDocument();
    const base = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 200; x++) base.set([255, 0, 0, 255], (y * 256 + x) * 4);
    document.active.tiles.set('0,0', base);
    if (otherLayer) document.changeLayer({ type: 'add' });
    const before = new Map(document.active.tiles);
    const preset = viewerBrush({
      id: 'smudge-qa',
      name: 'Smudge',
      type: 'computed',
      diameter: 32,
      spacing: 12.5,
      hardness: 100,
      settings: {
        toolOptions: { __classId: 'SmTl', 'Prs ': strength, SmdF: finger, SmdS: allLayers },
        ...(dual
          ? {
              dualBrush: {
                useDualBrush: true,
                BlnM: { type: 'BlnM', value: 'Mltp' },
                Brsh: {
                  __classId: 'computedBrush',
                  Dmtr: { unit: '#Pxl', value: 32 },
                  Spcn: { unit: '#Prc', value: 12.5 },
                  Hrdn: { unit: '#Prc', value: 100 }
                }
              }
            }
          : {})
      }
    });
    if (dense) {
      preset.engine.settings.values.useShapeDynamics = true;
      preset.engine.settings.values.shapeDynamics.sizeControl = 2;
      preset.engine.settings.values.shapeDynamics.minimumDiameter = 10;
    }
    const resources = createBrushResources();
    preset.resources.forEach((resource) => resources.put(resource));
    const errors: string[] = [];
    let progressFrames = 0;
    let renderer: Awaited<ReturnType<typeof createPaintRenderer>>;
    renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (message) => errors.push(message), {
      cacheTiles: capacity,
      directSmudge,
      batchSmudgePasses: directSmudge,
      batchSmudgeDabs: multiDab,
      sharedScratch: directSmudge,
      onPaintProgress: progress
        ? async () => {
            await renderer.render(
              document.layers,
              { x: 256, y: 128, zoom: 0.5, angle: 0.2, mirrored: false },
              { width: 512, height: 256 },
              1
            );
            await renderer.submitted();
            progressFrames++;
          }
        : undefined
    });
    try {
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          brush: { ...defaultBrush(), size: 32, flow: 1, opacity: 1, color: '#0000ff', mixing },
          settings: { ...preset.engine.settings, seed: 1 }
        })
      );
      const points: Sample[] = Array.from({ length: dense ? 8 : 25 }, (_, i) => ({
        x: 184 + i * (dense ? 64 : 4),
        y: 128,
        pressure: dense ? 0.2 + (i % 3) * 0.4 : 1,
        time: i * 8
      }));
      for (let i = 0; i < points.length; i += batch) {
        await stroke.add(points.slice(i, i + batch));
        stroke.preview(true);
        stroke.preview(false);
      }
      const changes = await stroke.finish();
      document.commit(changes);
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      const pixels = new Uint8Array(512 * 4);
      for (const [key, data] of document.active.tiles) {
        const x = Number(key.split(',')[0]);
        if (key.endsWith(',0') && x >= 0 && x < 2)
          pixels.set(unpackTile(data).subarray(128 * 256 * 4, 129 * 256 * 4), x * 256 * 4);
      }
      if (changes.length) {
        const after = new Map(document.active.tiles);
        const checkSnapshots = (expected: typeof before) => {
          if (document.active.tiles.size !== expected.size) throw new Error('Smudge history changed the tile count.');
          for (const [key, tile] of expected) {
            const actual = document.active.tiles.get(key);
            const expectedPixels = unpackTile(tile);
            if (!actual || unpackTile(actual).some((value, i) => value !== expectedPixels[i]))
              throw new Error('Smudge history did not restore exact pixels.');
          }
        };
        document.undo();
        checkSnapshots(before);
        document.redo();
        checkSnapshots(after);
      }
      if (progress && !progressFrames) throw new Error('Smudge never offered intermediate presentation.');
      return { pixels, tiles: new Map([...document.active.tiles].map(([key, data]) => [key, unpackTile(data)])) };
    } finally {
      renderer.destroy();
    }
  };
  const { pixels: strong } = await run(100, 8, 1),
    { pixels: evicted } = await run(100, 1, 7),
    { pixels: weak } = await run(20, 8, 1),
    { pixels: zero } = await run(0, 8, 1);
  if (strong.some((value, i) => value !== evicted[i]))
    throw new Error('Smudge changed with input batching or cache eviction.');
  const moved = (pixels: Uint8Array) =>
    pixels.reduce((sum, value, i) => sum + (i >= 220 * 4 && i % 4 === 3 ? value : 0), 0);
  if (moved(strong) < 200 || moved(weak) >= moved(strong) || moved(zero) !== 0)
    throw new Error(
      `Smudge did not transport pixels according to Strength: ${moved(strong)}/${moved(weak)}/${moved(zero)}`
    );
  const { pixels: current } = await run(100, 8, 1, true),
    { pixels: all } = await run(100, 8, 1, true, true),
    { pixels: finger } = await run(100, 8, 1, true, false, true);
  if (current.some(Boolean)) throw new Error('Current-layer Smudge sampled a different layer.');
  if (moved(all) < 200) throw new Error('Sample All Layers did not pull underlying red paint into the active layer.');
  if (finger[184 * 4 + 2]! < 200 || moved(finger) < 50)
    throw new Error('Finger Painting did not start with foreground color and transport it.');
  const { pixels: dual } = await run(100, 8, 1, false, false, false, true);
  const { pixels: dualEvicted } = await run(100, 1, 7, false, false, false, true);
  if (moved(dual) < 100 || dual.some((value, i) => value !== dualEvicted[i]))
    throw new Error('Dual-tip Smudge lost transport or changed with eviction/batching.');
  // Compare every committed pixel, including transparent tile edges, with the multipass reference.
  for (const mixing of ['classic', 'linear'] as const) {
    for (const scenario of ['plain', 'allLayers', 'finger', 'dual'] as const) {
      const other = scenario === 'allLayers' || scenario === 'finger';
      const draw = (direct: boolean) =>
        run(70, 1, 7, other, scenario === 'allLayers', scenario === 'finger', scenario === 'dual', direct, mixing);
      const reference = await draw(false),
        fused = await draw(true);
      if (reference.tiles.size !== fused.tiles.size) throw new Error('Fused Smudge changed tile allocation.');
      for (const [key, expected] of reference.tiles) {
        const actual = fused.tiles.get(key);
        if (!actual || expected.some((value, i) => value !== actual[i]))
          throw new Error(`Fused Smudge changed pixels: ${mixing}/${scenario}/${key}.`);
      }
    }
  }
  for (const mixing of ['classic', 'linear'] as const) {
    for (const scenario of ['plain', 'allLayers', 'finger', 'dual'] as const) {
      for (const capacity of [1, 8]) {
        const draw = (multi: boolean) =>
          run(
            70,
            capacity,
            7,
            scenario === 'allLayers' || scenario === 'finger',
            scenario === 'allLayers',
            scenario === 'finger',
            scenario === 'dual',
            true,
            mixing,
            true,
            true,
            multi
          );
        const reference = await draw(false),
          batched = await draw(true);
        if (reference.tiles.size !== batched.tiles.size) throw new Error('Multi-dab batching changed tile allocation.');
        for (const [key, pixels] of reference.tiles) {
          const actual = batched.tiles.get(key);
          if (!actual || pixels.some((value, byte) => value !== actual[byte]))
            throw new Error(`Multi-dab batching changed pixels: ${mixing}/${scenario}/${capacity}/${key}.`);
        }
      }
    }
  }
  report(
    'Smudge multi-dab batches: sparse pressure input, bank resize, Classic/Smooth, all layers, finger/dual, progress and 1/8-tile caches preserve every pixel.'
  );
  for (const mixing of ['classic', 'linear'] as const) {
    const uninterrupted = await run(70, 1, 7, false, false, false, false, true, mixing);
    const presented = await run(70, 1, 7, false, false, false, false, true, mixing, true);
    if (uninterrupted.tiles.size !== presented.tiles.size) throw new Error('Progress frames changed tile count.');
    for (const [key, pixels] of uninterrupted.tiles) {
      const actual = presented.tiles.get(key);
      if (!actual || pixels.some((value, byte) => value !== actual[byte]))
        throw new Error(`Intermediate Smudge presentation changed pixels: ${mixing}/${key}.`);
    }
  }
  report(
    'Smudge progress: intermediate frames between dabs preserve Classic/Smooth pixels and history with a one-tile cache.'
  );
  report(
    'Smudge fused/reference: Classic/Smooth, partial strength, Sample All Layers, Finger Painting and Dual Brush fallback are pixel-identical with eviction.'
  );
  report(
    `ABR SmTl: transported alpha at Strength 100/20/0 = ${moved(strong)}/${moved(weak)}/${moved(zero)}; batching/eviction identical; Sample All Layers, Finger Painting, Dual Brush and undo/redo passed.`
  );
}
