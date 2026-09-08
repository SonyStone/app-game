import { tgpu, type TgpuRoot } from 'typegpu';
import { defaultBrush } from '../brush';
import { createDocument, type Layer } from '../document';
import { createPaintRenderer } from './renderer';

/** Actual cache integration: GPU pickup spans tile seams and observes real ink, not disposable previews. */
export async function verifyCanvasPickup(report: (message: string) => void) {
  const root = await tgpu.init();
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(256, 256), (message) => errors.push(message), {
    device: root.device,
    cacheTiles: 1
  });
  const document = createDocument();
  const solid = (color: number[]) => Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => color[i % 4]!);
  document.active.tiles.set('-1,0', solid([255, 0, 0, 255]));
  document.active.tiles.set('0,0', solid([0, 0, 255, 255]));
  const overlay: Layer = {
    id: 'overlay',
    name: 'Overlay',
    visible: true,
    opacity: 0.5,
    blend: 'normal',
    tiles: new Map([
      ['-1,0', solid([0, 128, 0, 128])],
      ['0,0', solid([0, 128, 0, 128])]
    ])
  };
  const hidden: Layer = {
    ...overlay,
    id: 'hidden',
    visible: false,
    opacity: 1,
    tiles: new Map([['0,0', solid([255, 255, 255, 255])]])
  };
  const region = { x: -128, y: 64, width: 256, height: 128 };
  const capture = async (layers: Layer[], allLayers = false) => {
    const patch = await renderer.captureRegion(region, layers, allLayers);
    return readPatch(root, patch);
  };
  const checkPixel = (pixels: Uint8Array, x: number, y: number, expected: number[]) => {
    const pixel = pixels.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4);
    if (pixel.some((value, channel) => Math.abs(value - expected[channel]!) > 1))
      throw new Error(`Canvas pickup at ${x},${y}: ${pixel}; expected ${expected}.`);
  };
  try {
    document.active.opacity = 0.25;
    let pixels = await capture([document.active]);
    for (const x of [0, 64, 126, 127]) checkPixel(pixels, x, 64, [255, 0, 0, 255]);
    for (const x of [128, 129, 192, 255]) checkPixel(pixels, x, 64, [0, 0, 255, 255]);
    document.active.opacity = 1;
    pixels = await capture([document.active, overlay, hidden], true);
    checkPixel(pixels, 64, 64, [191, 64, 0, 255]);
    checkPixel(pixels, 192, 64, [0, 64, 191, 255]);
    overlay.blend = 'multiply';
    pixels = await capture([document.active, overlay], true);
    checkPixel(pixels, 64, 64, [191, 0, 0, 255]);
    checkPixel(pixels, 192, 64, [0, 0, 191, 255]);
    renderer.begin(document.active, {
      ...defaultBrush(),
      color: '#000000',
      opacity: 1,
      flow: 1,
      hardness: 1,
      mixing: 'classic'
    });
    await renderer.paint([{ x: -32, y: 128, radius: 16, flow: 1 }]);
    renderer.preview([{ x: 32, y: 128, radius: 16, flow: 1 }]);
    const beforePickup = renderer.stats().readback.batches;
    pixels = await capture([document.active]);
    checkPixel(pixels, 96, 64, [0, 0, 0, 255]);
    checkPixel(pixels, 160, 64, [0, 0, 255, 255]);
    if (renderer.stats().readback.batches !== beforePickup)
      throw new Error('Read-only pickup evicted writable brush state to sample a committed neighbour.');
    const readbacks = renderer.stats().readback.batches;
    pixels = await capture([document.active]);
    checkPixel(pixels, 96, 64, [0, 0, 0, 255]);
    if (renderer.stats().readback.batches !== readbacks)
      throw new Error('Pickup read back unchanged active ink after reloading it only for sampling.');
    renderer.cancel();
    pixels = await capture([document.active]);
    checkPixel(pixels, 96, 64, [255, 0, 0, 255]);
    const blank = await renderer.captureRegion({ x: 512, y: 512, width: 256, height: 128 }, [document.active]);
    if ((await readPatch(root, blank)).some(Boolean))
      throw new Error('Canvas pickup reused stale pixels in an empty region.');
    const large = await renderer.captureRegion({ x: -256, y: 0, width: 4096, height: 256 }, [document.active]);
    if (large.width > 1024 || large.height > 1024) throw new Error('Canvas pickup exceeded its texture budget.');
    const small = await renderer.captureRegion(region, [document.active]);
    checkPixel(await readPatch(root, small), 64, 64, [255, 0, 0, 255]);
    await root.device.queue.onSubmittedWorkDone();
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'Canvas pickup: negative tile seam, single/all-layer opacity, Multiply, hidden layers, active ink, preview exclusion, cancellation and resized/empty regions passed with a one-tile cache.'
    );
  } finally {
    renderer.destroy();
    root.destroy();
    root.device.destroy();
  }
}

/** Verification-only readback. Painting consumes the GPU texture directly. */
async function readPatch(
  root: TgpuRoot,
  patch: Awaited<ReturnType<Awaited<ReturnType<typeof createPaintRenderer>>['captureRegion']>>
) {
  const bytesPerRow = Math.ceil((patch.width * 4) / 256) * 256;
  const buffer = root.device.createBuffer({
    size: bytesPerRow * patch.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  try {
    const encoder = root.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: root.unwrap(patch.texture) }, { buffer, bytesPerRow }, [
      patch.width,
      patch.height
    ]);
    root.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange());
    const result = new Uint8Array(patch.width * patch.height * 4);
    for (let y = 0; y < patch.height; y++)
      result.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + patch.width * 4), y * patch.width * 4);
    return result;
  } finally {
    buffer.destroy();
  }
}
