import { d, std } from 'typegpu';
import { CurveInstance, curveLayout } from './curveBindings';

/** Exact pixel area for one or two rectangular contours; returns -1 for other outlines. */
export function rectangleCoverage(item: d.Infer<typeof CurveInstance>, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';

  if (item.info.y !== 4 && item.info.y !== 8) {
    return d.f32(-1);
  }

  const first = rectangleBounds(item.info.x);

  if (first.z <= first.x || first.w <= first.y) {
    return d.f32(-1);
  }

  const pixelArea = std.abs(dx.x * dy.y - dx.y * dy.x);

  if (pixelArea < 1e-20) {
    return d.f32(0);
  }

  let area = clippedArea(first, point, dx, dy);

  if (item.info.y === 8) {
    const second = rectangleBounds(item.info.x + 4);

    if (second.z <= second.x || second.w <= second.y) {
      return d.f32(-1);
    }

    const intersection = d.vec4f(std.max(first.xy, second.xy), std.min(first.zw, second.zw));
    const opposite = rectangleDirection(item.info.x) * rectangleDirection(item.info.x + 4) < 0;

    if (item.info.z === 1 || opposite) {
      area = differenceArea(first, intersection, point, dx, dy) + differenceArea(second, intersection, point, dx, dy);
    } else {
      area += differenceArea(second, intersection, point, dx, dy);
    }
  }

  return std.clamp(area / pixelArea, 0, 1);
}

function rectangleBounds(first: number) {
  'use gpu';
  let minimum = d.vec2f(1e20);
  let maximum = d.vec2f(-1e20);

  for (let i = d.u32(0); i < 4; i++) {
    const edge = curveLayout.$.curves[d.u32(first) + i]!;
    const next = curveLayout.$.curves[d.u32(first) + ((i + 1) % 4)]!;
    const horizontal = edge.p0.y === edge.p3.y && edge.p1.y === edge.p0.y && edge.p2.y === edge.p0.y;
    const vertical = edge.p0.x === edge.p3.x && edge.p1.x === edge.p0.x && edge.p2.x === edge.p0.x;

    const turns = (horizontal && next.p0.y !== next.p3.y) || (vertical && next.p0.x !== next.p3.x);

    if ((!horizontal && !vertical) || (horizontal && vertical) || !turns || !std.all(std.eq(edge.p3, next.p0))) {
      return d.vec4f(1, 1, 0, 0);
    }

    minimum = std.min(minimum, edge.p0);
    maximum = std.max(maximum, edge.p0);
  }

  return d.vec4f(minimum, maximum);
}

/** Green's theorem with edges clipped in Y and their X integral clamped to the rectangle. */
function clippedArea(rectangle: d.v4f, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';

  if (rectangle.z <= rectangle.x || rectangle.w <= rectangle.y) {
    return d.f32(0);
  }

  const origin = std.sub(point, std.mul(std.add(dx, dy), 0.5));
  const width = rectangle.z - rectangle.x;
  let area = d.f32(0);

  for (let i = 0; i < 4; i++) {
    let start = d.vec2f(origin);
    let direction = d.vec2f(dx);

    if (i === 1) {
      start = std.add(origin, dx);
      direction = d.vec2f(dy);
    } else if (i === 2) {
      start = std.add(origin, std.add(dx, dy));
      direction = std.neg(dx);
    } else if (i === 3) {
      start = std.add(origin, dy);
      direction = std.neg(dy);
    }

    if (std.abs(direction.y) < 1e-20) {
      continue;
    }

    const low = std.max(rectangle.y, std.min(start.y, start.y + direction.y));
    const high = std.min(rectangle.w, std.max(start.y, start.y + direction.y));

    if (high <= low) {
      continue;
    }

    const a = start.x - rectangle.x + ((low - start.y) / direction.y) * direction.x;
    const b = start.x - rectangle.x + ((high - start.y) / direction.y) * direction.x;
    const left = std.min(a, b);
    const right = std.max(a, b);
    const span = right - left;
    let average = std.clamp(left, 0, width);

    if (span > 1e-20) {
      const enter = std.clamp(-left / span, 0, 1);
      const leave = std.clamp((width - left) / span, 0, 1);
      const from = std.clamp(left + span * enter, 0, width);
      const to = std.clamp(left + span * leave, 0, width);
      average = (from + to) * 0.5 * (leave - enter) + width * (1 - leave);
    }

    area += std.select(d.f32(-1), d.f32(1), direction.y > 0) * (high - low) * average;
  }

  return std.abs(area);
}

function rectangleDirection(first: number) {
  'use gpu';
  const a = curveLayout.$.curves[d.u32(first)]!;
  const b = curveLayout.$.curves[d.u32(first) + 1]!;
  const u = std.sub(a.p3, a.p0);
  const v = std.sub(b.p3, b.p0);
  return u.x * v.y - u.y * v.x;
}

/** Disjoint strips avoid subtracting nearly equal pixel areas for a very thin frame. */
function differenceArea(rectangle: d.v4f, cut: d.v4f, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';

  if (cut.z <= cut.x || cut.w <= cut.y) {
    return clippedArea(rectangle, point, dx, dy);
  }

  return (
    clippedArea(d.vec4f(rectangle.x, rectangle.y, cut.x, rectangle.w), point, dx, dy) +
    clippedArea(d.vec4f(cut.z, rectangle.y, rectangle.z, rectangle.w), point, dx, dy) +
    clippedArea(d.vec4f(cut.x, rectangle.y, cut.z, cut.y), point, dx, dy) +
    clippedArea(d.vec4f(cut.x, cut.w, cut.z, rectangle.w), point, dx, dy)
  );
}
