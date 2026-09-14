import { createPatternRasterGpu } from '@app-game/abr-brush/patternRasterGpu';
import { createPatternPyramid } from '@app-game/abr-brush/patternPyramid';
import { rasterizePatternRegion } from '@app-game/abr-brush/patternRaster';
import { tgpu } from 'typegpu';

/** Verifies repeated pattern writes preserve preceding readers within and across submissions. */
export async function verifyPatternRegions(report: (message: string) => void) {
  const root = await tgpu.init();
  const source = { width: 31, height: 23,
    data: Uint8Array.from({ length: 31 * 23 }, (_, i) => (i * 71 + Math.floor(i / 31) * 23) & 255) };
  const levels = createPatternPyramid(source);
  const raster = createPatternRasterGpu(root, source);
  const region = raster.createRegion(64, 64);
  const outputs: { buffer: GPUBuffer; expected: Uint8Array }[] = [];
  const uploads: ReturnType<typeof raster.record>[] = [];
  root.device.pushErrorScope('validation');
  try {
    // One destination is overwritten several times before submission. Each copy
    // must see its own coordinates, including large and negative document positions.
    for (let submission = 0; submission < 2; submission++) {
      const encoder = root.device.createCommandEncoder();
      for (const [index, scale] of [.6, .13, 2.3, 1].entries()) {
        const bounds = { x: -300001 + index * 257 + submission * 256,
          y: 100000 + index * 139 - submission * 256, width: 64, height: 64 };
        const origin = { x: .37, y: -.18 };
        uploads.push(raster.record(encoder, region, scale, bounds, origin));
        const buffer = root.device.createBuffer({ size: 64 * 64 * 4,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        outputs.push({ buffer, expected: rasterizePatternRegion(levels, scale, bounds, origin).data });
        encoder.copyTextureToBuffer({ texture: root.unwrap(region.texture) },
          { buffer, bytesPerRow: 256 }, { width: 64, height: 64 });
      }
      root.device.queue.submit([encoder.finish()]);
      for (const upload of uploads.splice(0)) upload.destroy();
    }
    for (const { buffer, expected } of outputs) {
      await buffer.mapAsync(GPUMapMode.READ);
      const pixels = new Uint8Array(buffer.getMappedRange());
      for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] !== expected[Math.floor(i / 4)])
          throw new Error(`Pattern reuse changed byte ${i}: ${pixels[i]} vs ${expected[Math.floor(i / 4)]}.`);
      }
      buffer.unmap();
    }
    const error = await root.device.popErrorScope();
    if (error) throw new Error(error.message);
    report('Pattern regions: eight CPU-equivalent images from one reused texture, across two submissions.');
  } finally {
    for (const upload of uploads) upload.destroy();
    for (const { buffer } of outputs) buffer.destroy();
    region.destroy(); raster.destroy(); root.destroy();
  }
}
