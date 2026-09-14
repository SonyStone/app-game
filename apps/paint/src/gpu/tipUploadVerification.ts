import { planSampledTip, rasterizeSampledTip, secondaryTipTransform } from '@app-game/abr-brush/sampledTipRaster';
import { createTipPyramid } from '@app-game/abr-brush/tipPyramid';
import { createTipRasterGpu, tipRasterKernel, tipRasterOutputLayout } from '@app-game/abr-brush/tipRasterGpu';
import { d, tgpu } from 'typegpu';

/** Checks packed uploads against CPU sampling, including empty rows, varied target sizes and queued batches. */
export async function verifyTipUploads(report: (message: string) => void) {
  const root = await tgpu.init();
  const levels = createTipPyramid({ width: 11, height: 10,
    data: Uint8Array.from({ length: 110 }, (_, i) => i % 5 ? (i * 71) & 255 : 0) });
  const raster = createTipRasterGpu(root, levels);
  const cases = [
    { width: 64, height: 256, x: 30, y: 120, scale: 1, angle: 21 },
    { width: 31, height: 19, x: 3, y: 2, scale: 0.7, angle: 0 },
    { width: 57, height: 43, x: 30, y: 28, scale: 2.3, angle: 79 },
    { width: 9, height: 7, x: 100, y: 100, scale: 1, angle: 0 }
  ].map(c => {
    const transform = secondaryTipTransform(levels[0]!, { x: c.x, y: c.y }, c.scale, c.angle);
    const stride = Math.ceil((c.width + 4) / 4) * 4;
    const pixels = new Uint8Array(stride * c.height).fill(173);
    rasterizeSampledTip(levels, transform, pixels,
      { offset: 0, stride, width: c.width, height: c.height, secondary: true });
    const expected = Array.from({ length: c.width * c.height }, (_, i) =>
      pixels[Math.floor(i / c.width) * stride + i % c.width]!);
    return { plan: planSampledTip(levels, transform, c.width, c.height, 0, 0, true), expected };
  });
  const batches: { upload: ReturnType<typeof raster.prepare>; output: ReturnType<typeof makeOutput>; expected: number[] }[] = [];
  const empty = raster.prepare([]);
  try {
    // Prepare both uploads before submitting either. Later preparation must not overwrite earlier rows.
    for (const ordered of [cases, cases.slice().reverse()]) {
      const upload = raster.prepare(ordered.map(c => c.plan));
      batches.push({ upload, output: makeOutput(upload.length), expected: ordered.flatMap(c => c.expected) });
    }
    const encoder = root.device.createCommandEncoder();
    const pipeline = root.createComputePipeline({ compute: tipRasterKernel });
    for (const batch of batches) {
      pipeline.with(batch.upload.group).with(root.createBindGroup(tipRasterOutputLayout,
        { destinations: batch.upload.destinations, output: batch.output })).with(encoder).dispatchWorkgroups(8, 32, cases.length);
    }
    root.device.queue.submit([encoder.finish()]);
    for (const batch of batches) batch.upload.release();
    // Queue reuse before reading earlier outputs. Queue writes must follow submitted
    // readers, and empty rows must not retain spans from the previous larger upload.
    const sparse = [cases[3]!, cases[1]!];
    const recycled = raster.prepare(sparse.map(c => c.plan));
    const output = makeOutput(recycled.length);
    batches.push({ upload: recycled, output, expected: sparse.flatMap(c => c.expected) });
    const next = root.device.createCommandEncoder();
    pipeline.with(recycled.group).with(root.createBindGroup(tipRasterOutputLayout,
      { destinations: recycled.destinations, output })).with(next).dispatchWorkgroups(8, 32, sparse.length);
    root.device.queue.submit([next.finish()]);
    recycled.release();
    if (raster.pooledBytes > 4 * 1024 * 1024) throw new Error('Tip upload pool exceeded its memory budget.');
    for (const batch of batches) {
      const actual = await batch.output.read();
      if (actual.length !== batch.expected.length || actual.some((value, i) => value !== batch.expected[i]))
        throw new Error('Packed tip uploads changed sampled pixels or overwrote a queued batch.');
    }
    // Direct affine uploads omit exterior zero spans. Compare against a zeroed CPU
    // mask over varied angles, subpixel placement, scales and negative coordinates.
    const affineCases = Array.from({ length: 96 }, (_, index) => {
      const tip = secondaryTipTransform(levels[0]!, { x: -37 + index * .137, y: 17 - index * .213 },
        [.13, .4, 1, 2.7][index % 4]!, [0, 1, 33, 89, 179, 291][index % 6]!);
      const x = Math.floor(tip.bounds.left / 4) * 4, y = tip.bounds.top;
      const width = tip.bounds.right - x, height = tip.bounds.bottom - y;
      const stride = Math.ceil((width + 4) / 4) * 4;
      const pixels = new Uint8Array(stride * height);
      rasterizeSampledTip(levels, tip, pixels, { offset: 0, stride, width, height, originX: x, originY: y });
      const expected = Array.from({ length: width * height }, (_, i) => pixels[Math.floor(i / width) * stride + i % width]!);
      return { tip, expected };
    });
    const directCases = affineCases.filter(c => {
      const probe = raster.prepareAffine([c.tip]);
      probe?.release();
      return !!probe;
    });
    if (directCases.length < 48) throw new Error('Direct affine upload unexpectedly rejected most test tips.');
    for (const ordered of [directCases, directCases.slice(0, 3)]) {
      const upload = raster.prepareAffine(ordered.map(c => c.tip));
      if (!upload) throw new Error('Convex affine tip unexpectedly required the general planner.');
      const output = root.createBuffer(d.arrayOf(d.u32, upload.length)).$usage('storage');
      batches.push({ upload, output, expected: ordered.flatMap(c => c.expected) });
      pipeline.with(upload.group).with(root.createBindGroup(tipRasterOutputLayout,
        { destinations: upload.destinations, output })).dispatchWorkgroups(8, 8, ordered.length);
      upload.release();
      const actual = await output.read();
      if (actual.some((value, index) => value !== batches.at(-1)!.expected[index]))
        throw new Error('Direct affine upload changed CPU mask coverage.');
    }
    const projected = { ...affineCases[0]!.tip, quad: affineCases[0]!.tip.quad.map(v => [...v.slice(0, 4), 1] as [number, number, number, number, number]) };
    if (raster.prepareAffine([projected])) throw new Error('Perspective tip must use the general planner.');
    if (empty.length !== 0) throw new Error('Empty tip upload contains pixels.');
    report(`Tip uploads: CPU-equivalent pixels, queued/recycled buffers, ${directCases.length} direct affine masks and perspective fallback passed.`);
  } finally {
    empty.destroy();
    for (const batch of batches) { batch.upload.destroy(); batch.output.destroy(); }
    raster.destroy();
    root.destroy();
  }

  function makeOutput(length: number) {
    return root.createBuffer(d.arrayOf(d.u32, length),
      buffer => new Uint32Array(buffer.arrayBuffer).fill(173)).$usage('storage');
  }
}
