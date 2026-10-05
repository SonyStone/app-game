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
  return coverage(item, point, dx, dy, false);
}

/**
 * Coverage of a clip outline. Like {@link outlineCoverage}, except that a single straight edge parallel to the
 * pixel's sides is resolved at the pixel center instead of anti-aliased. Print PDFs draw one image or shape several
 * times under abutting clip polygons; anti-aliasing both sides of a shared edge leaves about a quarter of the
 * paper visible, a light hairline. Curved, diagonal and rotated edges, and corners, stay anti-aliased.
 */
export function clipOutlineCoverage(item: d.Infer<typeof CurveInstance>, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  return coverage(item, point, dx, dy, true);
}

function coverage(item: d.Infer<typeof CurveInstance>, point: d.v2f, dx: d.v2f, dy: d.v2f, snapAxisEdges: boolean) {
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

  return integratedCoverage(indexed, point, dx, dy, snapAxisEdges);
}

function integratedCoverage(
  item: d.Infer<typeof CoverageOutline>,
  point: d.v2f,
  dx: d.v2f,
  dy: d.v2f,
  snapAxisEdges: boolean
) {
  'use gpu';
  const pixelArea = std.abs(dx.x * dy.y - dx.y * dy.x);
  const halfHeight = (std.abs(dx.y) + std.abs(dy.y)) * 0.5;
  const bottom = std.max(0, point.y - halfHeight);
  const top = std.min(1, point.y + halfHeight);

  if (top <= bottom || pixelArea < 1e-20) {
    return d.f32(0);
  }

  // Clip outlines skip chords: snapping their axis-parallel edges needs the per-scanline fractions below.
  const simple = simplePixelCoverage(item, point, dx, dy, !snapAxisEdges);

  if (simple >= 0) {
    return simple;
  }

  let area = d.f32(0);
  const height = (top - bottom) / 16;
  // Per-scanline covered fractions of the pixel width. A vertical edge covers every scanline equally;
  // a horizontal one covers each scanline fully or not at all.
  const width = std.abs(dx.x) + std.abs(dy.x);
  let lowest = d.f32(1);
  let highest = d.f32(0);
  let partial = false;

  for (let band = 0; band < 16; band++) {
    const middle = bottom + (d.f32(band) + 0.5) * height;
    const offset = height * 0.2886751345948129;
    const first = scanlineArea(item, point, dx, dy, middle - offset);
    const second = scanlineArea(item, point, dx, dy, middle + offset);
    area += height * 0.5 * (first + second);
    const a = first / std.max(width, 1e-20);
    const b = second / std.max(width, 1e-20);
    lowest = std.min(lowest, std.min(a, b));
    highest = std.max(highest, std.max(a, b));
    partial = partial || (a > 0.001 && a < 0.999) || (b > 0.001 && b < 0.999);
  }

  const result = std.clamp(area / pixelArea, 0, 1);
  const aligned = std.min(std.abs(dx.y) + std.abs(dy.x), std.abs(dx.x) + std.abs(dy.y)) <= width * 0.001;

  if (snapAxisEdges && aligned && (highest - lowest < 0.001 || !partial)) {
    return std.select(d.f32(0), d.f32(1), result >= 0.5);
  }

  return result;
}

/**
 * Coverage of pixels that need no scanline integration, or -1. Pixels whose bounds contain no contour boundary are
 * entirely filled or empty. With `chords`, an axis-aligned pixel crossed by one segment that is straight at the
 * pixel's scale, as along the edges of a magnified figure, is split by the segment's chord (exact within 1/64 pixel),
 * and one crossed by a horizontal edge spanning it is split at the edge's height. The importer splits curves at both
 * axes' extrema, so every segment is monotonic in x and y.
 */
function simplePixelCoverage(
  item: d.Infer<typeof CoverageOutline>,
  point: d.v2f,
  dx: d.v2f,
  dy: d.v2f,
  chords: boolean
) {
  'use gpu';
  const extent = std.mul(std.add(std.abs(dx), std.abs(dy)), 0.5);
  const low = std.sub(point, extent);
  const high = std.add(point, extent);

  if (high.x <= 0 || low.x >= 1 || high.y <= 0 || low.y >= 1) {
    return d.f32(0);
  }

  const aligned = chords && std.abs(dx.y) + std.abs(dy.x) <= (std.abs(dx.x) + std.abs(dy.y)) * 1e-4;
  const tolerance = std.min(high.x - low.x, high.y - low.y) / 64;
  let crossed = false;
  let crossedIndex = d.u32(0);
  // Share of the pixel where the chord's segment is not left of the point, so the winding below excludes it.
  let uncounted = d.f32(0);
  let chordWinding = d.i32(0);
  let edgeY = d.f32(-1);

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

      // A pixel spanning two index rows meets its chord's segment in both.
      if (crossed && index === crossedIndex) {
        continue;
      }

      const curve = curveLayout.$.curves[index]!;
      const minimum = std.min(curve.p0, curve.p3);
      const maximum = std.max(curve.p0, curve.p3);
      const side = segmentSide(curve, point, extent);

      if (side < 0) {
        if (!aligned || crossed) {
          return d.f32(-1);
        }

        // A horizontal edge spanning the pixel's columns splits it at its height.
        if (maximum.y <= minimum.y) {
          if (minimum.x > low.x || maximum.x < high.x) {
            return d.f32(-1);
          }

          crossed = true;
          crossedIndex = index;
          edgeY = minimum.y;
          continue;
        }

        // Otherwise the segment must span the pixel's rows and be straight at its scale.
        if (minimum.y > low.y || maximum.y < high.y) {
          return d.f32(-1);
        }

        const a = crossing(curve, low.y);
        const b = crossing(curve, high.y);
        const width = high.x - low.x;
        let share = chordShare((a.x - low.x) / width, (b.x - low.x) / width);
        let span = b.y - a.y;

        // A shallow segment, as near the top of a circle, is straighter across the pixel's columns than its rows.
        if (std.abs(b.x - a.x) > width) {
          if (minimum.x > low.x || maximum.x < high.x) {
            return d.f32(-1);
          }

          const height = high.y - low.y;
          const leftEnd = crossingAtX(curve, low.x);
          const rightEnd = crossingAtX(curve, high.x);
          const below = chordShare((leftEnd.x - low.y) / height, (rightEnd.x - low.y) / height);
          // Below a rising segment, its crossing at the point's height lies to the left.
          share = std.select(below, 1 - below, (curve.p3.x - curve.p0.x) * (curve.p3.y - curve.p0.y) > 0);
          span = rightEnd.y - leftEnd.y;
        }

        // A chord replaces the segment within 0.75 × its largest control-point second difference × Δt².
        const bend = std.max(
          std.length(std.add(std.sub(curve.p0, std.mul(curve.p1, 2)), curve.p2)),
          std.length(std.add(std.sub(curve.p1, std.mul(curve.p2, 2)), curve.p3))
        );

        if (0.75 * bend * span * span > tolerance) {
          return d.f32(-1);
        }

        crossed = true;
        crossedIndex = index;
        uncounted = share;
        chordWinding = std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);
        continue;
      }

      if (row === middle && side === 1 && point.y >= minimum.y && point.y < maximum.y) {
        winding += std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);
      }
    }
  }

  if (!crossed) {
    return windingCoverage(winding, item.rule);
  }

  if (edgeY >= 0) {
    return edgeCoverage(item, point, extent, edgeY, crossedIndex);
  }

  return (
    uncounted * windingCoverage(winding, item.rule) +
    (1 - uncounted) * windingCoverage(winding + chordWinding, item.rule)
  );
}

/**
 * Whether a monotonic segment passes left of the pixel at `point` with half-size `extent` within its rows (1), right
 * of it or beside its rows (0), or may cross it (-1).
 */
export function segmentSide(curve: d.Infer<typeof Cubic>, point: d.v2f, extent: d.v2f) {
  'use gpu';
  const quick = hullSide(curve, point, extent);

  if (quick >= 0) {
    return quick;
  }

  const low = std.sub(point, extent);
  const high = std.add(point, extent);
  const minimum = std.min(curve.p0, curve.p3);
  const maximum = std.max(curve.p0, curve.p3);

  if (maximum.y <= minimum.y) {
    return d.i32(-1);
  }

  // A magnified curve's bounds can cover much of the screen. Within the pixel's rows, a monotonic segment
  // spans only the x between its crossings at the band's ends; outside that range it passes beside the pixel.
  const a = crossingX(curve, std.clamp(low.y, minimum.y, maximum.y));
  const b = crossingX(curve, std.clamp(high.y, minimum.y, maximum.y));

  if (std.min(a, b) <= high.x && std.max(a, b) >= low.x) {
    return d.i32(-1);
  }

  return std.select(d.i32(0), d.i32(1), std.max(a, b) < low.x);
}

/**
 * {@link segmentSide} from bounds and control-point hulls alone, without solving for crossings: -1 whenever the box
 * may be crossed. A segment stays within the hull of its control points, so a box wholly to one side of the band the
 * hull spans across its chord is not crossed, and that side decides whether the segment passes left of it.
 */
export function hullSide(curve: d.Infer<typeof Cubic>, point: d.v2f, extent: d.v2f) {
  'use gpu';
  const low = std.sub(point, extent);
  const high = std.add(point, extent);
  const minimum = std.min(curve.p0, curve.p3);
  const maximum = std.max(curve.p0, curve.p3);

  if (minimum.x > high.x || maximum.x < low.x || minimum.y > high.y || maximum.y < low.y) {
    return std.select(d.i32(0), d.i32(1), maximum.x <= point.x);
  }

  const chord = std.sub(curve.p3, curve.p0);
  const normal = d.vec2f(chord.y, -chord.x);
  const bulge1 = std.dot(normal, std.sub(curve.p1, curve.p0));
  const bulge2 = std.dot(normal, std.sub(curve.p2, curve.p0));
  const side = std.dot(normal, std.sub(point, curve.p0));
  const radius = std.abs(normal.x) * extent.x + std.abs(normal.y) * extent.y;

  if (side - radius > std.max(0, std.max(bulge1, bulge2))) {
    return std.select(d.i32(0), d.i32(1), chord.y > 0);
  }

  if (side + radius < std.min(0, std.min(bulge1, bulge2))) {
    return std.select(d.i32(0), d.i32(1), chord.y < 0);
  }

  return d.i32(-1);
}

/**
 * Coverage of a pixel split by the horizontal edge at `edgeY` (segment `edge`), which no other segment crosses: the
 * windings just inside its bottom and top weighted by their sides of the edge, or -1 when segments passing left of
 * the pixel start or end anywhere else within its rows.
 */
function edgeCoverage(item: d.Infer<typeof CoverageOutline>, point: d.v2f, extent: d.v2f, edgeY: number, edge: number) {
  'use gpu';
  const low = std.sub(point, extent);
  const high = std.add(point, extent);
  const bottomY = std.mix(low.y, high.y, 0.001);
  const topY = std.mix(low.y, high.y, 0.999);
  const bottomRow = std.select(d.u32(0), d.u32(std.clamp(std.floor(bottomY * 128), 0, 127)), item.bins !== 0);
  const topRow = std.select(d.u32(0), d.u32(std.clamp(std.floor(topY * 128), 0, 127)), item.bins !== 0);
  let bottomWinding = d.i32(0);
  let topWinding = d.i32(0);

  for (let row = bottomRow; row <= topRow; row++) {
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

      if (index === edge || maximum.y <= minimum.y || segmentSide(curve, point, extent) !== 1) {
        continue;
      }

      const direction = std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);

      if (row === bottomRow && bottomY >= minimum.y && bottomY < maximum.y) {
        bottomWinding += direction;
      }

      if (row === topRow && topY >= minimum.y && topY < maximum.y) {
        topWinding += direction;
      }

      // Segments passing left may only start or end at the edge's height, as at the corners it joins.
      const startsInside = minimum.y > bottomY && minimum.y < topY && minimum.y !== edgeY;
      const endsInside = maximum.y > bottomY && maximum.y < topY && maximum.y !== edgeY;

      if (startsInside || endsInside) {
        return d.f32(-1);
      }
    }
  }

  const below = std.clamp((edgeY - low.y) / (high.y - low.y), 0, 1);
  return below * windingCoverage(bottomWinding, item.rule) + (1 - below) * windingCoverage(topWinding, item.rule);
}

/** Whether `winding` is inside under fill `rule` (1 even-odd, otherwise nonzero), as 0 or 1. */
export function windingCoverage(winding: number, rule: number) {
  'use gpu';
  const inside = std.select(winding !== 0, std.abs(winding) % 2 !== 0, rule === 1);
  return std.select(d.f32(0), d.f32(1), inside);
}

/**
 * Share of a pixel on the low side of a straight chord that crosses its two opposite edges at `bottom` and `top`,
 * measured across the pixel in pixel sizes from its low side: the mean of the clamped crossing, in closed form.
 */
function chordShare(bottom: number, top: number) {
  'use gpu';

  if (std.abs(top - bottom) < 1e-4) {
    return std.clamp((bottom + top) * 0.5, 0, 1);
  }

  return (clampedIntegral(top) - clampedIntegral(bottom)) / (top - bottom);
}

/** Antiderivative of clamp(u, 0, 1). */
function clampedIntegral(u: number) {
  'use gpu';
  return std.select(std.select(u * u * 0.5, u - 0.5, u > 1), d.f32(0), u < 0);
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
  return crossing(curve, y).x;
}

/** Where a y-monotonic segment crosses height `y`: its x and curve parameter. */
function crossing(curve: d.Infer<typeof Cubic>, y: number) {
  'use gpu';

  // A vertical line needs no root; its parameter is estimated linearly.
  if (curve.p0.x === curve.p1.x && curve.p0.x === curve.p2.x && curve.p0.x === curve.p3.x) {
    return d.vec2f(curve.p0.x, std.clamp((y - curve.p0.y) / (curve.p3.y - curve.p0.y), 0, 1));
  }

  const t = rootParameter(d.vec4f(curve.p0.y, curve.p1.y, curve.p2.y, curve.p3.y), y);
  return d.vec2f(bezier(d.vec4f(curve.p0.x, curve.p1.x, curve.p2.x, curve.p3.x), t), t);
}

/** Where an x-monotonic segment crosses `x`: its y and curve parameter. */
function crossingAtX(curve: d.Infer<typeof Cubic>, x: number) {
  'use gpu';

  // A horizontal line needs no root; its parameter is estimated linearly.
  if (curve.p0.y === curve.p1.y && curve.p0.y === curve.p2.y && curve.p0.y === curve.p3.y) {
    return d.vec2f(curve.p0.y, std.clamp((x - curve.p0.x) / (curve.p3.x - curve.p0.x), 0, 1));
  }

  const t = rootParameter(d.vec4f(curve.p0.x, curve.p1.x, curve.p2.x, curve.p3.x), x);
  return d.vec2f(bezier(d.vec4f(curve.p0.y, curve.p1.y, curve.p2.y, curve.p3.y), t), t);
}

/** Parameter where the monotonic cubic with control values `c` reaches `value`. */
function rootParameter(c: d.v4f, value: number) {
  'use gpu';
  let left = d.f32(0);
  let right = d.f32(1);
  let t = d.f32((value - c.x) / (c.w - c.x));

  // Safeguarded Newton converges quickly on ordinary glyph edges. Bisection
  // retains a bracket at flat extrema and degenerate cubic parameterizations.
  for (let i = 0; i < 24; i++) {
    const a = std.mix(c.x, c.y, t);
    const b = std.mix(c.y, c.z, t);
    const e = std.mix(c.z, c.w, t);
    const ab = std.mix(a, b, t);
    const be = std.mix(b, e, t);
    const current = std.mix(ab, be, t);

    if (current === value) {
      break;
    }

    if (current < value === c.x < c.w) {
      left = t;
    } else {
      right = t;
    }

    const derivative = 3 * (be - ab);
    let next = (left + right) * 0.5;

    if (std.abs(derivative) > 1e-20) {
      const candidate = t - (current - value) / derivative;

      if (candidate > left && candidate < right) {
        next = candidate;
      }
    }

    if (next === t) {
      break;
    }

    t = next;
  }

  return t;
}

/** The cubic with control values `c` at parameter `t`. */
function bezier(c: d.v4f, t: number) {
  'use gpu';
  const a = std.mix(c.x, c.y, t);
  const b = std.mix(c.y, c.z, t);
  const e = std.mix(c.z, c.w, t);
  return std.mix(std.mix(a, b, t), std.mix(b, e, t), t);
}

/** Geometry-only parameters keep transforms and paint data out of the coverage solver. */
const CoverageOutline = d.struct({ first: d.u32, count: d.u32, rule: d.u32, bins: d.u32 });
