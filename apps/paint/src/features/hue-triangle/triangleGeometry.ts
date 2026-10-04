import type { Point } from '@app-game/paint-core/camera';

/**
 * The saturation and value triangle inside a hue ring, as in GTK's and Krita's HSV triangle: its corners are the pure
 * hue, white and black, and it turns with the hue so the hue corner points at the hue on the ring. Points are relative
 * to the center with y down, and `radius` is the distance from the center to each corner. Hue is in degrees, 0 at the
 * top and increasing clockwise, as CSS conic gradients draw it.
 */
export function triangleCorners(hue: number, radius: number): { hue: Point; white: Point; black: Point } {
  return {
    hue: polar(hue, radius),
    white: polar(hue + 120, radius),
    black: polar(hue + 240, radius)
  };
}

/** The point of saturation `s` and value `v`, both from 0 to 1: weights `s·v` on the hue, `v·(1−s)` on white. */
export function pointFromSv(s: number, v: number, hue: number, radius: number): Point {
  const corners = triangleCorners(hue, radius);
  const weights = [s * v, v * (1 - s), 1 - v] as const;
  return {
    x: weights[0] * corners.hue.x + weights[1] * corners.white.x + weights[2] * corners.black.x,
    y: weights[0] * corners.hue.y + weights[1] * corners.white.y + weights[2] * corners.black.y
  };
}

/** Saturation and value at `point`, taken at the nearest point of the triangle when it lies outside. */
export function svFromPoint(point: Point, hue: number, radius: number): { s: number; v: number } {
  const [a, b, c] = clampedWeights(point, hue, radius);
  const v = a + b;
  return { s: v > 1e-6 ? a / v : 0, v: Math.min(1, Math.max(0, v)) };
}

/**
 * Barycentric weights of `point` on the hue, white and black corners, unclamped: all of them are positive inside.
 * Multiplied by the triangle's height they are the distances to the opposite edges.
 */
export function triangleWeights(point: Point, hue: number, radius: number): [number, number, number] {
  const { hue: a, white: b, black: c } = triangleCorners(hue, radius);
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  const wa = ((b.x - point.x) * (c.y - point.y) - (c.x - point.x) * (b.y - point.y)) / area;
  const wb = ((c.x - point.x) * (a.y - point.y) - (a.x - point.x) * (c.y - point.y)) / area;
  return [wa, wb, 1 - wa - wb];
}

/** The weights of the nearest point of the triangle: negative ones are dropped and the rest projected onto an edge. */
function clampedWeights(point: Point, hue: number, radius: number): [number, number, number] {
  const weights = triangleWeights(point, hue, radius);
  if (weights.every((weight) => weight >= 0)) {
    return weights;
  }

  const corners = Object.values(triangleCorners(hue, radius));
  let best: [number, number, number] = [1, 0, 0];
  let distance = Infinity;
  for (let edge = 0; edge < 3; edge++) {
    const from = corners[edge]!,
      to = corners[(edge + 1) % 3]!;
    const dx = to.x - from.x,
      dy = to.y - from.y;
    const t = Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
    const nearest = { x: from.x + dx * t, y: from.y + dy * t };
    const candidate = Math.hypot(point.x - nearest.x, point.y - nearest.y);
    if (candidate < distance) {
      distance = candidate;
      best = [0, 0, 0];
      best[edge] = 1 - t;
      best[(edge + 1) % 3] = t;
    }
  }

  return best;
}

/** The hue of a point around the center, in degrees from the top, clockwise. */
export function hueAt(point: Point): number {
  return ((Math.atan2(point.x, -point.y) * 180) / Math.PI + 360) % 360;
}

function polar(degrees: number, radius: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}
