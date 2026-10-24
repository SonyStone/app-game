import type { MapBounds, MapPoint } from './format';

/**
 * Plane geometry for map outlines in world pixels: areas and hit tests, simplification, clipping
 * to a rectangle and conversions between lines, polygons and boxes. A ring is a closed polygon
 * outline without its first point repeated; a path is an open line.
 */

/** Area enclosed by `ring`, positive whatever its winding. */
export function ringArea(ring: readonly MapPoint[]) {
  return Math.abs(signedArea(ring));
}

/** Shoelace area of `ring`: positive when it winds clockwise on screen (y down). */
export function signedArea(ring: readonly MapPoint[]) {
  let sum = 0;

  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }

  return sum / 2;
}

/** Tells whether `point` lies inside a polygon given as an outline and holes (even-odd rule). */
export function pointInPolygon(point: MapPoint, rings: readonly (readonly MapPoint[])[]) {
  let inside = false;

  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const a = ring[index];
      const b = ring[previous];

      if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }

  return inside;
}

/** Distance from `point` to the segment from `a` to `b`. */
export function distanceToSegment(point: MapPoint, a: MapPoint, b: MapPoint) {
  const nearest = nearestOnSegment(point, a, b);

  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

/** Point of the segment from `a` to `b` nearest to `point`. */
export function nearestOnSegment(point: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);

  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Distance from `point` to a path, or to a ring's outline when `closed`. */
export function distanceToLine(point: MapPoint, points: readonly MapPoint[], closed: boolean) {
  let best = Infinity;
  const count = closed ? points.length : points.length - 1;

  for (let index = 0; index < count; index++) {
    best = Math.min(best, distanceToSegment(point, points[index], points[(index + 1) % points.length]));
  }

  return best;
}

/**
 * Simplifies a path with the Douglas-Peucker algorithm: drops points that lie within `tolerance`
 * of the line through their neighbours. The ends stay.
 */
export function simplifyPath(points: readonly MapPoint[], tolerance: number): MapPoint[] {
  const cleaned = withoutRepeats(points);

  if (cleaned.length <= 2) {
    return cleaned;
  }

  const keep = new Array<boolean>(cleaned.length).fill(false);
  keep[0] = true;
  keep[cleaned.length - 1] = true;
  markKept(cleaned, 0, cleaned.length - 1, tolerance, keep);

  return cleaned.filter((_point, index) => keep[index]);
}

/**
 * Simplifies a ring like {@link simplifyPath}, splitting it at the point farthest from its
 * first one so that both halves keep their extremes. A ring that collapses to fewer than three
 * points comes back empty.
 */
export function simplifyRing(ring: readonly MapPoint[], tolerance: number): MapPoint[] {
  const cleaned = withoutRepeats(ring);

  if (cleaned.length > 1 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }

  if (cleaned.length < 3) {
    return [];
  }

  let far = 0;

  for (let index = 1; index < cleaned.length; index++) {
    if (squaredDistance(cleaned[index], cleaned[0]) > squaredDistance(cleaned[far], cleaned[0])) {
      far = index;
    }
  }

  const first = simplifyPath(cleaned.slice(0, far + 1), tolerance);
  const second = simplifyPath([...cleaned.slice(far), cleaned[0]], tolerance);
  const result = [...first, ...second.slice(1, -1)];

  return result.length >= 3 ? result : [];
}

/**
 * Clips a ring to `rect` (Sutherland-Hodgman). A concave ring crossing the rectangle more than
 * once keeps thin slivers along its edge, which is harmless for drawing and collision. A ring
 * entirely outside comes back empty.
 */
export function clipRing(ring: readonly MapPoint[], rect: MapBounds): MapPoint[] {
  const edges: [(point: MapPoint) => number, (a: MapPoint, b: MapPoint) => MapPoint][] = [
    [(point) => point.x - rect.x, (a, b) => crossAtX(a, b, rect.x)],
    [(point) => rect.x + rect.width - point.x, (a, b) => crossAtX(a, b, rect.x + rect.width)],
    [(point) => point.y - rect.y, (a, b) => crossAtY(a, b, rect.y)],
    [(point) => rect.y + rect.height - point.y, (a, b) => crossAtY(a, b, rect.y + rect.height)]
  ];
  let output = [...ring];

  for (const [inside, cross] of edges) {
    const input = output;
    output = [];

    for (let index = 0; index < input.length; index++) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentInside = inside(current) >= 0;
      const previousInside = inside(previous) >= 0;

      if (currentInside) {
        if (!previousInside) {
          output.push(cross(previous, current));
        }

        output.push(current);
      } else if (previousInside) {
        output.push(cross(previous, current));
      }
    }
  }

  const cleaned = withoutRepeats(output);

  return cleaned.length >= 3 && ringArea(cleaned) > 0 ? cleaned : [];
}

/** Clips a path to `rect` (Liang-Barsky); a path leaving and re-entering it comes back in pieces. */
export function clipPath(points: readonly MapPoint[], rect: MapBounds): MapPoint[][] {
  const pieces: MapPoint[][] = [];
  let current: MapPoint[] | undefined;

  for (let index = 0; index + 1 < points.length; index++) {
    const a = points[index];
    const b = points[index + 1];
    const span = clipSegment(a, b, rect);

    if (!span) {
      current = undefined;
      continue;
    }

    const start = lerp(a, b, span[0]);
    const end = lerp(a, b, span[1]);

    if (!current || span[0] > 0) {
      current = [start];
      pieces.push(current);
    }

    current.push(end);

    if (span[1] < 1) {
      current = undefined;
    }
  }

  return pieces.map(withoutRepeats).filter((piece) => piece.length >= 2);
}

/**
 * Outline of a band `width` wide along a path, with mitred joins and flat ends: turns a road or
 * a city wall into a polygon.
 */
export function outlinePath(points: readonly MapPoint[], width: number): MapPoint[] {
  const path = withoutRepeats(points);
  const half = width / 2;

  if (path.length < 2) {
    return [];
  }

  const left: MapPoint[] = [];
  const right: MapPoint[] = [];

  for (let index = 0; index < path.length; index++) {
    const before = normalOf(path[Math.max(index - 1, 0)], path[Math.max(index, 1)]);
    const after = normalOf(path[Math.min(index, path.length - 2)], path[Math.min(index + 1, path.length - 1)]);
    const sum = { x: before.x + after.x, y: before.y + after.y };
    const length = Math.hypot(sum.x, sum.y);
    const miter = length < 1e-9 ? before : { x: sum.x / length, y: sum.y / length };
    const cos = miter.x * after.x + miter.y * after.y;
    const reach = half / Math.max(cos, MITER_LIMIT_COS);
    const point = path[index];

    left.push({ x: point.x + miter.x * reach, y: point.y + miter.y * reach });
    right.push({ x: point.x - miter.x * reach, y: point.y - miter.y * reach });
  }

  return [...left, ...right.reverse()];
}

/** Smallest axis-aligned rectangle holding every point. */
export function boundsOf(points: readonly MapPoint[]): MapBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** `point` turned by `angle` radians (clockwise on screen) around `center`. */
export function rotatePoint(point: MapPoint, center: MapPoint, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Corners of a box centered at `center`, `size` along its own axes, turned by `rotation`. */
export function boxCorners(center: MapPoint, size: MapPoint, rotation: number) {
  const halfX = size.x / 2;
  const halfY = size.y / 2;

  return [
    { x: -halfX, y: -halfY },
    { x: halfX, y: -halfY },
    { x: halfX, y: halfY },
    { x: -halfX, y: halfY }
  ].map((corner) => rotatePoint({ x: center.x + corner.x, y: center.y + corner.y }, center, rotation));
}

/**
 * Smallest-area box around `points`, found along the edges of their convex hull: the inverse of
 * {@link boxCorners}. Turns a polygon into a crate.
 */
export function enclosingBox(points: readonly MapPoint[]) {
  const hull = convexHull(points);
  let best = { center: points[0] ?? { x: 0, y: 0 }, size: { x: 1, y: 1 }, rotation: 0, area: Infinity };

  for (let index = 0; index < hull.length; index++) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    const rotation = Math.atan2(b.y - a.y, b.x - a.x);
    const local = boundsOf(hull.map((point) => rotatePoint(point, { x: 0, y: 0 }, -rotation)));
    const area = local.width * local.height;

    if (area < best.area) {
      const center = rotatePoint(
        { x: local.x + local.width / 2, y: local.y + local.height / 2 },
        { x: 0, y: 0 },
        rotation
      );
      best = { center, size: { x: Math.max(local.width, 1), y: Math.max(local.height, 1) }, rotation, area };
    }
  }

  return { center: best.center, size: best.size, rotation: best.rotation };
}

/** Convex hull of `points` (monotone chain), clockwise on screen. */
export function convexHull(points: readonly MapPoint[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  if (sorted.length < 3) {
    return sorted;
  }

  const lower: MapPoint[] = [];
  const upper: MapPoint[] = [];

  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }

    lower.push(point);
  }

  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }

    upper.push(point);
  }

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Copy of `points` without points equal to the one before them. */
export function withoutRepeats(points: readonly MapPoint[]) {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
}

/** Smallest cosine between a join's miter and its edge normals; sharper joins get a shorter miter. */
const MITER_LIMIT_COS = 0.5;

function markKept(points: readonly MapPoint[], first: number, last: number, tolerance: number, keep: boolean[]) {
  let farthest = -1;
  let farthestDistance = tolerance;

  for (let index = first + 1; index < last; index++) {
    const distance = distanceToSegment(points[index], points[first], points[last]);

    if (distance > farthestDistance) {
      farthest = index;
      farthestDistance = distance;
    }
  }

  if (farthest < 0) {
    return;
  }

  keep[farthest] = true;
  markKept(points, first, farthest, tolerance, keep);
  markKept(points, farthest, last, tolerance, keep);
}

/** Parameter range of the segment from `a` to `b` inside `rect`, or `undefined` if it misses. */
function clipSegment(a: MapPoint, b: MapPoint, rect: MapBounds): [number, number] | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let low = 0;
  let high = 1;
  const checks: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y]
  ];

  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) {
        return undefined;
      }

      continue;
    }

    const t = q / p;

    if (p < 0) {
      low = Math.max(low, t);
    } else {
      high = Math.min(high, t);
    }
  }

  return low < high ? [low, high] : undefined;
}

function crossAtX(a: MapPoint, b: MapPoint, x: number) {
  return lerp(a, b, (x - a.x) / (b.x - a.x));
}

function crossAtY(a: MapPoint, b: MapPoint, y: number) {
  return lerp(a, b, (y - a.y) / (b.y - a.y));
}

function lerp(a: MapPoint, b: MapPoint, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Unit normal on the left of the direction from `a` to `b` (on screen, with y down). */
function normalOf(a: MapPoint, b: MapPoint) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;

  return { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
}

function cross(o: MapPoint, a: MapPoint, b: MapPoint) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function squaredDistance(a: MapPoint, b: MapPoint) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function samePoint(a: MapPoint, b: MapPoint) {
  return a.x === b.x && a.y === b.y;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
