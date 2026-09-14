import { describe, expect, it } from 'vitest';
import { cropTipRasterPlan, planTipRasterWrites } from '../../../packages/abr-brush/src/tipRasterPlan';
import { tipByteWriter } from '../../../packages/abr-brush/src/tipRasterWriter';
import { sampleTipSpan, type TipLevel } from '../../../packages/abr-brush/src/tipSampling';

/** Cropping must preserve ordered overwrites and the original fixed-point sampling phase. */
describe('tip raster plan cropping', () => {
  const level: TipLevel = { width: 16, height: 4,
    data: Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 255) };
  const plan = planTipRasterWrites(12, 4, (writer, target) => {
    for (let row = 0; row < 4; row++) writer.span({
      offset: row * target.stride, count: 12, x: 173, y: row * 65536,
      dx: 53123, dy: 0, sampling: { level: 0, fixed: 65536, blend: false }
    });
    writer.clear(target.stride + 3, target.stride + 7);
  });
  const full = render(plan);

  it.each([
    { x: 2, y: 1, width: 7, height: 2 },
    { x: -230, y: -240, width: 256, height: 256 },
    { x: 9, y: -2, width: 9, height: 8 },
    { x: -2, y: 3, width: 8, height: 5 },
    { x: 20, y: 20, width: 256, height: 256 },
    { x: -30, y: -30, width: 10, height: 10 }
  ])('preserves pixels for $x,$y in $width × $height', ({ x, y, width, height }) => {
    const cropped = cropTipRasterPlan(plan, x, y, width, height);
    const expected = Uint8Array.from({ length: width * height }, (_, i) => {
      const sx = x + i % width, sy = y + Math.floor(i / width);
      return sx >= 0 && sx < plan.width && sy >= 0 && sy < plan.height ? full[sy * plan.width + sx]! : 173;
    });
    expect(render(cropped)).toEqual(expected);
    const [first, end] = cropped.rowRange!;
    expect(cropped.rows.slice(0, first).every(row => !row.length)).toBe(true);
    expect(cropped.rows.slice(end).every(row => !row.length)).toBe(true);
    // Plans supplied without range metadata remain compatible, including a second crop.
    expect(cropTipRasterPlan({ ...plan, rowRange: undefined }, x, y, width, height)).toEqual(cropped);
    expect(render(plan)).toEqual(full);
  });

  it('preserves byte-writer ordering across repeated interval splits, clears and padding writes', () => {
    const width = 12, height = 4, stride = 16;
    const expected = new Uint8Array(stride * height).fill(173);
    const bytes = tipByteWriter([level], expected);
    const planned = planTipRasterWrites(width, height, writer => {
      for (let i = 0; i < 300; i++) {
        const offset = (i * 17) % expected.length;
        const count = Math.min(1 + (i * 7) % 20, expected.length - offset);
        if (i % 3 === 0) {
          writer.clear(offset, offset + count);
          bytes.clear(offset, offset + count);
        } else {
          const span = { offset, count, x: 173, y: 0, dx: 53123, dy: 0,
            sampling: { level: 0, fixed: 65536, blend: false } };
          writer.span(span);
          bytes.span(span);
        }
      }
    });
    expect(render(planned)).toEqual(Uint8Array.from({ length: width * height }, (_, i) =>
      expected[Math.floor(i / width) * stride + i % width]!));
  });

  function render(value: Pick<typeof plan, 'width' | 'height' | 'rows'>) {
    const pixels = new Uint8Array(value.width * value.height).fill(173);
    value.rows.forEach((row, y) => row.forEach(segment => {
      const at = y * value.width + segment.start, source = segment.source;
      if (source) sampleTipSpan([level], source.sampling, pixels, at, segment.count,
        source.x, source.y, source.dx, source.dy, source.options);
      else pixels.fill(0, at, at + segment.count);
    }));
    return pixels;
  }
});
