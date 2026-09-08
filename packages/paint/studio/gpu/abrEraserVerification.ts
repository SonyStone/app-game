import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { verifyAbrBlock } from './abrBlockVerification';
import { verifyHistoryErase } from './historyEraseVerification';
import { createPaintRenderer } from './renderer';

/** Exercises a native ErTl preset against existing pixels, including eviction, disposable tails and history. */
export async function verifyAbrEraser(report: (message: string) => void) {
  await verifyAbrBlock(report);
  await verifyHistoryErase(report);
  const run = async (capacity: number, preview: boolean, mode = 1, flow = 100) => {
    const document = createDocument();
    const base = Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => [90, 40, 10, 255][i % 4]!);
    document.commit(
      Array.from({ length: 3 }, (_, x) => ({
        layerId: document.active.id,
        key: `${x},0`,
        before: undefined,
        after: base
      }))
    );
    const preset = viewerBrush({
      id: 'eraser-qa',
      name: 'ABR Eraser QA',
      type: 'computed',
      diameter: 32,
      hardness: mode === 2 ? 0 : 100,
      spacing: 10,
      settings: { toolOptions: { __classId: 'ErTl', ErsB: mode, Opct: 50, flow } }
    });
    const resources = createBrushResources();
    preset.resources.forEach((resource) => resources.put(resource));
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(768, 256), (error) => errors.push(error), {
      cacheTiles: capacity
    });
    try {
      let endpoint = { x: 32, y: 128, pressure: 1, time: 0 };
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          brush: {
            ...defaultBrush(),
            size: preset.size,
            flow: preset.flow!,
            opacity: preset.opacity!,
            mixing: 'classic'
          },
          processor: { ...createRawProcessor(), preview: () => [{ ...endpoint, y: endpoint.y + 60 }] },
          settings: { ...preset.engine.settings, seed: 1 }
        })
      );
      // Cross tile boundaries in both directions to force readback and restoration of the eraser's opacity ceiling.
      for (let i = 0; i < 89; i++) {
        endpoint = { x: 32 + (i <= 44 ? i : 88 - i) * 16, y: 128, pressure: 1, time: i * 8 };
        await stroke.add([endpoint]);
        if (preview) {
          stroke.preview(true);
          await renderer.render(
            document.layers,
            { x: 384, y: 128, zoom: 1, angle: 0, mirrored: false },
            { width: 768, height: 256 },
            1
          );
          stroke.preview(false);
        }
      }
      document.commit(await stroke.finish());
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      const result = new Map([...document.active.tiles].map(([key, tile]) => [key, unpackTile(tile)]));
      for (const [key, pixels] of result) {
        if (mode === 2 && pixels.some((value, i) => i % 4 === 3 && value !== 255 && Math.abs(value - 128) > 1))
          throw new Error('Pencil eraser produced soft edge coverage.');
        const x = key === '0,0' ? 128 : 64;
        const center = (128 * 256 + x) * 4;
        if (Math.abs(pixels[center + 3]! - 128) > 1 || Math.abs(pixels[center]! - 45) > 1)
          throw new Error(
            `ABR eraser did not halve premultiplied color/alpha in tile ${key}: ${pixels.slice(center, center + 4)}`
          );
        // The vertical disposable tail must never be committed.
        const untouched = (188 * 256 + x) * 4;
        if (pixels[untouched + 3] !== 255 || pixels[untouched] !== 90)
          throw new Error(`ABR eraser committed a disposable tail in tile ${key}.`);
      }
      document.undo();
      if ([...document.active.tiles.values()].some((tile) => unpackTile(tile).some((value, i) => value !== base[i])))
        throw new Error('Undo did not restore the original ink after ABR erasing.');
      document.redo();
      for (const [key, tile] of document.active.tiles)
        if (unpackTile(tile).some((value, i) => value !== result.get(key)![i]))
          throw new Error('Redo did not restore the exact erased pixels.');
      return result;
    } finally {
      renderer.destroy();
      resources.dispose();
    }
  };
  const resident = await run(8, false),
    evicted = await run(1, true);
  if (resident.size !== 3 || evicted.size !== resident.size)
    throw new Error('ABR eraser lost existing document tiles.');
  for (const [key, pixels] of resident) {
    const actual = evicted.get(key);
    if (!actual || pixels.some((value, i) => value !== actual[i]))
      throw new Error(`ABR erasing changed with eviction or disposable tails in tile ${key}.`);
  }
  const pencil = await run(8, false, 2, 100);
  const pencilLowFlow = await run(1, true, 2, 1);
  for (const [key, pixels] of pencil) {
    const actual = pencilLowFlow.get(key);
    if (!actual || pixels.some((value, i) => value !== actual[i]))
      throw new Error('Pencil eraser changed with dormant Flow, eviction or preview tails.');
  }
  report('ABR Eraser Pencil: binary coverage before opacity, Flow ignored, eviction/preview and undo/redo preserved.');
  report(
    'ABR ErTl: 50% erasing preserves premultiplied color; eviction and disposable tails are pixel-identical; undo/redo restores exact snapshots.'
  );
}
