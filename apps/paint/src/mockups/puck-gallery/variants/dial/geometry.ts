import type { Point } from '../../kit/createSketchCanvas';

/**
 * Polar helpers for the dial. Angles are degrees clockwise from 12 o'clock, as a watch face reads them, in screen
 * coordinates (y points down).
 */

/** The point `radius` away from the origin at `degrees`. */
export function polar(radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: radius * Math.sin(radians), y: -radius * Math.cos(radians) };
}

/** The direction from `center` to `point`, 0–360. */
export function angleOf(point: Point, center: Point) {
  const degrees = (Math.atan2(point.x - center.x, center.y - point.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/** The shortest turn from `from` to `to`, −180–180; positive is clockwise. */
export function turnBetween(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** An SVG path along the circle of `radius` from `start` to `end` (clockwise, `end` > `start`, less than a turn). */
export function arcPath(radius: number, start: number, end: number) {
  const from = polar(radius, start);
  const to = polar(radius, end);
  const large = end - start > 180 ? 1 : 0;
  return `M${round(from.x)} ${round(from.y)}A${radius} ${radius} 0 ${large} 1 ${round(to.x)} ${round(to.y)}`;
}

/** An SVG path of the ring sector between `inner` and `outer` radii from `start` to `end`. */
export function sectorPath(inner: number, outer: number, start: number, end: number) {
  const a = polar(outer, start);
  const b = polar(outer, end);
  const c = polar(inner, end);
  const d = polar(inner, start);
  const large = end - start > 180 ? 1 : 0;
  return (
    `M${round(a.x)} ${round(a.y)}A${outer} ${outer} 0 ${large} 1 ${round(b.x)} ${round(b.y)}` +
    `L${round(c.x)} ${round(c.y)}A${inner} ${inner} 0 ${large} 0 ${round(d.x)} ${round(d.y)}Z`
  );
}

/** One SVG path of radial tick marks from `inner` to `outer` at each of `angles`. */
export function ticksPath(angles: readonly number[], inner: number, outer: number) {
  return angles
    .map((angle) => {
      const from = polar(inner, angle);
      const to = polar(outer, angle);
      return `M${round(from.x)} ${round(from.y)}L${round(to.x)} ${round(to.y)}`;
    })
    .join('');
}

/** Clamps `value` into `min`–`max`; `min` wins when the range is empty. */
export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
