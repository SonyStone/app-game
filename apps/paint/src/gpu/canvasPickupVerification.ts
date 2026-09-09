import { tgpu, type TgpuRoot } from 'typegpu';
import { defaultBrush } from '../brush';
import { createDocument, type Layer } from '../document';
import { packTile } from '../tilePixels';
import { createCanvasPickup } from './canvasPickup';
import { createPaintRenderer } from './renderer';
import { verifyViewMipmaps } from './viewMipmapsVerification';

/** Actual cache integration: GPU pickup spans tile seams and observes real ink, not disposable previews. */
export async function verifyCanvasPickup(report: (message: string) => void) {
  const root = await tgpu.init();
  const errors: string[] = [];
  const emptyPixels = packTile(new Uint8Array(256 * 256 * 4));
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), {
    device: root.device,
    cacheTiles: 1,
    readTile: async (source) => {
      if (!(source instanceof Uint8Array) && source.storageId === 'empty-qa') return emptyPixels;
      throw new Error('Unexpected stored tile in pickup verification.');
    }
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
    // A saved empty tile must still clear the previous capture, without allocating a display texture.
    for (const stored of [false, true]) {
      document.active.tiles.set('2,2', stored ? { storageId: 'empty-qa', byteLength: 8 } : emptyPixels);
      await capture([document.active]);
      const displayTiles = renderer.stats().displayTiles;
      const patch = await renderer.captureRegion({ x: 512, y: 512, width: 256, height: 128 }, [document.active]);
      if ((await readPatch(root, patch)).some(Boolean) || renderer.stats().displayTiles !== displayTiles)
        throw new Error('Packed empty pickup retained old pixels or allocated a display texture.');
    }
    // The committed snapshot is empty, but the resident texture now contains live ink.
    document.active.tiles.set('2,2', emptyPixels);
    renderer.begin(document.active, { ...defaultBrush(), color: '#ff0000', opacity: 1, flow: 1, hardness: 1 });
    await renderer.paint([{ x: 544, y: 544, radius: 16, flow: 1 }]);
    const live = await renderer.captureRegion({ x: 512, y: 512, width: 256, height: 128 }, [document.active]);
    checkPixel(await readPatch(root, live), 32, 32, [255, 0, 0, 255]);
    renderer.cancel();
    document.active.tiles.delete('2,2');
    const large = await renderer.captureRegion({ x: -256, y: 0, width: 4096, height: 256 }, [document.active]);
    if (large.width > 1024 || large.height > 1024) throw new Error('Canvas pickup exceeded its texture budget.');
    const small = await renderer.captureRegion(region, [document.active]);
    checkPixel(await readPatch(root, small), 64, 64, [255, 0, 0, 255]);
    await verifyPickupBatches(root, document.active);
    await verifyDeferredMipmaps(root, renderer, canvas);
    await verifyViewMipmaps(root);
    await verifyPickupMipLevels(root);
    await root.device.queue.onSubmittedWorkDone();
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'Canvas pickup: negative tile seam, single/all-layer opacity, Multiply, hidden layers, active ink, preview exclusion, cancellation, resized/empty regions, 64-tile batches, recycled source textures, packed empty sources, deferred/demand-generated pickup mipmaps and batched/adaptive/full-chain presentation across zoom/edits passed.'
    );
  } finally {
    renderer.destroy();
    root.destroy();
    root.device.destroy();
  }
}

/** Fractional/non-square minification and live edits must sample exactly like the full mip-chain reference. */
async function verifyPickupMipLevels(root: TgpuRoot) {
  const errors: string[] = [];
  const run = async (optimized: boolean) => {
    const renderer = await createPaintRenderer(new OffscreenCanvas(32, 32), (error) => errors.push(error), {
      device: root.device,
      batchedMipmaps: optimized,
      adaptivePickupMipmaps: optimized
    });
    const document = createDocument();
    const pixels = Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => {
      const pixel = Math.floor(i / 4),
        alpha = (pixel * 17) % 256;
      return [pixel % (alpha + 1), (pixel * 3) % (alpha + 1), (pixel * 7) % (alpha + 1), alpha][i % 4]!;
    });
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 7; x++) document.active.tiles.set(`${x},${y}`, pixels);
    const frames: Uint8Array[] = [];
    try {
      renderer.begin(document.active, { ...defaultBrush(), color: '#ff3300', size: 100 });
      for (const width of [1023.9, 1024.1, 1450.3, 2048.1, 4096.5]) {
        await renderer.paint([{ x: width / 10, y: 100, radius: 50, flow: 0.6 }]);
        const patch = await renderer.captureRegion({ x: -193.25, y: -120.75, width, height: 769.33 }, document.layers);
        frames.push(await readPatch(root, patch));
      }
      renderer.cancel();
      return frames;
    } finally {
      renderer.destroy();
    }
  };
  const reference = await run(false),
    actual = await run(true);
  for (const [index, pixels] of reference.entries())
    if (pixels.length !== actual[index]!.length || pixels.some((value, byte) => value !== actual[index]![byte]))
      throw new Error(`Demand-generated pickup mipmaps changed fractional capture ${index}.`);
  if (errors.length) throw new Error(errors.join('\n'));
}

/** Full-resolution Smooth pickup must still allow later Classic minification and zoomed-out display. */
async function verifyDeferredMipmaps(
  root: TgpuRoot,
  renderer: Awaited<ReturnType<typeof createPaintRenderer>>,
  canvas: OffscreenCanvas
) {
  const pixels = Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => {
    const x = Math.floor(i / 4) % 256,
      y = Math.floor(i / 1024);
    return ((x + y) % 2 ? [255, 0, 0, 255] : [0, 0, 255, 255])[i % 4]!;
  });
  const region = { x: 0, y: 0, width: 2048, height: 256 };
  const check = (actual: Uint8Array | Uint8ClampedArray, expected: number, phase: string) => {
    if (
      Math.abs(actual[0]! - expected) > 1 ||
      Math.abs(actual[2]! - expected) > 1 ||
      actual[1] !== 0 ||
      actual[3] !== 255
    )
      throw new Error(`${phase}: checkerboard should be ${expected},0,${expected},255; got ${actual}.`);
  };
  for (const phase of ['classic', 'display', 'coarse'] as const) {
    const layer: Layer = {
      id: `deferred-mips-${phase}`,
      name: phase,
      visible: true,
      opacity: 1,
      blend: 'normal',
      tiles: new Map(Array.from({ length: 8 }, (_, x) => [`${x},0`, pixels]))
    };
    if (phase !== 'coarse') {
      const patch = await renderer.captureRegion(region, [layer], false, false, true);
      const result = await readPatch(root, patch);
      const offset = (64 * patch.width + 64) * 4;
      check(result.subarray(offset, offset + 4), 188, 'Smooth full-resolution pickup');
    }
    if (phase === 'classic') {
      const patch = await renderer.captureRegion(region, [layer]);
      const result = await readPatch(root, patch);
      const offset = (64 * patch.width + 64) * 4;
      check(result.subarray(offset, offset + 4), 128, 'Classic after Smooth pickup');
    } else {
      await renderer.render(
        [layer],
        { x: 128, y: 128, zoom: 0.5, angle: 0, mirrored: false },
        { width: 256, height: 256 },
        1
      );
      await renderer.submitted();
      const copy = new OffscreenCanvas(256, 256).getContext('2d')!;
      copy.drawImage(canvas, 0, 0);
      check(copy.getImageData(128, 128, 1, 1).data, 128, `${phase} minification`);
    }
  }
}

/** More than one uniform-pool cycle, then a cache that overwrites its only texture on every lookup. */
async function verifyPickupBatches(root: TgpuRoot, layer: Layer) {
  const images = Array.from({ length: 3 }, () =>
    root.createTexture({ size: [256, 256], format: 'rgba8unorm' }).$usage('sampled', 'render')
  );
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255]
  ];
  const pixels = colors.map((color) => Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => color[i % 4]!));
  const upload = (slot: number, color: number) =>
    root.device.queue.writeTexture(
      { texture: root.unwrap(images[slot]!) },
      pixels[color]!,
      { bytesPerRow: 1024 },
      [256, 256]
    );
  let recycle = false;
  let fail = false;
  const pickup = createCanvasPickup(root, async (_layer, key, _minify, flush) => {
    const x = Number(key.split(',')[0]) + 32;
    if (fail && x === 3) throw new Error('Expected pickup failure');
    if (recycle) {
      flush(images[0]);
      upload(0, x % 2);
      return images[0];
    }
    // An unrelated eviction must not split the 32-source batch.
    flush(images[2]);
    return images[x % 2];
  });
  const capture = () => pickup.capture({ x: -8192, y: 0, width: 16384, height: 256 }, [layer], { linear: true });
  try {
    upload(0, 0);
    upload(1, 1);
    // Failed asynchronous lookup must leave the next capture usable and cleared.
    fail = true;
    let rejected = false;
    try {
      await capture();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Expected pickup failure') throw error;
      rejected = true;
    }
    if (!rejected) throw new Error('Pickup did not report its source error.');
    fail = false;
    for (const reused of [false, true]) {
      recycle = reused;
      const submit = root.device.queue.submit;
      let submissions = 0;
      root.device.queue.submit = function (buffers) {
        submissions++;
        return submit.call(this, buffers);
      };
      let patch;
      try {
        patch = await capture();
      } finally {
        root.device.queue.submit = submit;
      }
      if (submissions !== (reused ? 64 : 2))
        throw new Error(`Pickup ${reused ? 'recycled' : 'unrelated'} invalidation submitted ${submissions} batches.`);
      const actual = await readPatch(root, patch);
      for (let y = 0; y < patch.height; y++)
        for (let x = 0; x < patch.width; x++) {
          const color = colors[Math.floor(x / (patch.width / 64)) % 2]!;
          for (let c = 0; c < 4; c++)
            if (actual[(y * patch.width + x) * 4 + c] !== color[c])
              throw new Error(`Pickup ${reused ? 'recycled' : 'batched'} source changed pixel ${x},${y}.`);
        }
    }
  } finally {
    pickup.destroy();
    for (const image of images) image.destroy();
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
