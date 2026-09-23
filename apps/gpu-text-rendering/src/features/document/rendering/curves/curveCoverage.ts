import { d, std } from 'typegpu';
import { Cubic, CurveInstance, curveLayout } from './curveBindings';
import { rectangleCoverage } from './rectangleCoverage';

/**
 * Integrates filled scanline lengths over the physical pixel, expressed in outline coordinates.
 * Both sides of a thin stroke contribute, including holes and overlapping nonzero/even-odd contours.
 * Rectangular fills use exact area clipping. Other outlines use 32 Gauss samples in Y;
 * this bounds per-pixel integration work without replacing the source cubic geometry.
 */
export function outlineCoverage(item: d.Infer<typeof CurveInstance>, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  const rectangle = rectangleCoverage(item, point, dx, dy);

  if (rectangle >= 0) {
    return rectangle;
  }

  const indexed = CoverageOutline({ first: item.info.x, count: item.info.y, rule: item.info.z, bins: item.bins });

  // A minified glyph spans many index rows. Scanning those duplicates costs more than
  // its short original curve list; row lookup pays off for magnified outlines instead.
  if (item.info.y <= 128 && std.abs(dx.y) + std.abs(dy.y) > 1 / 16) {
    indexed.bins = 0;
  }

  return integratedCoverage(indexed, point, dx, dy);
}

function integratedCoverage(item: d.Infer<typeof CoverageOutline>, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  const pixelArea = std.abs(dx.x * dy.y - dx.y * dy.x);
  const halfHeight = (std.abs(dx.y) + std.abs(dy.y)) * 0.5;
  const bottom = std.max(0, point.y - halfHeight);
  const top = std.min(1, point.y + halfHeight);

  if (top <= bottom || pixelArea < 1e-20) {
    return d.f32(0);
  }

  const uniform = uniformPixelCoverage(item, point, dx, dy);

  if (uniform >= 0) {
    return uniform;
  }

  let area = d.f32(0);
  const height = (top - bottom) / 16;

  for (let band = 0; band < 16; band++) {
    const middle = bottom + (d.f32(band) + 0.5) * height;
    const offset = height * 0.2886751345948129;
    area += height * 0.5 * scanlineArea(item, point, dx, dy, middle - offset);
    area += height * 0.5 * scanlineArea(item, point, dx, dy, middle + offset);
  }

  return std.clamp(area / pixelArea, 0, 1);
}

// Pixels whose bounds contain no contour boundary are entirely filled or empty.
// Endpoint bounds are conservative because the importer splits at both axes' extrema.
function uniformPixelCoverage(item: d.Infer<typeof CoverageOutline>, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  const extent = std.mul(std.add(std.abs(dx), std.abs(dy)), 0.5);
  const low = std.sub(point, extent);
  const high = std.add(point, extent);

  if (high.x <= 0 || low.x >= 1 || high.y <= 0 || low.y >= 1) {
    return d.f32(0);
  }

  const first = std.select(d.u32(0), d.u32(std.clamp(std.floor(low.y * 128), 0, 127)), item.bins !== 0);
  const last = std.select(d.u32(0), d.u32(std.clamp(std.floor(high.y * 128), 0, 127)), item.bins !== 0);
  const middle = std.select(d.u32(0), d.u32(std.clamp(std.floor(point.y * 128), 0, 127)), item.bins !== 0);
  let winding = d.i32(0);

  for (let row = first; row <= last; row++) {
    let start = d.u32(item.first);
    let count = d.u32(item.count);

    if (item.bins !== 0) {
      start = curveLayout.$.bins[item.bins + row * 2]!;
      count = curveLayout.$.bins[item.bins + row * 2 + 1]!;
    }

    for (let i = d.u32(0); i < count; i++) {
      let index = start + i;

      if (item.bins !== 0) {
        index = curveLayout.$.bins[index]!;
      }

      const curve = curveLayout.$.curves[index]!;
      const minimum = std.min(curve.p0, curve.p3);
      const maximum = std.max(curve.p0, curve.p3);

      if (minimum.x <= high.x && maximum.x >= low.x && minimum.y <= high.y && maximum.y >= low.y) {
        return d.f32(-1);
      }

      if (row === middle && maximum.x <= point.x && point.y >= minimum.y && point.y < maximum.y) {
        winding += std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);
      }
    }
  }

  const inside = std.select(winding !== 0, std.abs(winding) % 2 !== 0, item.rule === 1);
  return std.select(d.f32(0), d.f32(1), inside);
}

function scanlineArea(item: d.Infer<typeof CoverageOutline>, point: d.v2f, dx: d.v2f, dy: d.v2f, y: number) {
  'use gpu';
  const origin = std.sub(point, std.mul(std.add(dx, dy), 0.5));
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

    if (std.abs(direction.y) <= 1e-20) {
      continue;
    }

    const t = (y - a.y) / direction.y;

    if (t >= 0 && t <= 1) {
      const x = a.x + t * direction.x;
      left = std.min(left, x);
      right = std.max(right, x);
    }
  }

  left = std.max(left, 0);
  right = std.min(right, 1);
  const row = d.u32(std.clamp(std.floor(y * 128), 0, 127));
  let start = d.u32(item.first);
  let count = d.u32(item.count);

  if (item.bins !== 0) {
    start = curveLayout.$.bins[item.bins + row * 2]!;
    count = curveLayout.$.bins[item.bins + row * 2 + 1]!;
  }

  const cached = cachedScanlineArea(item, y, left, right, start, count);

  if (cached >= 0) {
    return cached;
  }

  let covered = d.f32(0);
  let cursor = d.f32(left);

  // Select successive crossings without a fixed-size array or a limit on contour complexity.
  for (let interval = d.u32(0); interval <= count && cursor < right; interval++) {
    let next = d.f32(right);
    let winding = d.i32(0);

    for (let i = d.u32(0); i < count; i++) {
      let index = start + i;

      if (item.bins !== 0) {
        index = curveLayout.$.bins[index]!;
      }

      const curve = curveLayout.$.curves[index]!;

      if (y < std.min(curve.p0.y, curve.p3.y) || y >= std.max(curve.p0.y, curve.p3.y)) {
        continue;
      }

      const direction = std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);

      if (std.max(curve.p0.x, curve.p3.x) <= cursor) {
        winding += direction;
        continue;
      }

      if (std.min(curve.p0.x, curve.p3.x) >= right) {
        continue;
      }

      const x = crossingX(curve, y);

      if (x <= cursor) {
        winding += direction;
      } else {
        next = std.min(next, x);
      }
    }

    let inside = winding !== 0;

    if (item.rule === 1) {
      inside = std.abs(winding) % 2 !== 0;
    }

    if (inside) {
      covered += next - cursor;
    }
    cursor = next;
  }

  return covered;
}

// Most glyph scanlines have only a handful of crossings. Solve each root once,
// then integrate their sorted intervals. Overflow uses the unrestricted path above.
function cachedScanlineArea(
  item: d.Infer<typeof CoverageOutline>,
  y: number,
  left: number,
  right: number,
  start: number,
  count: number
) {
  'use gpu';

  if (right <= left) {
    return d.f32(0);
  }

  const events = d.arrayOf(d.vec2f, 4)();
  let used = d.u32(0);
  let winding = d.i32(0);

  for (let i = d.u32(0); i < count; i++) {
    let index = d.u32(start) + i;

    if (item.bins !== 0) {
      index = curveLayout.$.bins[index]!;
    }

    const curve = curveLayout.$.curves[index]!;

    if (y < std.min(curve.p0.y, curve.p3.y) || y >= std.max(curve.p0.y, curve.p3.y)) {
      continue;
    }

    const direction = std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);

    if (std.max(curve.p0.x, curve.p3.x) <= left) {
      winding += direction;
      continue;
    }

    if (std.min(curve.p0.x, curve.p3.x) >= right) {
      continue;
    }

    const x = crossingX(curve, y);

    if (x <= left) {
      winding += direction;
      continue;
    }

    if (x >= right) {
      continue;
    }

    if (used === 4) {
      return d.f32(-1);
    }

    let slot = d.u32(used);

    while (slot > 0) {
      if (events[slot - 1]!.x <= x) {
        break;
      }

      events[slot] = d.vec2f(events[slot - 1]!);
      slot--;
    }

    events[slot] = d.vec2f(x, d.f32(direction));
    used++;
  }

  let covered = d.f32(0);
  let cursor = d.f32(left);

  for (let i = d.u32(0); i <= used; i++) {
    let next = d.f32(right);

    if (i < used) {
      next = events[i]!.x;
    }

    const inside = std.select(winding !== 0, std.abs(winding) % 2 !== 0, item.rule === 1);

    if (inside) {
      covered += next - cursor;
    }

    if (i < used) {
      winding += d.i32(events[i]!.y);
    }

    cursor = next;
  }

  return covered;
}

function crossingX(curve: d.Infer<typeof Cubic>, y: number) {
  'use gpu';

  if (curve.p0.x === curve.p1.x && curve.p0.x === curve.p2.x && curve.p0.x === curve.p3.x) {
    return curve.p0.x;
  }

  let left = d.f32(0);
  let right = d.f32(1);
  let t = d.f32((y - curve.p0.y) / (curve.p3.y - curve.p0.y));

  // Safeguarded Newton converges quickly on ordinary glyph edges. Bisection
  // retains a bracket at flat extrema and degenerate cubic parameterizations.
  for (let i = 0; i < 24; i++) {
    const a = std.mix(curve.p0.y, curve.p1.y, t);
    const b = std.mix(curve.p1.y, curve.p2.y, t);
    const c = std.mix(curve.p2.y, curve.p3.y, t);
    const ab = std.mix(a, b, t);
    const bc = std.mix(b, c, t);
    const value = std.mix(ab, bc, t);

    if (value === y) {
      break;
    }

    if (value < y === curve.p0.y < curve.p3.y) {
      left = t;
    } else {
      right = t;
    }

    const derivative = 3 * (bc - ab);
    let next = (left + right) * 0.5;

    if (std.abs(derivative) > 1e-20) {
      const candidate = t - (value - y) / derivative;

      if (candidate > left && candidate < right) {
        next = candidate;
      }
    }

    if (next === t) {
      break;
    }

    t = next;
  }

  const a = std.mix(curve.p0.x, curve.p1.x, t);
  const b = std.mix(curve.p1.x, curve.p2.x, t);
  const c = std.mix(curve.p2.x, curve.p3.x, t);
  return std.mix(std.mix(a, b, t), std.mix(b, c, t), t);
}

/** Geometry-only parameters keep transforms and paint data out of the coverage solver. */
const CoverageOutline = d.struct({ first: d.u32, count: d.u32, rule: d.u32, bins: d.u32 });
