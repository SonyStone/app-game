import tgpu, { d, std } from 'typegpu';
import { viewLayout } from '../bindings';

/** Shared prefix-area tables for frequently reused outlines, bounded to 64 MiB. */
export const coverageTableLayout = tgpu.bindGroupLayout({
  offsets: { storage: d.arrayOf(d.u32), access: 'readonly' },
  areas: { storage: d.arrayOf(d.f32), access: 'readonly' },
  grids: { storage: d.arrayOf(d.u32), access: 'readonly' }
});

/**
 * Returns cached coverage and its blend weight; zero weight requests original-curve evaluation. A prepared table is
 * trusted fully once a pixel spans six of its cells and not at all below four. A magnified row table built on demand
 * (addressed by the second half of `offsets`, stored in the pool after the grids behind a header of its window and
 * grid) takes precedence once a pixel spans two of its cells in every direction and is trusted fully from three,
 * trading about 22/255 at edges for a fraction of the memory.
 */
export const tableCoverage = tgpu.fn(
  [d.u32, d.vec2f, d.vec2f, d.vec2f],
  d.vec2f
)((firstCurve, point, dx, dy) => {
  'use gpu';

  if (viewLayout.$.view.vectorOnly !== 0) {
    return d.vec2f(0);
  }

  const determinant = std.abs(dx.x * dy.y - dx.y * dy.x);
  const detail =
    coverageTableLayout.$.offsets[(std.arrayLength(coverageTableLayout.$.offsets) >> 1) + d.u32(firstCurve)]!;

  if (detail !== 0) {
    const base = detail - 1;
    // Each on-demand table covers a square window of the unit box, recorded as float bits before its grid: columns in
    // the low half of the last header word, rows in the high half.
    const origin = d.vec2f(
      std.bitcastU32toF32(coverageTableLayout.$.grids[base - 4]!),
      std.bitcastU32toF32(coverageTableLayout.$.grids[base - 3]!)
    );
    const extent = std.bitcastU32toF32(coverageTableLayout.$.grids[base - 2]!);
    const cells = coverageTableLayout.$.grids[base - 1]!;
    const grid = d.vec2f(d.f32(cells & 0xffff), d.f32(cells >> 16));
    const local = std.div(std.sub(point, origin), extent);
    const localDx = std.div(dx, extent);
    const localDy = std.div(dy, extent);
    const weight = std.smoothstep(2, 3, narrowestExtent(std.mul(localDx, grid), std.mul(localDy, grid)));
    const reachOut = std.mul(std.add(std.abs(localDx), std.abs(localDy)), 0.5);
    // A window narrower than the outline lacks coverage outside it; such pixels fall back to the source curves.
    const inside =
      extent >= 1 ||
      (local.x - reachOut.x >= 0 &&
        local.y - reachOut.y >= 0 &&
        local.x + reachOut.x <= 1 &&
        local.y + reachOut.y <= 1);

    if (weight > 0 && inside) {
      const covered = rowTableArea(base, grid, local, localDx, localDy);

      if (covered >= 0) {
        return d.vec2f(covered, weight);
      }
    }
  }

  const offset = coverageTableLayout.$.offsets[d.u32(firstCurve)]!;
  const size = std.select(
    std.select(d.f32(128), d.f32(64), (offset & 0x80000000) !== 0),
    d.f32(32),
    (offset & 0x40000000) !== 0
  );
  const weight = std.smoothstep(4, 6, size * narrowestExtent(dx, dy));

  if (offset === 0 || weight === 0) {
    return d.vec2f(0);
  }

  return d.vec2f(tableArea((offset & 0x3fffffff) - 1, size, point, dx, dy, determinant), weight);
});

/** The narrowest extent of the parallelogram spanned by `dx` and `dy`: its area over its largest singular value. */
function narrowestExtent(dx: d.v2f, dy: d.v2f) {
  'use gpu';
  const determinant = std.abs(dx.x * dy.y - dx.y * dy.x);
  const trace = std.dot(dx, dx) + std.dot(dy, dy);
  const largest = std.sqrt((trace + std.sqrt(std.max(0, trace * trace - 4 * determinant * determinant))) * 0.5);
  return determinant / std.max(largest, 1e-20);
}

/**
 * Box-filtered coverage of the pixel from the row table at word `base` with `grid` columns and rows: each row the
 * pixel spans contributes the difference of its running coverage at the pixel's left and right edges, taken at the
 * row's midline for rotated pixels. Returns -1 when the pixel spans more than {@link maxTableRows} rows, as in a much
 * minified view.
 */
function rowTableArea(base: number, grid: d.v2f, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  const columns = grid.x;
  const cellDx = std.mul(dx, grid);
  const cellDy = std.mul(dy, grid);
  const centre = std.mul(point, grid);
  const reach = std.mul(std.add(std.abs(cellDx), std.abs(cellDy)), 0.5);
  const low = std.sub(centre, reach);
  const high = std.add(centre, reach);
  const firstRow = std.max(0, std.floor(low.y));
  const lastRow = std.min(grid.y, std.ceil(high.y));

  if (lastRow - firstRow > maxTableRows) {
    return d.f32(-1);
  }

  // Matches rowTableUnits; TypeGPU divides integers as floats, so floor explicitly.
  const units = std.floor(65535 / columns);
  const cellArea = std.max(std.abs(cellDx.x * cellDy.y - cellDx.y * cellDy.x), 1e-20);

  // An unrotated (or quarter-turned) pixel spans the same cells in every row, so each row costs two reads.
  if (std.abs(cellDx.y) + std.abs(cellDy.x) < 1e-6 || std.abs(cellDx.x) + std.abs(cellDy.y) < 1e-6) {
    const left = std.clamp(low.x, 0, columns);
    const right = std.clamp(high.x, 0, columns);

    if (right <= left) {
      return d.f32(0);
    }

    const leftCell = d.u32(std.min(std.floor(left), columns - 1));
    const rightCell = d.u32(std.min(std.floor(right), columns - 1));
    const leftFraction = left - d.f32(leftCell);
    const rightFraction = right - d.f32(rightCell);
    let alignedArea = d.f32(0);

    for (let row = firstRow; row < lastRow; row += 1) {
      const height = std.min(row + 1, high.y) - std.max(row, low.y);
      const line = d.u32(row);
      alignedArea +=
        height *
        (rowInterpolated(base, columns, line, rightCell, rightFraction) -
          rowInterpolated(base, columns, line, leftCell, leftFraction));
    }

    return std.clamp(alignedArea / (units * cellArea), 0, 1);
  }

  const origin = std.sub(centre, std.mul(std.add(cellDx, cellDy), 0.5));
  let area = d.f32(0);

  for (let row = firstRow; row < lastRow; row += 1) {
    const bottom = std.max(row, low.y);
    const top = std.min(row + 1, high.y);

    if (top <= bottom) {
      continue;
    }

    const y = (bottom + top) * 0.5;
    let left = d.f32(1e20);
    let right = d.f32(-1e20);

    for (let edge = 0; edge < 4; edge++) {
      let a = d.vec2f(origin);
      let direction = d.vec2f(cellDx);

      if (edge === 1) {
        a = std.add(origin, cellDy);
      }

      if (edge >= 2) {
        direction = d.vec2f(cellDy);

        if (edge === 3) {
          a = std.add(origin, cellDx);
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

    // An axis-aligned pixel has no edge crossing its interior rows; its extent is the footprint's.
    if (left > right) {
      left = low.x;
      right = high.x;
    }

    left = std.clamp(left, 0, columns);
    right = std.clamp(right, 0, columns);

    if (right > left) {
      const line = d.u32(row);
      area += (top - bottom) * (rowRunning(base, columns, line, right) - rowRunning(base, columns, line, left));
    }
  }

  return std.clamp(area / (units * cellArea), 0, 1);
}

/** Running coverage of `line` up to fractional cell position `x`, in table units, interpolated within the cell. */
function rowRunning(base: number, columns: number, line: number, x: number) {
  'use gpu';
  const cell = d.u32(std.min(std.floor(x), columns - 1));
  return rowInterpolated(base, columns, line, cell, x - d.f32(cell));
}

/** Running coverage of `line` at `fraction` of the way through `cell`, in table units. */
function rowInterpolated(base: number, columns: number, line: number, cell: number, fraction: number) {
  'use gpu';
  const after = rowValue(base, columns, line, cell);
  const before = std.select(d.f32(0), rowValue(base, columns, line, cell - 1), cell > 0);
  return std.mix(before, after, fraction);
}

/** The running coverage stored after `cell` of `line`: a 16-bit half of a pool word. */
function rowValue(base: number, columns: number, line: number, cell: number) {
  'use gpu';
  const index = line * d.u32(columns) + cell;
  const word = coverageTableLayout.$.grids[d.u32(base) + (index >> 1)]!;
  return d.f32((word >> ((index & 1) * 16)) & 0xffff);
}

/** Box-filtered coverage of the pixel from the table at `base`, integrating rotated pixels in horizontal strips. */
function tableArea(base: number, size: number, point: d.v2f, dx: d.v2f, dy: d.v2f, determinant: number) {
  'use gpu';
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

  return std.clamp(area / std.max(determinant * size * size, 1e-20), 0, 1);
}

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

/** Most table rows one pixel may span before row tables defer to other coverage. */
const maxTableRows = 16;
