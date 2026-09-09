import { tgpu } from 'typegpu';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { unpackTile } from '../tilePixels';
import { createVirtualTexture } from './virtualTexture';

/** Real shader regression: one ready fine page beside cropped coarse fallback at negative coordinates. */
export async function verifyRefinement(report: (message: string) => void) {
  const root = await tgpu.init();
  const errors: string[] = [];
  root.device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  const document = createDocument();
  const source = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) source.set(x % 4 < 2 ? [128, 0, 0, 128] : [0, 0, 128, 128], (y * 256 + x) * 4);
  for (let y = -2; y < 0; y++) for (let x = -2; x < 0; x++) document.active.tiles.set(`${x},${y}`, source);
  const virtual = createVirtualTexture(
    root,
    async (data) => unpackTile(data as Uint8Array),
    () => {},
    (error) => errors.push(String(error))
  );
  const target = root.createTexture({ size: [512, 512], format: 'rgba8unorm' }).$usage('render');
  const buffer = root.device.createBuffer({
    size: 512 * 512 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  const camera = { ...defaultCamera(), x: -384, y: -384 };
  const draw = (side: number, stream = true) => {
    virtual.begin(document.layers);
    const encoder = root.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: root.unwrap(target).createView(), loadOp: 'clear', storeOp: 'store' }]
    });
    pass.setViewport(0, 0, side, side, 0, 1);
    virtual.draw(document.active, pass, camera, { width: side, height: side }, 1);
    pass.end();
    encoder.copyTextureToBuffer({ texture: root.unwrap(target) }, { buffer, bytesPerRow: 512 * 4 }, [512, 512]);
    root.device.queue.submit([encoder.finish()]);
    if (stream) virtual.end();
  };
  const pixels = async () => {
    await buffer.mapAsync(GPUMapMode.READ);
    const result = new Uint8Array(buffer.getMappedRange().slice(0));
    buffer.unmap();
    return result;
  };
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  try {
    await virtual.prepare(document.layers);
    const start = performance.now();
    do {
      draw(128);
      await root.device.queue.onSubmittedWorkDone();
      await new Promise((resolve) => setTimeout(resolve, 16));
      check(performance.now() - start < 10000, 'Fine page failed to load');
    } while (virtual.debug().some((page) => !page.resident || page.fallback));
    check(virtual.stats().pages === 2, 'Expected one coarse and one fine resident page');
    camera.x = -256;
    camera.y = -256;
    draw(512, false);
    const before = await pixels();
    const pixel = (data: Uint8Array, x: number, y: number) => [...data.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4)];
    check(pixel(before, 32, 32).join() === '128,0,0,128', `Ready detail hidden by parent: ${pixel(before, 32, 32)}`);
    check(pixel(before, 288, 32).join() === '64,0,64,128', `Incorrect parent UV crop: ${pixel(before, 288, 32)}`);
    for (let y = 32; y < 480; y++)
      for (let x = 32; x < 480; x++)
        check(before[(y * 512 + x) * 4 + 3] === 128, `Missing or incorrect alpha at ${x},${y}`);
    report(
      'PASS: ready fine stripes stay visible beside parent fallback; negative UV crops, quadrant boundaries and 50% alpha are correct'
    );
    do {
      draw(512);
      await root.device.queue.onSubmittedWorkDone();
      await new Promise((resolve) => setTimeout(resolve, 16));
      check(performance.now() - start < 10000, 'Refinement failed to finish');
    } while (virtual.debug().some((page) => !page.resident || page.fallback));
    const after = await pixels();
    check(pixel(after, 32, 32).join() === pixel(before, 32, 32).join(), 'Ready detail changed during refinement');
    check(pixel(after, 288, 32).join() === '128,0,0,128', 'Coarse remainder did not refine');
    check(virtual.stats().peakUploadBytes <= 4 * 258 * 258 * 4, 'Upload budget exceeded');
    check(errors.length === 0, errors.join('\n'));
    report(
      `PASS: remaining quadrants refine without changing ready pixels; ${virtual.stats().workYields} budget yields, peak upload ${virtual.stats().peakUploadBytes} bytes/window`
    );
  } finally {
    virtual.destroy();
    buffer.destroy();
    target.destroy();
    root.destroy();
  }
}
