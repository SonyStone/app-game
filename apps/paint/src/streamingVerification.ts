import { defaultBrush } from './brush';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { createPaintRenderer } from './gpu/renderer';
import { readPaintFile, writePaintFile } from './paintFile';
import { snapshotDocument } from './storage';
import { packTile, unpackTile } from './tilePixels';
import { createTileStore } from './tileStore';

/** Real IndexedDB and WebGPU checks, isolated from the user's drawing. */
export async function verifyStreaming(report: (message: string) => void) {
  const name = `paint-streaming-qa-${crypto.randomUUID()}`;
  const store = await createTileStore(name, 1024);
  const document = createDocument({ paged: true });
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(512, 512);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), {
    virtualTexture: true,
    readTile: store.read,
    onError: (error) => errors.push(String(error))
  });
  const size = { width: 512, height: 512 };
  const camera = { ...defaultCamera(), x: 0, y: 0, zoom: 0.05 };
  const assert = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const settle = async () => {
    const start = performance.now();
    do {
      await renderer.render(document.layers, camera, size, 1);
      await renderer.submitted();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert(errors.length === 0, errors.join('\n'));
      assert(performance.now() - start < 60000, 'Virtual pages did not settle');
    } while (renderer.stats().virtual!.pending > 0);
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
  };
  try {
    const raw = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < raw.length; i += 4) raw.set([40, 120, 180, 255], i);
    const packed = packTile(raw);
    document.commit(
      Array.from({ length: 1025 }, (_, i) => ({
        layerId: document.active.id,
        key: i === 1024 ? '1000,1000' : `${(i % 32) - 16},${Math.floor(i / 32) - 16}`,
        before: undefined,
        after: packed.slice()
      }))
    );
    document.persist(store.capture);
    const saved = () => snapshotDocument(document.layers, document.active.id, camera);
    await store.save(saved());
    assert(store.stats().ramBytes <= 1024, 'Clean CPU tile cache exceeds budget');
    const writes = store.stats().writes;
    await store.save(saved());
    assert(store.stats().writes === writes, 'Camera-only checkpoint rewrote tile pixels');
    report(
      `PASS: ${writes} tile versions saved once; metadata-only saves write zero tiles; clean RAM stays within 1 KiB test budget`
    );
    const ref = document.active.tiles.get('-16,-16')!;
    assert(unpackTile(await store.read(ref))[1] === 120, 'Evicted tile did not reload');
    await store.collect(document.snapshots());
    assert((await store.read(ref)).byteLength === packed.byteLength, 'GC removed live undo/current pixels');
    await settle();
    const stats = renderer.stats().virtual!;
    assert(stats.drawCalls === 1 && stats.pages <= 16, `Expected batched overview, got ${JSON.stringify(stats)}`);
    const pixels = await readCanvas(canvas);
    const center = (256 * 512 + 256) * 4;
    assert(
      Math.abs(pixels[center]! - 40) <= 2 && Math.abs(pixels[center + 1]! - 120) <= 2,
      `Overview color is wrong: ${pixels.slice(center, center + 4)}`
    );
    const uploaded = stats.uploadedBytes;
    camera.angle = 0.05;
    await settle();
    assert(renderer.stats().virtual!.uploadedBytes === uploaded, 'Warm rotation uploaded existing pages again');
    report(
      `PASS: 1,024 source tiles render as ${renderer.debugPages().length} visible overview pages in one draw, ${stats.pages} resident including prefetch; warm rotation uploads zero pixels`
    );
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      camera.angle = i * 0.002;
      const start = performance.now();
      await renderer.render(document.layers, camera, size, 1);
      await renderer.submitted();
      times.push(performance.now() - start);
    }
    report(
      `MEASURE: 60 warm rotation frames, ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms mean CPU+GPU, ${times.sort((a, b) => a - b)[56]!.toFixed(2)} ms p95; ${(renderer.stats().virtual!.uploadedBytes - uploaded) / 1048576} MiB uploads`
    );
    const file = await writePaintFile(saved(), store.read);
    assert(file.size > 256 * 1048576, 'Large-file regression did not cross the old document limit');
    const reopened = await readPaintFile(file, async (pixels) => {
      const ref = store.capture(pixels);
      if (store.stats().dirtyBytes >= 8 * 1048576) await store.flush();
      return ref;
    });
    await store.flush();
    assert(
      reopened.layers[0]!.tiles.size === 1025 && store.stats().ramBytes <= 1024,
      'Large binary drawing failed to page in'
    );
    report('PASS: 256.25 MiB of dense pixels export/import through bounded tile batches');
    camera.zoom = 0.1;
    await renderer.render(document.layers, camera, size, 1);
    assert(renderer.stats().virtual!.fallbackPages > 0, 'Resident parent was not used while zooming in');
    await settle();
    report('PASS: zoom-in shows resident parent pages while details load');
    document.undo();
    renderer.reset();
    await settle();
    document.redo();
    renderer.reset();
    await settle();
    assert(document.active.tiles.size === 1025, 'Paged undo/redo lost tiles');
    // Check array-layer bindings and layer compositing independently of the tile count.
    document.changeLayer({ type: 'add' });
    const red = new Uint8Array(raw.length);
    for (let i = 0; i < red.length; i += 4) red.set([220, 30, 40, 255], i);
    document.commit([{ layerId: document.active.id, key: '0,0', before: undefined, after: packTile(red) }]);
    document.persist(store.capture);
    renderer.reset();
    camera.x = 128;
    camera.y = 128;
    camera.zoom = 1;
    camera.angle = 0;
    await settle();
    const layered = await readCanvas(canvas);
    assert(Math.abs(layered[center]! - 220) <= 2, `Layer array binding failed: ${layered.slice(center, center + 4)}`);
    report('PASS: paged undo/redo, negative coordinates, GPU array sampling and multiple-layer compositing');
    renderer.begin(document.active, { ...defaultBrush(), color: '#00ff00', hardness: 1, opacity: 1 });
    await renderer.paint([{ x: 128, y: 128, radius: 30, flow: 1 }]);
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    const preview = await readCanvas(canvas);
    document.commit(await renderer.finish());
    document.persist(store.capture);
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    const bridge = await readCanvas(canvas);
    assert(
      bridge[center + 1] === preview[center + 1] && bridge[center] === preview[center],
      'Completed stroke disappeared before overview refinement'
    );
    await settle();
    const final = await readCanvas(canvas);
    assert(final[center + 1] === preview[center + 1], 'Refined page lost the completed brush pixels');
    document.undo();
    renderer.reset();
    await settle();
    assert((await readCanvas(canvas))[center] === layered[center], 'Undo left stale painted pages');
    report('PASS: completed brush preview survives refinement and undo invalidates painted pages');
    report('ALL STREAMING CHECKS PASSED');
  } finally {
    renderer.destroy();
    await store.close();
    indexedDB.deleteDatabase(name);
  }
}

async function readCanvas(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}
