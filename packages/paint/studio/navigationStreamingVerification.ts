import { defaultCamera, worldToScreen } from './camera';
import { createDocument } from './document';
import { createPaintRenderer } from './gpu/renderer';

/** Cold-transition regression. Deliberately stalls storage and verifies the very first zoomed frame. */
export async function verifyColdNavigation(report: (message: string) => void) {
  const document = createDocument({ paged: true });
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([70, 20, 5, 128], i);
  const ref = { storageId: crypto.randomUUID(), byteLength: pixels.byteLength };
  for (let y = -8; y < 8; y++) for (let x = -10; x < 10; x++) document.active.tiles.set(`${x},${y}`, ref);
  const canvas = new OffscreenCanvas(512, 512);
  const size = { width: 512, height: 512 };
  const camera = defaultCamera();
  const errors: string[] = [];
  let blocked = false;
  let release: () => void = () => {};
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), {
    virtualTexture: true,
    readTile: async () => {
      if (blocked) await gate;
      return pixels;
    },
    onError: (error) => errors.push(String(error))
  });
  const assert = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const settle = async () => {
    const start = performance.now();
    do {
      await renderer.render(document.layers, camera, size, 1);
      await renderer.submitted();
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert(performance.now() - start < 30000, 'Navigation page queue did not settle');
      assert(!errors.length, errors.join('\n'));
    } while (renderer.stats().virtual!.pending);
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
  };
  try {
    // Establish a fully rendered brush-like view before any overview has finished loading.
    await renderer.render(document.layers, camera, size, 1, true);
    blocked = true;
    await renderer.submitted();
    const original = await sample(canvas, 384, 384);
    for (const zoom of [0.5, 0.12, 0.05]) {
      if (zoom === 0.12) {
        size.width = 640;
        size.height = 400;
      }
      camera.zoom = zoom;
      camera.angle = 0.37;
      camera.mirrored = true;
      camera.x = 100;
      camera.y = 70;
      await renderer.render(document.layers, camera, size, 1);
      await renderer.submitted();
      const point = worldToScreen({ x: 128, y: 128 }, camera, size);
      const current = await sample(canvas, point.x, point.y);
      assert(
        current.every((byte, i) => Math.abs(byte - original[i]!) <= 2),
        `Cold zoom ${zoom} lost or double-blended previous pixels: ${current} vs ${original}`
      );
      assert(renderer.stats().virtual!.pending > 0, 'Cold zoom regression did not stall any texture loads');
    }
    report(
      'PASS: first frames at 50%, 12%, 5% retain the complete viewport with texture reads stalled, including pan/rotate/mirror, resize and translucent pixels'
    );
    blocked = false;
    release();
    size.width = 512;
    size.height = 512;
    await settle();
    // Traverse more fine pages than the 256-slot pool can hold. Coarse coverage must survive eviction.
    camera.zoom = 1;
    camera.angle = 0;
    camera.mirrored = false;
    for (let y = -7; y <= 7; y += 2)
      for (let x = -9; x <= 9; x += 2) {
        camera.x = x * 256;
        camera.y = y * 256;
        await settle();
      }
    const warm = renderer.stats().virtual!;
    assert(
      warm.pages === 256 && warm.coveragePages > 0 && warm.coveragePending === 0,
      'Test did not fill the pool with pinned overviews intact'
    );
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    blocked = true;
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 0.05;
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    const point = worldToScreen({ x: -1500, y: -1000 }, camera, size);
    const outsideOldView = await sample(canvas, point.x, point.y);
    assert(
      outsideOldView.every((byte, i) => Math.abs(byte - original[i]!) <= 2),
      'Fast zoom-out lost content outside the previous viewport after cache eviction'
    );
    assert(renderer.stats().virtual!.pending === 0, 'Pinned zoom-out required new tile reads');
    assert(!errors.length, errors.join('\n'));
    report(
      'PASS: after 80 pans fill and evict the 256-slot pool, first-frame 5% zoom shows offscreen content without loading any textures'
    );
  } finally {
    blocked = false;
    release();
    renderer.destroy();
  }
}

async function sample(canvas: OffscreenCanvas, x: number, y: number) {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return [...context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
}
