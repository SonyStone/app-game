import { defaultBrush } from '../brush';
import { defaultCamera, worldToScreen } from '../camera';
import { createDocument, type Layer } from '../document';
import { createPaintRenderer } from './renderer';

/** Checks active output replacement over a paged layer without loading the untouched full-resolution drawing. */
export async function verifyActivePreview(report: (message: string) => void) {
  const pixels = new Uint8Array(256 * 256 * 4);
  const bottomPixels = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels.set([70, 20, 5, 128], i);
    bottomPixels.set([100, 130, 160, 255], i);
  }
  const ref = { storageId: 'preview-source', byteLength: pixels.byteLength };
  const bottomRef = { storageId: 'preview-bottom', byteLength: bottomPixels.byteLength };
  const document = createDocument({ paged: true });
  document.active.opacity = 0.65;
  document.active.blend = 'multiply';
  const bottom: Layer = {
    id: 'bottom',
    name: 'Background',
    visible: true,
    opacity: 1,
    blend: 'normal',
    tiles: new Map()
  };
  for (let y = -16; y < 0; y++)
    for (let x = -16; x < 0; x++) {
      document.active.tiles.set(`${x},${y}`, ref);
      bottom.tiles.set(`${x},${y}`, bottomRef);
    }
  let layers = [bottom, ...document.layers];
  const canvas = new OffscreenCanvas(512, 512);
  const size = { width: 512, height: 512 };
  const camera = { ...defaultCamera(), x: -2048, y: -2048, zoom: 1 / 16 };
  const errors: string[] = [];
  let reads = 0;
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), {
    virtualTexture: true,
    cacheTiles: 4,
    readTile: async (data) => {
      reads++;
      return data instanceof Uint8Array ? data : data.storageId === ref.storageId ? pixels : bottomPixels;
    },
    onError: (error) => errors.push(String(error))
  });
  const brush = { ...defaultBrush(), color: '#ff3050', opacity: 0.4, flow: 1, hardness: 1 };
  const point = { x: -1920, y: -1920 };
  const draw = async (exact = false) => {
    renderer.invalidateView();
    await renderer.render(layers, camera, size, 1, exact);
    await renderer.submitted();
  };
  const compare = async (message: string, incremental = false) => {
    if (incremental) {
      await renderer.render(layers, camera, size, 1);
      await renderer.submitted();
    } else await draw();
    const actual = await readCanvas(canvas);
    await draw(true);
    const reference = await readCanvas(canvas);
    const center = worldToScreen(point, camera, size);
    let max = 0;
    for (let y = Math.floor(center.y) - 36; y <= center.y + 36; y++)
      for (let x = Math.floor(center.x) - 36; x <= center.x + 36; x++)
        for (let c = 0; c < 4; c++) {
          const index = (y * 512 + x) * 4 + c;
          max = Math.max(max, Math.abs(actual[index]! - reference[index]!));
        }
    if (max > 3) throw new Error(`${message}: preview differs from full-resolution reference by ${max}/255`);
    report(`PASS: ${message}; max difference ${max}/255 against original tile rendering`);
  };
  try {
    await renderer.prepareOverview(layers);
    await draw();
    const baseline = await readCanvas(canvas);
    const beforePaint = reads;
    renderer.begin(document.active, brush);
    await renderer.paint([{ ...point, radius: 48, flow: 1 }]);
    const afterPaint = reads;
    const start = performance.now();
    await draw();
    const elapsed = performance.now() - start;
    report(
      `256-tile active layer: paint reads ${afterPaint - beforePaint}; first active frame ${elapsed.toFixed(1)} ms, ${reads - afterPaint} untouched source reads`
    );
    if (reads !== afterPaint)
      throw new Error('Active preview loaded untouched source tiles instead of resident overviews');
    if (renderer.stats().previewTileDraws !== 1 || renderer.stats().sourceTileDraws !== 0)
      throw new Error('Active redraw did not isolate the one touched tile');
    await compare('translucent brush replaces committed pixels before layer opacity and Multiply');
    await draw();
    await renderer.paint([{ x: point.x + 100, y: point.y, radius: 48, flow: 1 }]);
    await compare('incremental redraw preserves earlier ink across a tile boundary', true);
    camera.zoom = 1 / 32;
    const beforeWide = reads;
    await draw();
    if (renderer.stats().sourceTileDraws !== 0 || reads !== beforeWide)
      throw new Error('Empty portions of a coarse page forced full-resolution fallback');
    report('PASS: farther zoom reuses fine coverage without loading empty portions of a parent');
    camera.zoom = 1 / 16;
    renderer.cancel();
    await draw();
    const cancelled = await readCanvas(canvas);
    if (cancelled.some((byte, i) => Math.abs(byte - baseline[i]!) > 1))
      throw new Error('Cancel left preview pixels behind');
    report('PASS: cancel restores the complete original image after active scratch eviction');

    renderer.begin(document.active, { ...brush, tool: 'eraser', opacity: 1 });
    await renderer.paint([{ ...point, radius: 256, flow: 1 }]);
    await compare('fully erased tiles replace the overview with transparency');
    camera.angle = 0.31;
    camera.mirrored = true;
    camera.zoom = 0.05;
    camera.x += 100;
    await compare('active eraser survives pan, rotation, mirror and 5% zoom');
    renderer.cancel();

    camera.angle = 0;
    camera.mirrored = false;
    camera.zoom = 1 / 16;
    camera.x = point.x;
    camera.y = point.y;
    renderer.begin(document.active, brush);
    await renderer.paint([{ ...point, radius: 48, flow: 1 }]);
    await draw();
    document.commit(await renderer.finish());
    layers = [bottom, ...document.layers];
    await renderer.prepareOverview(layers);
    await compare('commit hands active pixels to durable overviews');
    document.undo();
    renderer.reset();
    layers = [bottom, ...document.layers];
    await renderer.prepareOverview(layers);
    await compare('undo restores the original layer without preview');
    document.redo();
    renderer.reset();
    layers = [bottom, ...document.layers];
    await renderer.prepareOverview(layers);
    await compare('redo restores the committed stroke');

    // Provisional cells outside committed occupancy must still draw, and cancel must remove them.
    camera.x = 256;
    camera.y = 256;
    await draw();
    const empty = await readCanvas(canvas);
    renderer.begin(document.active, brush);
    await renderer.paint([{ x: 256, y: 256, radius: 48, flow: 1 }]);
    await draw();
    const added = await readCanvas(canvas);
    const center = (256 * 512 + 256) * 4;
    if (added[center + 1]! >= empty[center + 1]! - 10)
      throw new Error('New cells outside committed coverage did not render');
    renderer.cancel();
    await draw();
    const removed = await readCanvas(canvas);
    if (removed.some((byte, i) => byte !== empty[i])) throw new Error('Cancel retained provisional cells');
    if (errors.length) throw new Error(errors.join('\n'));
    report('PASS: provisional cells appear outside document coverage and disappear on cancel');
  } finally {
    renderer.destroy();
  }
}

async function readCanvas(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, copy.width, copy.height).data;
}
