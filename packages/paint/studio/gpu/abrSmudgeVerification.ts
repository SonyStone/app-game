import { defaultBrush, type Sample } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Native SmTl must transport existing pixels, react to strength, and sample other layers only when requested. */
export async function verifyAbrSmudge(report: (message: string) => void) {
  const run = async (
    strength: number,
    capacity: number,
    batch: number,
    otherLayer = false,
    allLayers = false,
    finger = false,
    dual = false
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
    const resources = createBrushResources();
    preset.resources.forEach((resource) => resources.put(resource));
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (message) => errors.push(message), {
      cacheTiles: capacity
    });
    try {
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          brush: { ...defaultBrush(), size: 32, flow: 1, opacity: 1, color: '#0000ff', mixing: 'classic' },
          settings: { ...preset.engine.settings, seed: 1 }
        })
      );
      const points: Sample[] = Array.from({ length: 25 }, (_, i) => ({
        x: 184 + i * 4,
        y: 128,
        pressure: 1,
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
      return pixels;
    } finally {
      renderer.destroy();
    }
  };
  const strong = await run(100, 8, 1),
    evicted = await run(100, 1, 7),
    weak = await run(20, 8, 1),
    zero = await run(0, 8, 1);
  if (strong.some((value, i) => value !== evicted[i]))
    throw new Error('Smudge changed with input batching or cache eviction.');
  const moved = (pixels: Uint8Array) =>
    pixels.reduce((sum, value, i) => sum + (i >= 220 * 4 && i % 4 === 3 ? value : 0), 0);
  if (moved(strong) < 200 || moved(weak) >= moved(strong) || moved(zero) !== 0)
    throw new Error(
      `Smudge did not transport pixels according to Strength: ${moved(strong)}/${moved(weak)}/${moved(zero)}`
    );
  const current = await run(100, 8, 1, true),
    all = await run(100, 8, 1, true, true),
    finger = await run(100, 8, 1, true, false, true);
  if (current.some(Boolean)) throw new Error('Current-layer Smudge sampled a different layer.');
  if (moved(all) < 200) throw new Error('Sample All Layers did not pull underlying red paint into the active layer.');
  if (finger[184 * 4 + 2]! < 200 || moved(finger) < 50)
    throw new Error('Finger Painting did not start with foreground color and transport it.');
  const dual = await run(100, 8, 1, false, false, false, true);
  const dualEvicted = await run(100, 1, 7, false, false, false, true);
  if (moved(dual) < 100 || dual.some((value, i) => value !== dualEvicted[i]))
    throw new Error('Dual-tip Smudge lost transport or changed with eviction/batching.');
  report(
    `ABR SmTl: transported alpha at Strength 100/20/0 = ${moved(strong)}/${moved(weak)}/${moved(zero)}; batching/eviction identical; Sample All Layers, Finger Painting, Dual Brush and undo/redo passed.`
  );
}
