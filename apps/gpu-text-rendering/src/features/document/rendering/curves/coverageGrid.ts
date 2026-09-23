import tgpu, { d, std } from 'typegpu';
import { coverageTableLayout } from './coverageTable';

/** Returns exact empty/full coverage only when the entire pixel is in a boundary-free cell. */
export const gridCoverage = tgpu.fn(
  [d.u32, d.vec2f, d.vec2f, d.vec2f],
  d.f32
)((firstCurve, point, dx, dy) => {
  'use gpu';
  const extent = std.mul(std.add(std.abs(dx), std.abs(dy)), 0.5);
  const low = std.sub(point, extent);
  const high = std.add(point, extent);

  if (high.x <= 0 || high.y <= 0 || low.x >= 1 || low.y >= 1) {
    return d.f32(0);
  }

  const offset = coverageTableLayout.$.grids[d.u32(firstCurve)]!;

  if (offset === 0 || low.x < 0 || low.y < 0 || high.x >= 1 || high.y >= 1) {
    return d.f32(-1);
  }

  const a = d.vec2u(std.mul(low, 32));
  const b = d.vec2u(std.mul(high, 32));

  if (a.x !== b.x || a.y !== b.y) {
    return d.f32(-1);
  }

  const cell = a.y * 32 + a.x;
  const value = (coverageTableLayout.$.grids[offset + (cell >> 4)]! >> ((cell & 15) * 2)) & 3;
  return std.select(d.f32(value), d.f32(-1), value > 1);
});
