import tgpu, { d, std } from 'typegpu';
import { viewLayout } from '../bindings';

/** Shared prefix-area tables for frequently reused outlines, bounded to 64 MiB. */
export const coverageTableLayout = tgpu.bindGroupLayout({
  offsets: { storage: d.arrayOf(d.u32), access: 'readonly' },
  areas: { storage: d.arrayOf(d.f32), access: 'readonly' },
  grids: { storage: d.arrayOf(d.u32), access: 'readonly' }
});

/** Returns cached coverage and its blend weight; zero weight requests original-curve evaluation. */
export const tableCoverage = tgpu.fn(
  [d.u32, d.vec2f, d.vec2f, d.vec2f],
  d.vec2f
)((firstCurve, point, dx, dy) => {
  'use gpu';
  const offset = coverageTableLayout.$.offsets[d.u32(firstCurve)]!;
  const size = std.select(
    std.select(d.f32(128), d.f32(64), (offset & 0x80000000) !== 0),
    d.f32(32),
    (offset & 0x40000000) !== 0
  );
  const determinant = std.abs(dx.x * dy.y - dx.y * dy.x);
  const trace = std.dot(dx, dx) + std.dot(dy, dy);
  const largest = std.sqrt((trace + std.sqrt(std.max(0, trace * trace - 4 * determinant * determinant))) * 0.5);
  const footprint = (size * determinant) / std.max(largest, 1e-20);
  const weight = std.smoothstep(4, 6, footprint);

  if (offset === 0 || weight === 0 || viewLayout.$.view.vectorOnly !== 0) {
    return d.vec2f(0);
  }

  const base = (offset & 0x3fffffff) - 1;
  const extent = std.mul(std.add(std.abs(dx), std.abs(dy)), 0.5);
  const low = std.sub(point, extent);
  const high = std.add(point, extent);

  let area = d.f32(0);

  if (std.abs(dx.y) + std.abs(dy.x) < 1e-8 || std.abs(dx.x) + std.abs(dy.y) < 1e-8) {
    area = rectangleArea(base, size, low, high);
  } else {
    // Integrate short horizontal strips through the rotated/sheared pixel.
    // Unlike a mip texel, each query includes only this pixel's source region.
    const origin = std.sub(point, std.mul(std.add(dx, dy), 0.5));
    const step = (high.y - low.y) / 8;
    let bottom = d.f32(low.y);
    const corners = d.vec2f(origin.y + dx.y, origin.y + dy.y);

    for (let strip = 0; strip < 12 && bottom < high.y; strip++) {
      let top = std.min(high.y, bottom + step);

      if (top <= bottom) {
        top = high.y;
      }

      for (let corner = 0; corner < 2; corner++) {
        if (corners[corner]! > bottom && corners[corner]! < top) {
          top = corners[corner]!;
        }
      }

      const y = (bottom + top) * 0.5;
      let left = d.f32(1e20);
      let right = d.f32(-1e20);

      for (let edge = 0; edge < 4; edge++) {
        let a = d.vec2f(origin);
        let direction = d.vec2f(dx);

        if (edge === 1) {
          a = std.add(origin, dy);
        }

        if (edge >= 2) {
          direction = d.vec2f(dy);

          if (edge === 3) {
            a = std.add(origin, dx);
          }
        }

        if (std.abs(direction.y) > 1e-20) {
          const t = (y - a.y) / direction.y;

          if (t >= 0 && t <= 1) {
            const x = a.x + t * direction.x;
            left = std.min(left, x);
            right = std.max(right, x);
          }
        }
      }
      area += rectangleArea(base, size, d.vec2f(left, bottom), d.vec2f(right, top));
      bottom = top;
    }
  }

  return d.vec2f(std.clamp(area / std.max(determinant * size * size, 1e-20), 0, 1), weight);
});

function rectangleArea(base: number, size: number, low: d.v2f, high: d.v2f) {
  'use gpu';
  return (
    prefixArea(base, size, high) -
    prefixArea(base, size, d.vec2f(low.x, high.y)) -
    prefixArea(base, size, d.vec2f(high.x, low.y)) +
    prefixArea(base, size, low)
  );
}

function prefixArea(base: number, size: number, point: d.v2f) {
  'use gpu';

  const p = std.clamp(std.mul(point, size), d.vec2f(0), d.vec2f(size));
  const cell = d.vec2u(std.min(std.floor(p), d.vec2f(size - 1)));
  const f = std.sub(p, d.vec2f(cell));
  const index = d.u32(base) + cell.y * d.u32(size + 1) + cell.x;
  return std.mix(
    std.mix(coverageTableLayout.$.areas[index]!, coverageTableLayout.$.areas[index + 1]!, f.x),
    std.mix(
      coverageTableLayout.$.areas[index + d.u32(size + 1)]!,
      coverageTableLayout.$.areas[index + d.u32(size + 2)]!,
      f.x
    ),
    f.y
  );
}
