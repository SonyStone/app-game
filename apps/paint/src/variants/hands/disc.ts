import type { Hsv } from '../../features/color/hsv';
import { discColor, discPoint } from '../../shared/ui/colorDisc';
import type { Point } from './geometry';

/**
 * The color disc a long press opens under the free hand's finger: a hue ring around a saturation × brightness disc
 * (see `shared/ui/colorDisc`). Radii in CSS pixels.
 */
export const disc = {
  /** Outer radius of the hue ring. */
  outer: 124,
  /** Inner radius of the hue ring. */
  ringInner: 96,
  /** Radius of the saturation × brightness disc. */
  inner: 88
};

/**
 * Where the disc opens: centered so that the current color's point lies under the finger, so that lifting without
 * sliding keeps the color, but moved inside `view` (client pixels) where it would leave it.
 */
export function discCenter(finger: Point, color: Hsv, view: { left: number; top: number; width: number; height: number }) {
  const { u, v } = discPoint(color.s, color.v);
  const margin = disc.outer + 8;
  return {
    x: Math.min(view.left + view.width - margin, Math.max(view.left + margin, finger.x - u * disc.inner)),
    y: Math.min(view.top + view.height - margin, Math.max(view.top + margin, finger.y - v * disc.inner))
  };
}

/**
 * The color a finger at `point` chooses on a disc centered at `center`, starting from `color`: on the hue ring and
 * beyond it the hue at the finger's angle (clockwise from the right, as the ring is painted), inside it the saturation
 * and brightness at the finger.
 */
export function discPick(center: Point, point: Point, color: Hsv): Hsv {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.hypot(dx, dy) > (disc.inner + disc.ringInner) / 2) {
    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { ...color, h: (degrees + 360) % 360 };
  }

  const { saturation, value } = discColor(dx / disc.inner, dy / disc.inner);
  return { ...color, s: saturation, v: value };
}
