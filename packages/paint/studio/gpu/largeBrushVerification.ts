import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { unpackTile } from '../tilePixels';
import { tileWireframe } from '../CanvasDebug';
import { createPaintRenderer } from './renderer';

/** Exercises a 512px active stroke larger than the scratch cache, including repeated redraw and revisits. */
export async function verifyLargeBrush(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  let maps = 0,
    textures = 0,
    submissions = 0;
  const createTexture = device.createTexture.bind(device);
  device.createTexture = (descriptor) => {
    textures++;
    return createTexture(descriptor);
  };
  const submit = device.queue.submit.bind(device.queue);
  device.queue.submit = (commands) => {
    submissions++;
    submit(commands);
  };
  const createBuffer = device.createBuffer.bind(device);
  device.createBuffer = (descriptor) => {
    const buffer = createBuffer(descriptor);
    const map = buffer.mapAsync.bind(buffer);
    buffer.mapAsync = (...args) => {
      maps++;
      return map(...args);
    };
    return buffer;
  };
  const errors: string[] = [];
  const sources = new Map<string, Uint8Array>();
  let sourceReads = 0;
  const canvas = new OffscreenCanvas(512, 512);
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), {
    device,
    virtualTexture: true,
    readTile: async (data) => {
      sourceReads++;
      return data instanceof Uint8Array ? data : sources.get(data.storageId)!.slice();
    }
  });
  const document = createDocument({ paged: true });
  const camera = { ...defaultCamera(), x: 3450, y: 1000, zoom: 0.05 };
  const size = { width: 512, height: 512 };
  try {
    renderer.begin(document.active, { ...defaultBrush(), size: 512, hardness: 1, opacity: 0.5 });
    const start = performance.now();
    const initialTextures = textures,
      initialSubmissions = submissions;
    for (let row = 0; row < 4; row++) {
      await renderer.paint(Array.from({ length: 24 }, (_, i) => ({ x: i * 300, y: row * 650, radius: 256, flow: 1 })));
    }
    await renderer.submitted();
    const tiles = renderer.debugTiles(document.layers);
    report(
      `512px stroke: ${tiles.length} touched tiles, ${renderer.stats().residentTiles} scratch tiles, ${(performance.now() - start).toFixed(1)} ms paint, ${maps} readback maps; ${textures - initialTextures} new textures, ${submissions - initialSubmissions} GPU submissions`
    );
    if (textures - initialTextures > 128 * 3)
      throw new Error('Large stroke keeps allocating scratch textures after filling its pool');
    if (submissions - initialSubmissions > 128)
      throw new Error('Large stroke no longer batches independent GPU passes');
    const readback = renderer.stats().readback;
    if (readback.buffers > 2 || readback.bytes > 16 * 1048576)
      throw new Error('Eviction readback staging exceeded its budget');
    report(
      `Eviction staging: ${readback.buffers} buffers, ${readback.bytes / 1048576} MiB, ${readback.pending} pending, ${readback.capacityWaits} capacity waits`
    );
    let debugMs = 0;
    const before = maps;
    const drawStart = performance.now();
    for (let i = 0; i < 4; i++) {
      renderer.invalidateView();
      await renderer.render(document.layers, camera, size, 1);
      await renderer.submitted();
      const debugStart = performance.now();
      tileWireframe(tiles, camera, size);
      debugMs += performance.now() - debugStart;
    }
    report(
      `Four active redraws: ${(performance.now() - drawStart).toFixed(1)} ms, ${maps - before} readback maps; wireframe geometry ${debugMs.toFixed(1)} ms`
    );
    if (maps !== before) throw new Error('Displaying the active stroke evicted brush masks and read GPU pixels');
    // A revisited evicted tile must keep its accumulated mask and stroke-level opacity.
    await renderer.paint([{ x: 0, y: 0, radius: 256, flow: 1 }]);
    document.commit(await renderer.finish());
    for (const [x, y] of [
      [0, 0],
      [6900, 1950]
    ]) {
      const data = document.active.tiles.get(`${Math.floor(x! / 256)},${Math.floor(y! / 256)}`)!;
      const offset = ((y! % 256) * 256 + (x! % 256)) * 4 + 3;
      if (Math.abs(unpackTile(data)[offset]! - 128) > 1)
        throw new Error('Large stroke lost pixels or reapplied opacity');
    }
    if (renderer.stats().residentTiles > 128) throw new Error('Scratch tile budget grew');
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'PASS: full active redraws perform zero readbacks; revisits preserve pixels and opacity within the 128-tile scratch budget'
    );
    document.persist((data) => {
      if (!(data instanceof Uint8Array)) return data;
      const storageId = crypto.randomUUID();
      sources.set(storageId, data);
      return { storageId, byteLength: data.byteLength };
    });
    renderer.reset();
    await renderer.prepareOverview(document.layers);
    await renderer.render(document.layers, camera, size, 1, true);
    renderer.begin(document.active, { ...defaultBrush(), size: 512 });
    await renderer.paint([{ x: 0, y: 0, radius: 256, flow: 1 }]);
    await renderer.render(document.layers, camera, size, 1);
    const readsBefore = sourceReads;
    renderer.invalidateView();
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    if (sourceReads !== readsBefore) throw new Error('Warm active redraw loaded immutable source tiles again');
    if (errors.length) throw new Error(errors.join('\n'));
    report('PASS: painting over a paged document reuses warm display textures with zero source reads on redraw');
  } finally {
    renderer.destroy();
    device.destroy();
  }
}
