import type { Sample } from './brush';
import type { Point } from './camera';
import { interpolateTabletAxes } from './tabletAxes';

/**
 * A clean shape recognized in a freehand stroke, in document pixels, kept in the order the stroke was drawn:
 * - `line` from the stroke's start to its end;
 * - `arc` of a circle from angle `start` (radians, y down, so positive angles turn clockwise on screen) through the
 *   signed `sweep`;
 * - `ellipse` with semi-axes `radii.x` along `rotation` and `radii.y` across it; its outline begins at the ellipse
 *   angle `start` and goes round once in `direction`;
 * - `polyline` through `points`; a closed one returns to its first point, and its outline begins `start` of the way
 *   along its first edge, where the stroke began.
 */
export type QuickShape =
  | { kind: 'line'; start: Point; end: Point }
  | { kind: 'arc'; center: Point; radius: number; start: number; sweep: number }
  | { kind: 'ellipse'; center: Point; radii: Point; rotation: number; start: number; direction: 1 | -1 }
  | { kind: 'polyline'; points: Point[]; closed: boolean; start: number };

/**
 * Recognizes the shape a freehand stroke approximates, trying a line, an arc, an ellipse and a polyline in that order;
 * `undefined` when none fits closely enough, so the stroke stays as drawn. Tolerances are relative to the stroke's
 * size, so the result does not depend on the scale it was drawn at; callers decide which strokes are too small to try.
 * Pure and synchronous.
 */
export function fitShape(stroke: readonly Point[]): QuickShape | undefined {
  const finite = withoutRepeats(stroke);
  const size = diagonal(finite);
  // Jitter of a slow pen would read as tiny zigzags, and corners.
  const points = thinned(finite, size * jitterRadius);
  if (points.length < 2 || !(size > 0)) {
    return undefined;
  }

  const path = resample(points, size / resampleDivisions);
  const line = fitLine(path);
  if (line) {
    return line;
  }

  const loop = closedLoop(path, size);
  if (loop) {
    // The gap between the loop's ends is part of its outline too.
    return fitClosed(resample([...loop, loop[0]!], size / resampleDivisions), size);
  }

  return fitOpen(path, size);
}

/** The shape's name for hints: a closed polyline of three corners is a triangle, a right-angled one of four a rectangle. */
export function shapeName(shape: QuickShape) {
  switch (shape.kind) {
    case 'line':
      return 'Line';
    case 'arc':
      return 'Arc';
    case 'ellipse':
      return Math.abs(shape.radii.x - shape.radii.y) <= 1e-6 * Math.max(shape.radii.x, shape.radii.y)
        ? 'Circle'
        : 'Ellipse';
    case 'polyline':
      if (!shape.closed) {
        return 'Polyline';
      }

      if (shape.points.length === 3) {
        return 'Triangle';
      }

      if (shape.points.length === 4) {
        const sides = edges(shape.points, true).map(([a, b]) => distance(a, b));
        if (rightAngled(shape.points)) {
          return Math.abs(sides[0]! - sides[1]!) <= 1e-6 * Math.max(...sides) ? 'Square' : 'Rectangle';
        }

        return 'Quadrilateral';
      }

      return 'Polygon';
  }
}

/** What snapping turns the shape into, for hints; `undefined` when snapping does not change this kind of shape. */
export function snappedName(shape: QuickShape) {
  switch (shape.kind) {
    case 'line':
      return 'Line at 15° steps';
    case 'ellipse':
      return 'Circle';
    case 'polyline':
      return shape.closed && shape.points.length === 3
        ? 'Equilateral triangle'
        : shape.closed && shape.points.length === 4
          ? 'Square'
          : undefined;
    default:
      return undefined;
  }
}

/**
 * The point an edit of the shape turns and scales it around: the start of an open shape, which stays where the stroke
 * began, or the center of a closed one.
 */
export function shapePivot(shape: QuickShape): Point {
  switch (shape.kind) {
    case 'line':
      return shape.start;
    case 'arc':
      return polar(shape.center, shape.radius, shape.start);
    case 'ellipse':
      return shape.center;
    case 'polyline':
      return shape.closed ? centroid(shape.points) : shape.points[0]!;
  }
}

/**
 * Turns and scales the shape around `pivot` so that `from` lands on `to`, as an edit does while the pen that held
 * the shape moves: `from` is where the pen was when the shape appeared. Leaves the shape unchanged when `from` is at
 * the pivot.
 */
export function moveShape(shape: QuickShape, pivot: Point, from: Point, to: Point): QuickShape {
  const reach = distance(pivot, from);
  if (!(reach > 1e-9)) {
    return shape;
  }

  const scale = distance(pivot, to) / reach;
  const angle = Math.atan2(to.y - pivot.y, to.x - pivot.x) - Math.atan2(from.y - pivot.y, from.x - pivot.x);
  const map = (point: Point) => {
    const x = (point.x - pivot.x) * scale,
      y = (point.y - pivot.y) * scale;
    return {
      x: pivot.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: pivot.y + x * Math.sin(angle) + y * Math.cos(angle)
    };
  };

  switch (shape.kind) {
    case 'line':
      return { ...shape, start: map(shape.start), end: map(shape.end) };
    case 'arc':
      return { ...shape, center: map(shape.center), radius: shape.radius * scale, start: shape.start + angle };
    case 'ellipse':
      return {
        ...shape,
        center: map(shape.center),
        radii: { x: shape.radii.x * scale, y: shape.radii.y * scale },
        rotation: shape.rotation + angle
      };
    case 'polyline':
      return { ...shape, points: shape.points.map(map) };
  }
}

/**
 * Snaps the shape to its regular form: a line's direction to 15° steps around its start, an ellipse to a circle of
 * its mean radius, a closed polyline of four corners to a square and of three to an equilateral triangle, each around
 * its center and keeping its first corner's direction. Other shapes are returned unchanged.
 */
export function snapShape(shape: QuickShape): QuickShape {
  switch (shape.kind) {
    case 'line': {
      const length = distance(shape.start, shape.end);
      const step = Math.PI / 12;
      const angle = Math.round(Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x) / step) * step;
      return { ...shape, end: polar(shape.start, length, angle) };
    }

    case 'ellipse': {
      const radius = (shape.radii.x + shape.radii.y) / 2;
      return { ...shape, radii: { x: radius, y: radius } };
    }

    case 'polyline':
      if (shape.closed && (shape.points.length === 3 || shape.points.length === 4)) {
        return { ...shape, points: regularPolygon(shape.points) };
      }

      return shape;

    default:
      return shape;
  }
}

/**
 * Samples along the shape's outline for painting it with the stroke's brush, at most `spacing` document pixels apart
 * and with every corner exact. Pressure, time and tablet axes come from the freehand `stroke` at the same fraction of
 * its length, so tapering ends stay at the ends and time keeps increasing, as brushes with build-up need; the pen's
 * hold at the end adds no time.
 */
export function shapeSamples(shape: QuickShape, stroke: readonly Sample[], spacing: number): Sample[] {
  const outline = shapeOutline(shape, spacing);
  const profile = strokeProfile(stroke);
  let time = -Infinity;
  return outline.map(({ point, along }) => {
    const sample = profile(along);
    time = Math.max(time, sample.time);
    return { ...sample, x: point.x, y: point.y, time };
  });
}

/** Points along the outline, with the fraction of the outline's length `along` it at each; see `shapeSamples`. */
export function shapeOutline(shape: QuickShape, spacing: number): { point: Point; along: number }[] {
  const step = Math.max(spacing, outlineLength(shape) / maxOutlineSamples, 1e-6);
  const points: Point[] = [];
  switch (shape.kind) {
    case 'line':
      appendSegment(points, shape.start, shape.end, step, true);
      break;
    case 'arc': {
      const count = Math.max(minCurveSamples, Math.ceil((Math.abs(shape.sweep) * shape.radius) / step));
      for (let index = 0; index <= count; index++) {
        points.push(polar(shape.center, shape.radius, shape.start + (shape.sweep * index) / count));
      }

      break;
    }

    case 'ellipse': {
      const count = Math.max(minCurveSamples, Math.ceil(ellipsePerimeter(shape.radii) / step));
      for (let index = 0; index <= count; index++) {
        points.push(ellipsePoint(shape, shape.start + (shape.direction * 2 * Math.PI * index) / count));
      }

      break;
    }

    case 'polyline': {
      const corners = shape.closed ? startedPolygon(shape) : shape.points;
      for (let index = 1; index < corners.length; index++) {
        appendSegment(points, corners[index - 1]!, corners[index]!, step, index === 1);
      }

      break;
    }
  }

  const lengths = cumulativeLengths(points);
  const total = lengths.at(-1) || 1;
  return points.map((point, index) => ({ point, along: lengths[index]! / total }));
}

/** Divisions of the stroke's size between resampled points, as in ShortStraw's corner finding. */
const resampleDivisions = 40;

/** Points of the stroke closer than this to the previous one, relative to its size, are dropped before fitting. */
const jitterRadius = 0.01;

/** Upper bound on samples of one outline, so a huge shape at a fine spacing stays cheap to paint and send. */
const maxOutlineSamples = 4096;

/** Fewest samples along a curve, so a tiny ellipse is still round. */
const minCurveSamples = 24;

/**
 * Tolerances, as fractions of the stroke's size: the largest distance of any resampled point from the fitted shape,
 * and the root mean square of those distances.
 */
const tolerance = {
  line: { max: 0.05, rms: 0.02 },
  arc: { max: 0.06, rms: 0.025 },
  ellipse: { max: 0.08, rms: 0.03 },
  polyline: { max: 0.06, rms: 0.025 }
};

/** A stroke whose ends come this close, relative to its size, after going around is closed. */
const closingGap = 0.17;

/** Smallest turn, in radians, between consecutive edges that still counts as a corner. */
const minimumCornerTurn = (25 * Math.PI) / 180;

/** Corners within this many radians of a right angle make a closed four-cornered polyline a rectangle. */
const rightAngleTolerance = (15 * Math.PI) / 180;

/** Shortest edge of a polyline, relative to the stroke's size; a shorter one is a hook, not an edge. */
const minimumEdge = 0.08;

/** Most corners a recognized polyline may have, not counting the ends of an open one; more is a scribble. */
const maxCorners = 8;

/** Recognizes a line from the stroke's start to its end: every point close to it and no doubling back. */
function fitLine(path: readonly Point[]): QuickShape | undefined {
  const start = path[0]!,
    end = path.at(-1)!;
  const chord = distance(start, end);
  if (!(chord > 0) || pathLength(path) > chord * 1.2) {
    return undefined;
  }

  return accepts(deviations(path, [[start, end]]), chord, tolerance.line)
    ? { kind: 'line', start, end }
    : undefined;
}

/**
 * The stroke as a closed loop when its end comes back near its start, up to the point nearest the start in its last
 * stretch, which drops an overshoot past the start; `undefined` for an open stroke.
 */
function closedLoop(path: readonly Point[], size: number): Point[] | undefined {
  const length = pathLength(path);
  if (length < size * 1.5) {
    return undefined;
  }

  const lengths = cumulativeLengths(path);
  const start = path[0]!;
  let nearest = -1,
    nearestDistance = Infinity;
  for (let index = 0; index < path.length; index++) {
    if (lengths[index]! < length * 0.6) {
      continue;
    }

    const gap = distance(path[index]!, start);
    if (gap < nearestDistance) {
      nearest = index;
      nearestDistance = gap;
    }
  }

  return nearest >= 0 && nearestDistance <= size * closingGap ? path.slice(0, nearest + 1) : undefined;
}

/** Chooses between an ellipse and a polygon for a closed loop: a polygon when it has corners and fits clearly better. */
function fitClosed(loop: readonly Point[], size: number): QuickShape | undefined {
  const ellipse = fitEllipse(loop);
  const polygon = fitPolyline(loop, true, size);
  const ellipseError = ellipse && relativeError(ellipseDeviations(ellipse, loop), size);
  const polygonError = polygon && relativeError(deviations(loop, edges(polygon.points, true)), size);
  const ellipseFits = !!ellipseError && within(ellipseError, tolerance.ellipse);
  const polygonFits = !!polygonError && within(polygonError, tolerance.polyline);
  if (polygonFits && (!ellipseFits || polygonError.rms < ellipseError!.rms * 0.7)) {
    return polygon;
  }

  return ellipseFits ? ellipse : undefined;
}

/** Chooses between an arc and a polyline for an open stroke: a polyline when it has corners and fits clearly better. */
function fitOpen(path: readonly Point[], size: number): QuickShape | undefined {
  const arc = fitArc(path);
  const polyline = fitPolyline(path, false, size);
  const arcError = arc && relativeError(arcDeviations(arc, path), size);
  const polylineError = polyline && relativeError(deviations(path, edges(polyline.points, false)), size);
  const arcFits = !!arcError && within(arcError, tolerance.arc);
  const polylineFits = !!polylineError && within(polylineError, tolerance.polyline);
  if (polylineFits && (!arcFits || polylineError.rms < arcError!.rms * 0.6)) {
    return polyline;
  }

  return arcFits ? arc : undefined;
}

/**
 * Fits a circle by least squares, refined by a few Gauss–Newton steps on the geometric distance, and keeps it as an
 * arc from the stroke's start through its end when the stroke turns steadily one way, by 20° to 340°.
 */
function fitArc(path: readonly Point[]): Extract<QuickShape, { kind: 'arc' }> | undefined {
  const circle = fitCircle(path);
  if (!circle) {
    return undefined;
  }

  const { center, radius } = circle;
  let sweep = 0,
    turned = 0;
  let previous = Math.atan2(path[0]!.y - center.y, path[0]!.x - center.x);
  for (const point of path.slice(1)) {
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const delta = Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
    sweep += delta;
    turned += Math.abs(delta);
    previous = angle;
  }

  const degrees = (Math.abs(sweep) * 180) / Math.PI;
  if (degrees < 20 || degrees > 340 || Math.abs(sweep) < turned * 0.9) {
    return undefined;
  }

  return { kind: 'arc', center, radius, start: Math.atan2(path[0]!.y - center.y, path[0]!.x - center.x), sweep };
}

/** Least-squares circle (Kåsa), then Gauss–Newton on the distances to it. */
function fitCircle(points: readonly Point[]): { center: Point; radius: number } | undefined {
  const origin = centroid(points);
  const scale = diagonal(points) || 1;
  const local = points.map((point) => ({ x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale }));
  // x² + y² + Dx + Ey + F = 0
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const right = [0, 0, 0];
  for (const { x, y } of local) {
    const row = [x, y, 1];
    const value = -(x * x + y * y);
    for (let i = 0; i < 3; i++) {
      right[i]! += row[i]! * value;
      for (let j = 0; j < 3; j++) {
        normal[i]![j]! += row[i]! * row[j]!;
      }
    }
  }

  const solution = solveLinear(normal, right);
  if (!solution) {
    return undefined;
  }

  let cx = -solution[0]! / 2,
    cy = -solution[1]! / 2;
  let radius = Math.sqrt(Math.max(0, cx * cx + cy * cy - solution[2]!));
  for (let iteration = 0; iteration < 8; iteration++) {
    const jtj = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    const jtr = [0, 0, 0];
    for (const { x, y } of local) {
      const d = Math.hypot(x - cx, y - cy) || 1e-12;
      const residual = d - radius;
      const row = [-(x - cx) / d, -(y - cy) / d, -1];
      for (let i = 0; i < 3; i++) {
        jtr[i]! -= row[i]! * residual;
        for (let j = 0; j < 3; j++) {
          jtj[i]![j]! += row[i]! * row[j]!;
        }
      }
    }

    const step = solveLinear(jtj, jtr);
    if (!step) {
      break;
    }

    cx += step[0]!;
    cy += step[1]!;
    radius += step[2]!;
  }

  if (!(radius > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) {
    return undefined;
  }

  return { center: { x: origin.x + cx * scale, y: origin.y + cy * scale }, radius: radius * scale };
}

/**
 * Fits an ellipse by direct least squares (Fitzgibbon, in Halíř and Flusser's numerically stable form), which always
 * returns an ellipse, and starts its outline where the stroke started, going the way the stroke went.
 */
function fitEllipse(loop: readonly Point[]): Extract<QuickShape, { kind: 'ellipse' }> | undefined {
  const origin = centroid(loop);
  const scale = diagonal(loop) || 1;
  const local = loop.map((point) => ({ x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale }));
  const s1 = zeros(3),
    s2 = zeros(3),
    s3 = zeros(3);
  for (const { x, y } of local) {
    const quadratic = [x * x, x * y, y * y],
      linear = [x, y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        s1[i]![j]! += quadratic[i]! * quadratic[j]!;
        s2[i]![j]! += quadratic[i]! * linear[j]!;
        s3[i]![j]! += linear[i]! * linear[j]!;
      }
    }
  }

  const s3Inverse = invert3(s3);
  if (!s3Inverse) {
    return undefined;
  }

  // T = -S3⁻¹ S2ᵀ; M = S1 + S2 T, then premultiplied by the inverse of the ellipse constraint matrix.
  const t = multiply(s3Inverse, transpose(s2)).map((row) => row.map((value) => -value));
  const reduced = add(s1, multiply(s2, t));
  const m = [reduced[2]!.map((value) => value / 2), reduced[1]!.map((value) => -value), reduced[0]!.map((value) => value / 2)];
  let best: number[] | undefined;
  for (const vector of eigenvectors3(m)) {
    const condition = 4 * vector[0]! * vector[2]! - vector[1]! * vector[1]!;
    if (condition > 0) {
      best = vector;
      break;
    }
  }

  if (!best) {
    return undefined;
  }

  const [a, b, c] = best;
  const [d, e, f] = multiply(t, [[a!], [b!], [c!]]).map((row) => row[0]!);
  const ellipse = conicEllipse(a!, b!, c!, d!, e!, f!);
  if (!ellipse) {
    return undefined;
  }

  const center = { x: origin.x + ellipse.center.x * scale, y: origin.y + ellipse.center.y * scale };
  const shape = {
    kind: 'ellipse' as const,
    center,
    radii: { x: ellipse.radii.x * scale, y: ellipse.radii.y * scale },
    rotation: ellipse.rotation,
    start: 0,
    direction: (signedArea(loop) >= 0 ? 1 : -1) as 1 | -1
  };
  return { ...shape, start: ellipseAngle(shape, loop[0]!) };
}

/** Center, semi-axes and rotation of the ellipse a x² + b xy + c y² + d x + e y + f = 0, if it is a real ellipse. */
function conicEllipse(a: number, b: number, c: number, d: number, e: number, f: number) {
  const determinant = 4 * a * c - b * b;
  if (!(determinant > 0)) {
    return undefined;
  }

  const center = { x: (b * e - 2 * c * d) / determinant, y: (b * d - 2 * a * e) / determinant };
  const level = a * center.x * center.x + b * center.x * center.y + c * center.y * center.y - f;
  // The eigenvectors of [[a, b/2], [b/2, c]] are the axes; along each, the radius is √(level / eigenvalue).
  const mean = (a + c) / 2,
    spread = Math.hypot((a - c) / 2, b / 2);
  const major = mean - spread,
    minor = mean + spread;
  if (!(level / major > 0) || !(level / minor > 0)) {
    return undefined;
  }

  const rotation = Math.abs(b) < 1e-15 && a <= c ? 0 : Math.atan2(major - a, b / 2);
  return { center, radii: { x: Math.sqrt(level / major), y: Math.sqrt(level / minor) }, rotation };
}

/**
 * Finds corners as in ShortStraw (Wolin, Eoff and Hammond): resampled points whose "straw", the chord across a few
 * neighbors, is shortest and well below the median. Edges between corners must be straight; consecutive edges must
 * turn by at least `minimumCornerTurn`. Each corner is then where the lines fitted to its two edges cross, and the
 * ends of an open polyline lie on its first and last lines. `undefined` without at least one corner, or three for a
 * closed polyline, and with more than `maxCorners`.
 */
function fitPolyline(
  path: readonly Point[],
  closed: boolean,
  size: number
): Extract<QuickShape, { kind: 'polyline' }> | undefined {
  const points = closed && distance(path[0]!, path.at(-1)!) < 1e-9 ? path.slice(0, -1) : path;
  const count = points.length;
  const window = 3;
  if (count < window * 4) {
    return undefined;
  }

  const at = (index: number) => points[closed ? ((index % count) + count) % count : Math.min(count - 1, Math.max(0, index))]!;
  const straws = points.map((_, index) =>
    closed || (index >= window && index < count - window) ? distance(at(index - window), at(index + window)) : Infinity
  );
  const finite = straws.filter(Number.isFinite).sort((a, b) => a - b);
  const threshold = finite[Math.floor(finite.length / 2)]! * 0.95;
  let corners: number[] = [];
  for (let index = 0; index < count; index++) {
    if (!(straws[index]! < threshold)) {
      continue;
    }

    // The lowest straw of each run below the threshold.
    let end = index,
      lowest = index;
    while (end + 1 < count && straws[end + 1]! < threshold) {
      end++;
      if (straws[end]! < straws[lowest]!) {
        lowest = end;
      }
    }

    corners.push(lowest);
    index = end;
  }

  // A run below the threshold that wraps around the start of a closed path counts once.
  if (closed && corners.length > 1 && straws[0]! < threshold && straws[count - 1]! < threshold) {
    const first = corners.shift()!,
      last = corners.pop()!;
    corners.push(straws[first]! <= straws[last]! ? first : last);
    corners.sort((a, b) => a - b);
  }

  if (!closed) {
    corners = [0, ...corners.filter((index) => index > 0 && index < count - 1), count - 1];
  }

  for (let pass = 0; pass <= count; pass++) {
    const vertices = cornerPoints(points, corners, closed);
    if (!vertices) {
      return undefined;
    }

    const removable = (index: number) => closed || (index > 0 && index < vertices.length - 1);
    const turn = (index: number) =>
      turnAngle(
        vertices[(index - 1 + vertices.length) % vertices.length]!,
        vertices[index]!,
        vertices[(index + 1) % vertices.length]!
      );
    // Drop the corner that turns least while any turns less than a corner should, then the flatter end of an edge too
    // short to be one, such as the hook of a pen landing.
    let dropped = -1,
      droppedTurn = minimumCornerTurn;
    for (let index = 0; index < vertices.length; index++) {
      if (removable(index) && turn(index) < droppedTurn) {
        dropped = index;
        droppedTurn = turn(index);
      }
    }

    if (dropped < 0) {
      for (const [index, [a, b]] of edges(vertices, closed).entries()) {
        if (distance(a, b) >= size * minimumEdge) {
          continue;
        }

        const ends = [index, (index + 1) % vertices.length].filter(removable);
        if (ends.length) {
          dropped = ends.reduce((flatter, end) => (turn(end) < turn(flatter) ? end : flatter));
          break;
        }
      }
    }

    if (dropped >= 0) {
      corners.splice(dropped, 1);
      continue;
    }

    const cornerCount = closed ? vertices.length : vertices.length - 2;
    if (vertices.length < 3 || cornerCount > maxCorners) {
      return undefined;
    }

    if (!closed) {
      return { kind: 'polyline', points: vertices, closed, start: 0 };
    }

    return startOnPolygon(vertices.length === 4 && rightAngled(vertices) ? squaredUp(vertices) : vertices, path[0]!);
  }

  return undefined;
}

/**
 * Corners of the polyline whose edges run between the `corners` indices of `points`: each where the lines fitted to
 * its edges cross. The ends of an open path are projected onto the first and last lines.
 */
function cornerPoints(points: readonly Point[], corners: readonly number[], closed: boolean): Point[] | undefined {
  const reach = diagonal(points) * 0.1;
  const edgeCount = closed ? corners.length : corners.length - 1;
  if (edgeCount < (closed ? 3 : 1)) {
    return undefined;
  }

  const lines: { point: Point; direction: Point }[] = [];
  for (let edge = 0; edge < edgeCount; edge++) {
    const from = corners[edge]!,
      to = closed && edge === edgeCount - 1 ? corners[0]! + points.length : corners[edge + 1]!;
    const span: Point[] = [];
    for (let index = from; index <= to; index++) {
      span.push(points[index % points.length]!);
    }

    // Points next to a corner are rounded by the hand; fit the middle of the edge when it is long enough.
    const trim = span.length > 8 ? Math.floor(span.length * 0.15) : 0;
    const line = fitLineThrough(span.slice(trim, span.length - trim));
    if (!line) {
      return undefined;
    }

    lines.push(line);
  }

  const vertices: Point[] = [];
  if (!closed) {
    vertices.push(project(points[0]!, lines[0]!));
  }

  for (let edge = closed ? 0 : 1; edge < edgeCount; edge++) {
    const previous = lines[(edge - 1 + edgeCount) % edgeCount]!,
      next = lines[edge]!;
    // Nearly parallel lines cross far away; the corner found in the stroke is closer to what was meant.
    const found = points[corners[edge]! % points.length]!;
    const crossing = intersect(previous, next);
    vertices.push(crossing && distance(crossing, found) <= reach ? crossing : found);
  }

  if (!closed) {
    vertices.push(project(points.at(-1)!, lines.at(-1)!));
  }

  return vertices;
}

/** Total least-squares line through `points`: their centroid and principal direction. */
function fitLineThrough(points: readonly Point[]): { point: Point; direction: Point } | undefined {
  if (points.length < 2) {
    return undefined;
  }

  const center = centroid(points);
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const point of points) {
    const x = point.x - center.x,
      y = point.y - center.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }

  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  return { point: center, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
}

/** Rotates a closed polygon's corners so that `start`, projected onto the nearest edge, lies on its first edge. */
function startOnPolygon(vertices: readonly Point[], start: Point): Extract<QuickShape, { kind: 'polyline' }> | undefined {
  let best = -1,
    bestDistance = Infinity,
    bestFraction = 0;
  for (let index = 0; index < vertices.length; index++) {
    const a = vertices[index]!,
      b = vertices[(index + 1) % vertices.length]!;
    const fraction = segmentFraction(start, a, b);
    const gap = distance(start, lerp(a, b, fraction));
    if (gap < bestDistance) {
      best = index;
      bestDistance = gap;
      bestFraction = fraction;
    }
  }

  if (best < 0) {
    return undefined;
  }

  return {
    kind: 'polyline',
    points: [...vertices.slice(best), ...vertices.slice(0, best)],
    closed: true,
    start: bestFraction
  };
}

/** A closed polyline's corners in outline order: from its start on the first edge around to the same point. */
function startedPolygon(shape: Extract<QuickShape, { kind: 'polyline' }>): Point[] {
  const first = lerp(shape.points[0]!, shape.points[1 % shape.points.length]!, shape.start);
  return [first, ...shape.points.slice(1), shape.points[0]!, first];
}

/**
 * A square or an equilateral triangle in place of a closed polyline of four or three corners: around the corners'
 * centroid, with their mean distance from it, the first corner's direction and the same winding.
 */
function regularPolygon(points: readonly Point[]): Point[] {
  const center = centroid(points);
  const radius = points.reduce((sum, point) => sum + distance(point, center), 0) / points.length;
  const first = Math.atan2(points[0]!.y - center.y, points[0]!.x - center.x);
  const winding = signedArea(points) >= 0 ? 1 : -1;
  return points.map((_, index) => polar(center, radius, first + (winding * 2 * Math.PI * index) / points.length));
}

/**
 * The rectangle nearest a four-cornered polygon whose corners are all nearly right angles: its edges along their
 * mean direction (averaged modulo 90°), its sides the mean extents of the corners from their centroid, and its
 * corners in the same order.
 */
function squaredUp(points: readonly Point[]): Point[] {
  let sin = 0,
    cos = 0;
  for (const [a, b] of edges(points, true)) {
    const angle = 4 * Math.atan2(b.y - a.y, b.x - a.x);
    sin += Math.sin(angle) * distance(a, b);
    cos += Math.cos(angle) * distance(a, b);
  }

  const angle = Math.atan2(sin, cos) / 4;
  const u = { x: Math.cos(angle), y: Math.sin(angle) },
    v = { x: -Math.sin(angle), y: Math.cos(angle) };
  const center = centroid(points);
  const offsets = points.map((point) => {
    const x = point.x - center.x,
      y = point.y - center.y;
    return { u: x * u.x + y * u.y, v: x * v.x + y * v.y };
  });
  const width = offsets.reduce((sum, offset) => sum + Math.abs(offset.u), 0) / 4;
  const height = offsets.reduce((sum, offset) => sum + Math.abs(offset.v), 0) / 4;
  return offsets.map((offset) => {
    const along = Math.sign(offset.u) * width,
      across = Math.sign(offset.v) * height;
    return { x: center.x + along * u.x + across * v.x, y: center.y + along * u.y + across * v.y };
  });
}

/** Whether every corner of a closed polygon is within `rightAngleTolerance` of a right angle. */
function rightAngled(points: readonly Point[]) {
  return points.every(
    (point, index) =>
      Math.abs(
        turnAngle(points[(index - 1 + points.length) % points.length]!, point, points[(index + 1) % points.length]!) -
          Math.PI / 2
      ) <= rightAngleTolerance
  );
}

/** Pressure, time and tablet axes of `stroke` at a fraction of its length; the first sample reaching that length wins. */
function strokeProfile(stroke: readonly Sample[]) {
  const lengths = cumulativeLengths(stroke);
  const total = lengths.at(-1) ?? 0;
  return (along: number): Sample => {
    const target = along * total;
    let low = 0,
      high = stroke.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (lengths[middle]! >= target) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }

    const after = stroke[low]!;
    const before = stroke[Math.max(0, low - 1)]!;
    const span = lengths[low]! - lengths[Math.max(0, low - 1)]!;
    const t = span > 0 ? Math.min(1, Math.max(0, (target - lengths[low - 1]!) / span)) : 1;
    return {
      ...after,
      ...interpolateTabletAxes(before, after, t),
      pressure: before.pressure + (after.pressure - before.pressure) * t,
      time: before.time + (after.time - before.time) * t
    };
  };
}

/** Appends points from `a` to `b` at most `step` apart, including `a` only when `first`. */
function appendSegment(points: Point[], a: Point, b: Point, step: number, first: boolean) {
  const count = Math.max(1, Math.ceil(distance(a, b) / step));
  for (let index = first ? 0 : 1; index <= count; index++) {
    points.push(lerp(a, b, index / count));
  }
}

function outlineLength(shape: QuickShape) {
  switch (shape.kind) {
    case 'line':
      return distance(shape.start, shape.end);
    case 'arc':
      return Math.abs(shape.sweep) * shape.radius;
    case 'ellipse':
      return ellipsePerimeter(shape.radii);
    case 'polyline':
      return pathLength(shape.closed ? [...shape.points, shape.points[0]!] : shape.points);
  }
}

/** Ramanujan's second approximation. */
function ellipsePerimeter(radii: Point) {
  const h = ((radii.x - radii.y) / (radii.x + radii.y || 1)) ** 2;
  return Math.PI * (radii.x + radii.y) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function ellipsePoint(shape: Extract<QuickShape, { kind: 'ellipse' }>, angle: number): Point {
  const x = shape.radii.x * Math.cos(angle),
    y = shape.radii.y * Math.sin(angle);
  return {
    x: shape.center.x + x * Math.cos(shape.rotation) - y * Math.sin(shape.rotation),
    y: shape.center.y + x * Math.sin(shape.rotation) + y * Math.cos(shape.rotation)
  };
}

/** The ellipse angle whose point is nearest `point`, found by sampling and then refining. */
function ellipseAngle(shape: Extract<QuickShape, { kind: 'ellipse' }>, point: Point) {
  let best = 0,
    bestDistance = Infinity;
  const steps = 720;
  for (let index = 0; index < steps; index++) {
    const angle = (2 * Math.PI * index) / steps;
    const gap = distance(ellipsePoint(shape, angle), point);
    if (gap < bestDistance) {
      best = angle;
      bestDistance = gap;
    }
  }

  return best;
}

/** Distances from `points` to the ellipse, measured to a dense sampling of it. */
function ellipseDeviations(shape: Extract<QuickShape, { kind: 'ellipse' }>, points: readonly Point[]) {
  const outline: Point[] = [];
  for (let index = 0; index < 360; index++) {
    outline.push(ellipsePoint(shape, (2 * Math.PI * index) / 360));
  }

  return deviations(points, edges(outline, true));
}

/** Distances from `points` to the arc, measured to a dense sampling of it. */
function arcDeviations(shape: Extract<QuickShape, { kind: 'arc' }>, points: readonly Point[]) {
  const outline = shapeOutline(shape, (shape.radius * Math.abs(shape.sweep)) / 256).map((entry) => entry.point);
  return deviations(points, edges(outline, false));
}

/** Distance from each point to the nearest of `segments`. */
function deviations(points: readonly Point[], segments: readonly (readonly [Point, Point])[]) {
  return points.map((point) => {
    let nearest = Infinity;
    for (const [a, b] of segments) {
      nearest = Math.min(nearest, distance(point, lerp(a, b, segmentFraction(point, a, b))));
    }

    return nearest;
  });
}

function relativeError(distances: readonly number[], size: number) {
  if (!distances.length) {
    return undefined;
  }

  return {
    max: Math.max(...distances) / size,
    rms: Math.sqrt(distances.reduce((sum, value) => sum + value * value, 0) / distances.length) / size
  };
}

function within(error: { max: number; rms: number }, limit: { max: number; rms: number }) {
  return error.max <= limit.max && error.rms <= limit.rms;
}

function accepts(distances: readonly number[], size: number, limit: { max: number; rms: number }) {
  const error = relativeError(distances, size);
  return !!error && within(error, limit);
}

function edges(points: readonly Point[], closed: boolean): [Point, Point][] {
  const result: [Point, Point][] = [];
  for (let index = 1; index < points.length; index++) {
    result.push([points[index - 1]!, points[index]!]);
  }

  if (closed && points.length > 2) {
    result.push([points.at(-1)!, points[0]!]);
  }

  return result;
}

/** Points along the path, `spacing` apart by arc length, keeping both ends. */
function resample(points: readonly Point[], spacing: number): Point[] {
  const result: Point[] = [points[0]!];
  let carried = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!;
    const length = distance(a, b);
    let offset = spacing - carried;
    while (offset <= length) {
      result.push(lerp(a, b, offset / length));
      offset += spacing;
    }

    carried = length - (offset - spacing);
  }

  if (distance(result.at(-1)!, points.at(-1)!) > spacing * 0.25) {
    result.push(points.at(-1)!);
  } else {
    result[result.length - 1] = points.at(-1)!;
  }

  return result;
}

function withoutRepeats(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }

    const last = result.at(-1);
    if (!last || distance(last, point) > 1e-9) {
      result.push({ x: point.x, y: point.y });
    }
  }

  return result;
}

/** Drops points within `radius` of the last kept one, keeping the stroke's last point. */
function thinned(points: readonly Point[], radius: number): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (!last || distance(last, point) > radius) {
      result.push(point);
    }
  }

  if (points.length && result.at(-1) !== points.at(-1)) {
    result.push(points.at(-1)!);
  }

  return result;
}

function cumulativeLengths(points: readonly Point[]) {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1]! + distance(points[index - 1]!, points[index]!));
  }

  return lengths;
}

function pathLength(points: readonly Point[]) {
  return cumulativeLengths(points).at(-1) ?? 0;
}

/** The diagonal of the points' bounding box: the stroke's size that tolerances are relative to. */
function diagonal(points: readonly Point[]) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }

  return points.length ? Math.hypot(right - left, bottom - top) : 0;
}

function centroid(points: readonly Point[]): Point {
  let x = 0,
    y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }

  return { x: x / points.length, y: y / points.length };
}

/** Twice the signed area of the closed polygon; positive when it turns clockwise on screen (y down). */
function signedArea(points: readonly Point[]) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!,
      b = points[(index + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }

  return area;
}

/** How far the path turns at `b`, from 0 (straight on) to π (back the way it came). */
function turnAngle(a: Point, b: Point, c: Point) {
  const first = Math.atan2(b.y - a.y, b.x - a.x),
    second = Math.atan2(c.y - b.y, c.x - b.x);
  return Math.abs(Math.atan2(Math.sin(second - first), Math.cos(second - first)));
}

function intersect(a: { point: Point; direction: Point }, b: { point: Point; direction: Point }): Point | undefined {
  const cross = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
  if (Math.abs(cross) < 1e-9) {
    return undefined;
  }

  const t = ((b.point.x - a.point.x) * b.direction.y - (b.point.y - a.point.y) * b.direction.x) / cross;
  return { x: a.point.x + a.direction.x * t, y: a.point.y + a.direction.y * t };
}

function project(point: Point, line: { point: Point; direction: Point }): Point {
  const t = (point.x - line.point.x) * line.direction.x + (point.y - line.point.y) * line.direction.y;
  return { x: line.point.x + line.direction.x * t, y: line.point.y + line.direction.y * t };
}

/** Fraction along segment `a`–`b` of the point on it nearest `point`. */
function segmentFraction(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  return length > 0 ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
}

function polar(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function zeros(size: number) {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

function transpose(matrix: number[][]) {
  return matrix[0]!.map((_, column) => matrix.map((row) => row[column]!));
}

function multiply(a: number[][], b: number[][]) {
  return a.map((row) => b[0]!.map((_, column) => row.reduce((sum, value, k) => sum + value * b[k]![column]!, 0)));
}

function add(a: number[][], b: number[][]) {
  return a.map((row, i) => row.map((value, j) => value + b[i]![j]!));
}

function invert3(m: number[][]): number[][] | undefined {
  const [a, b, c] = m[0]!,
    [d, e, f] = m[1]!,
    [g, h, i] = m[2]!;
  const determinant = a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);
  if (!(Math.abs(determinant) > 1e-300)) {
    return undefined;
  }

  return [
    [(e! * i! - f! * h!) / determinant, (c! * h! - b! * i!) / determinant, (b! * f! - c! * e!) / determinant],
    [(f! * g! - d! * i!) / determinant, (a! * i! - c! * g!) / determinant, (c! * d! - a! * f!) / determinant],
    [(d! * h! - e! * g!) / determinant, (b! * g! - a! * h!) / determinant, (a! * e! - b! * d!) / determinant]
  ];
}

/** Eigenvectors of a 3 × 3 matrix for its real eigenvalues: the characteristic cubic, then a null vector of each. */
function eigenvectors3(m: number[][]): number[][] {
  const [a, b, c] = m[0]!,
    [d, e, f] = m[1]!,
    [g, h, i] = m[2]!;
  // λ³ + p λ² + q λ + r = 0
  const p = -(a! + e! + i!);
  const q = a! * e! + a! * i! + e! * i! - b! * d! - c! * g! - f! * h!;
  const r = -(a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!));
  const vectors: number[][] = [];
  for (const value of cubicRoots(p, q, r)) {
    const rows = [
      [a! - value, b!, c!],
      [d!, e! - value, f!],
      [g!, h!, i! - value]
    ];
    let best: number[] | undefined,
      bestNorm = 0;
    for (const [x, y] of [
      [0, 1],
      [0, 2],
      [1, 2]
    ] as const) {
      const cross = [
        rows[x]![1]! * rows[y]![2]! - rows[x]![2]! * rows[y]![1]!,
        rows[x]![2]! * rows[y]![0]! - rows[x]![0]! * rows[y]![2]!,
        rows[x]![0]! * rows[y]![1]! - rows[x]![1]! * rows[y]![0]!
      ];
      const norm = Math.hypot(...cross);
      if (norm > bestNorm) {
        best = cross;
        bestNorm = norm;
      }
    }

    if (best && bestNorm > 0) {
      vectors.push(best.map((value) => value / bestNorm));
    }
  }

  return vectors;
}

/** Real roots of λ³ + p λ² + q λ + r = 0. */
function cubicRoots(p: number, q: number, r: number): number[] {
  const shift = p / 3;
  const a = q - p * shift;
  const b = (2 * p * p * p) / 27 - (p * q) / 3 + r;
  const discriminant = (b * b) / 4 + (a * a * a) / 27;
  if (discriminant > 0) {
    const root = Math.cbrt(-b / 2 + Math.sqrt(discriminant)) + Math.cbrt(-b / 2 - Math.sqrt(discriminant));
    return [root - shift];
  }

  const radius = Math.sqrt(Math.max(0, -a / 3));
  if (radius === 0) {
    return [Math.cbrt(-b) - shift];
  }

  const angle = Math.acos(Math.min(1, Math.max(-1, (-b / 2) / (radius * radius * radius)))) / 3;
  return [0, 1, 2].map((k) => 2 * radius * Math.cos(angle - (2 * Math.PI * k) / 3) - shift);
}

/** Solves a small linear system by Gaussian elimination with partial pivoting; `undefined` when singular. */
function solveLinear(matrix: number[][], right: number[]): number[] | undefined {
  const n = right.length;
  const a = matrix.map((row, index) => [...row, right[index]!]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) {
        pivot = row;
      }
    }

    if (!(Math.abs(a[pivot]![column]!) > 1e-14)) {
      return undefined;
    }

    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    for (let row = column + 1; row < n; row++) {
      const factor = a[row]![column]! / a[column]![column]!;
      for (let k = column; k <= n; k++) {
        a[row]![k]! -= factor * a[column]![k]!;
      }
    }
  }

  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = a[row]![n]!;
    for (let k = row + 1; k < n; k++) {
      sum -= a[row]![k]! * solution[k]!;
    }

    solution[row] = sum / a[row]![row]!;
  }

  return solution;
}
