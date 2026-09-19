import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { initAbr, percent, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { unpackTile, type TileData } from '@app-game/paint-core/tilePixels';

/** Restores opaque, empty and translucent source tiles through the real GPU, including cold source references. */
export async function verifyHistoryErase(report: (message: string) => void) {
  await initAbr();
  const run = async (capacity: number, preview: boolean) => {
    const doc = createDocument();
    const tile = (rgba: number[]) => Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => rgba[i % 4]!);
    const green = tile([0, 255, 0, 255]);
    doc.commit(
      ['0,0', '2,0'].map((key, i) => ({
        layerId: doc.active.id,
        key,
        before: undefined,
        after: tile(i ? [0, 0, 64, 128] : [255, 0, 0, 255])
      }))
    );
    doc.selectHistorySource(1);
    doc.commit(
      ['0,0', '1,0', '2,0'].map((key) => ({
        layerId: doc.active.id,
        key,
        before: doc.active.tiles.get(key),
        after: green
      }))
    );
    const disk = new Map<string, Uint8Array>();
    const refs = new WeakMap<Uint8Array, TileData>();
    doc.persist((pixels) => {
      if (!(pixels instanceof Uint8Array)) return pixels;
      let ref = refs.get(pixels);
      if (!ref) {
        const storageId = crypto.randomUUID();
        disk.set(storageId, pixels);
        ref = { storageId, byteLength: pixels.byteLength };
        refs.set(pixels, ref);
      }
      return ref;
    });
    const read = async (pixels: TileData) => (pixels instanceof Uint8Array ? pixels : disk.get(pixels.storageId)!);
    const preset = prepareAbrBrush({
      id: 'history',
      name: 'History eraser',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{ toolOptions: { kind: 'ErTl', eraserMode: 2, eraseToHistory: true, opacity: 50, flow: 1 } },
        tip: { kind: 'computed', diameter: pixels(32), spacing: percent(10), hardness: percent(100) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    const resources = createBrushResources();
    preset.resources.forEach((resource) => resources.put(resource));
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(768, 256), (error) => errors.push(error), {
      cacheTiles: capacity,
      readTile: read
    });
    try {
      let endpoint = { x: 32, y: 128, pressure: 1, time: 0 };
      const make = () =>
        createResourceSession(resources, (resources) =>
          abrBrush.engine({
            resources,
            renderer,
            layer: doc.active,
            historySource: doc.historySourceLayer(doc.active.id),
            settings: preset.engine.settings,
            brush: { ...defaultBrush(), size: 32, opacity: 0.5, flow: 0.01 },
            processor: { ...createRawProcessor(), preview: () => [{ ...endpoint, y: 190 }] }
          })
        );
      const stroke = make();
      for (let i = 0; i < 89; i++) {
        endpoint = { x: 32 + (i <= 44 ? i : 88 - i) * 16, y: 128, pressure: 1, time: i * 8 };
        await stroke.add([endpoint]);
        if (preview) {
          stroke.preview(true);
          await renderer.render(
            doc.layers,
            { x: 384, y: 128, zoom: 1, angle: 0, mirrored: false },
            { width: 768, height: 256 },
            1
          );
        }
      }
      doc.commit(await stroke.finish());
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      const output = new Map([...doc.active.tiles].map(([key, pixels]) => [key, unpackTile(pixels)]));
      const expected = [
        [128, 127, 0, 255],
        [0, 127, 0, 127],
        [0, 127, 32, 191]
      ];
      for (let i = 0; i < 3; i++) {
        const pixels = output.get(`${i},0`)!;
        const offset = (128 * 256 + 128) * 4;
        if (expected[i]!.some((value, c) => Math.abs(value - pixels[offset + c]!) > 1))
          throw new Error(`History eraser restored wrong RGBA in tile ${i}: ${pixels.slice(offset, offset + 4)}`);
        if (pixels[(190 * 256 + 128) * 4 + 3] !== 255) throw new Error('History eraser committed a disposable tail.');
      }
      doc.undo();
      for (const pixels of doc.active.tiles.values())
        if (unpackTile(await read(pixels)).some((value, i) => value !== green[i]))
          throw new Error('History erase undo changed original pixels.');
      doc.redo();
      const cancelled = make();
      await cancelled.add([{ x: 384, y: 64, pressure: 1, time: 0 }]);
      cancelled.cancel();
      for (const [key, pixels] of doc.active.tiles)
        if (unpackTile(pixels).some((value, i) => value !== output.get(key)![i]))
          throw new Error('History erase redo/cancel changed pixels.');
      return output;
    } finally {
      renderer.destroy();
      resources.dispose();
    }
  };
  const resident = await run(8, false),
    evicted = await run(1, true);
  for (const [key, pixels] of resident)
    if (pixels.some((value, i) => value !== evicted.get(key)![i]))
      throw new Error('History erase changes with eviction or preview.');
  report(
    'Erase to History: opaque/empty/translucent cold sources, opacity ceiling, eviction, preview exclusion, cancellation and undo/redo passed.'
  );
}
