import { tgpu } from 'typegpu';
import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createBrushResources, type BrushResource } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { texturedBrush } from '../composition/texturedBrushEngine';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';
import { createTexturedStamps } from './texturedStamps';

/** Checks actual textured GPU pixels, including preview, tile corners, readback and renderer recovery. */
export async function verifyTexturedBrush(report: (message: string) => void, loadTip: () => Promise<BrushResource>) {
  const canvas = new OffscreenCanvas(512, 512);
  let document = createDocument();
  const resources = createBrushResources();
  const errors: string[] = [];
  let renderer = await createPaintRenderer(canvas, (message) => errors.push(message), { cacheTiles: 4 });
  const camera = { ...defaultCamera(), x: 256, y: 256 };
  const size = { width: 512, height: 512 };
  const draw = async () => {
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    return readCanvas(canvas);
  };
  const begin = (id: string, angle = 0, tool: 'brush' | 'eraser' = 'brush', opacity = 0.5) => {
    const brush = {
      ...defaultBrush(),
      size: 128,
      pressureSize: false,
      flow: 1,
      opacity,
      mixing: 'classic' as const,
      tool
    };
    return createResourceSession(resources, (resources) =>
      texturedBrush.engine({
        brush,
        settings: texturedBrush.select({ tipId: id, angle }).settings,
        resources,
        layer: document.active,
        processor: createRawProcessor(),
        renderer
      })
    );
  };
  const sample = { x: 200, y: 200, pressure: 1, time: 0 };
  const alpha = (x: number, y: number) => {
    const tile = document.active.tiles.get(`${Math.floor(x / 256)},${Math.floor(y / 256)}`);
    return tile ? unpackTile(tile)[((y % 256) * 256 + (x % 256)) * 4 + 3]! : 0;
  };
  const assert = (value: boolean, message: string) => {
    if (!value) throw new Error(message);
  };
  try {
    const pixels = new Uint8Array(8 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) pixels[y * 8 + x] = 255;
    resources.put({ id: 'half', width: 8, height: 4, format: 'r8unorm', pixels });
    const stroke = begin('half');
    await stroke.add([sample]);
    const active = await draw();
    renderer.preview([{ x: 350, y: 350, radius: (64 * Math.hypot(8, 4)) / 8, flow: 1 }]);
    assert(
      (await draw()).some((value, i) => value !== active[i]),
      'Textured live tail did not render.'
    );
    renderer.preview([]);
    assert(
      (await draw()).every((value, i) => value === active[i]),
      'Removing the textured live tail changed actual ink.'
    );
    document.commit(await stroke.finish());
    const committed = await draw();
    assert(
      active.every((value, i) => value === committed[i]),
      'Textured stroke changed pixels on commit.'
    );
    assert(alpha(150, 180) >= 126 && alpha(150, 180) <= 129, 'Native coverage/opacity was not rasterized.');
    assert(alpha(240, 200) === 0 && alpha(150, 245) === 0, 'Tip transparency or native aspect ratio was lost.');
    assert(renderer.stats().brushTextures?.uploads === 1, 'First tip was not uploaded once.');
    report('PASS: native tip aspect, transparent pixels and opacity; active output equals committed pixels');
    const baseline = committed;
    const cancelled = begin('half', Math.PI / 2);
    await cancelled.add([{ ...sample, x: 320 }]);
    await draw();
    cancelled.cancel();
    assert(
      (await draw()).every((value, i) => value === baseline[i]),
      'Cancel changed the committed document.'
    );
    const rotated = begin('half', Math.PI / 2);
    await rotated.add([{ ...sample, x: 320 }]);
    document.commit(await rotated.finish());
    assert(alpha(320, 150) >= 126 && alpha(320, 250) === 0, 'Clockwise tip rotation is incorrect.');
    assert(renderer.stats().brushTextures?.uploads === 1, 'Same tip was uploaded again for another stroke.');
    report('PASS: rotated tip, cancellation and repeated strokes reuse the same GPU texture');
    resources.put({ id: 'square', width: 2, height: 2, format: 'r8unorm', pixels: new Uint8Array(4).fill(255) });
    const square = begin('square');
    await square.add([sample]);
    document.commit(await square.finish());
    assert(alpha(260, 260) >= 126, 'Rectangular corner was clipped while binning across tile boundaries.');
    document.undo();
    renderer.reset();
    assert(alpha(260, 260) === 0, 'Undo did not remove the textured corner.');
    document.redo();
    renderer.reset();
    assert(alpha(260, 260) >= 126, 'Redo did not restore the textured corner.');
    const eraser = begin('square', 0, 'eraser', 1);
    await eraser.add([sample]);
    document.commit(await eraser.finish());
    assert(alpha(260, 260) === 0, 'Textured eraser did not use destination-out.');
    document.undo();
    renderer.reset();
    const beforeRecovery = await draw();
    renderer.destroy();
    renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
    assert(
      (await draw()).every((value, i) => value === beforeRecovery[i]),
      'Recovery changed textured document pixels.'
    );
    const recoveredStroke = begin('half');
    await recoveredStroke.add([{ ...sample, x: 400, y: 400 }]);
    document.commit(await recoveredStroke.finish());
    assert(renderer.stats().brushTextures?.uploads === 1, 'Recovery did not rebuild its device-local tip texture.');
    report('PASS: tile corners, undo/redo, textured erasing and a new renderer preserve raster document behavior');
    const tip = await loadTip();
    document = createDocument();
    renderer.reset();
    resources.put({ ...tip, id: 'abr-fixture' });
    const abrStroke = begin('abr-fixture');
    await abrStroke.add([sample, { ...sample, x: 340, y: 300, time: 10 }]);
    document.commit(await abrStroke.finish());
    assert(document.active.tiles.size > 0, 'The actual ABR tip did not produce raster tiles.');
    await draw();
    report(`PASS: decoded repository ABR tip ${tip.width}×${tip.height} renders through the Studio engine`);
    await renderer.submitted();
    assert(errors.length === 0, errors.join('\n'));
    await verifyTextureCache();
    report('PASS: GPU tip LRU bounds mip memory and reuploads evicted textures');
    report('ALL TEXTURED BRUSH CHECKS PASSED');
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}

async function readCanvas(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(canvas);
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, copy.width, copy.height).data;
}

/** Use a tiny real-device cache to exercise eviction without allocating a large brush library. */
async function verifyTextureCache() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('GPU adapter unavailable for texture cache verification.');
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device });
  const cache = createTexturedStamps(root, 10);
  device.pushErrorScope('validation');
  const tip = (id: string): BrushResource => ({
    id,
    width: 2,
    height: 2,
    format: 'r8unorm',
    pixels: new Uint8Array(4).fill(255)
  });
  const a = tip('a'),
    b = tip('b'),
    c = tip('c');
  try {
    cache.prepare(a, 0);
    cache.prepare(b, 0);
    cache.prepare(c, 0);
    if (cache.stats().bytes !== 10 || cache.stats().textures !== 2)
      throw new Error('GPU cache exceeded its mip budget.');
    cache.prepare(b, 0);
    if (cache.stats().uploads !== 3) throw new Error('Resident GPU tip was reuploaded.');
    cache.prepare(a, 0);
    if (cache.stats().uploads !== 4) throw new Error('Evicted GPU tip was reused after destruction.');
    await device.queue.onSubmittedWorkDone();
    const error = await device.popErrorScope();
    if (error) throw new Error(error.message);
  } finally {
    cache.destroy();
    root.destroy();
    device.destroy();
  }
}
