import type { Point } from '../../kit/createSketchCanvas';
import { clamp } from './geometry';

/**
 * Where the Dial's parts sit around its center, in CSS pixels: the dial, the orbit of beads around it (tools on the
 * hand's side, view buttons on top, colors below) and the detail card on the other side.
 */

/** The dial's outer radius. */
export const dialRadius = 122;

/** The radius on which the orbit's beads sit. */
export const orbitRadius = 156;

/** How far the orbit's band reaches from the center. */
export const orbitReach = orbitRadius + 22;

/** The card's distance from the center to its near edge, and its size. */
export const card = { gap: 188, width: 218, maxHeight: 336 } as const;

/** Space kept free at the top for the gallery's bar, and at the other edges. */
const topMargin = 52;
const margin = 8;

/**
 * The dial's center for an opening at `at`: as close to it as the whole cluster allows, so that nothing leaves a
 * `width` × `height` window. The orbit's tools face the pen's `hand`, the card the other side.
 */
export function clusterCenter(at: Point, hand: 'left' | 'right', width: number, height: number): Point {
  const far = card.gap + card.width;
  const left = hand === 'left' ? orbitReach : far;
  const right = hand === 'left' ? far : orbitReach;
  return {
    x: clamp(at.x, margin + left, width - margin - right),
    y: clamp(at.y, topMargin + orbitReach, height - margin - orbitReach)
  };
}

/** The card's top-left corner beside a dial centered at `center`. */
export function cardCorner(center: Point, hand: 'left' | 'right', height: number): Point {
  return {
    x: hand === 'left' ? center.x + card.gap : center.x - card.gap - card.width,
    y: clamp(center.y - 150, topMargin, height - margin - card.maxHeight)
  };
}

/** Keeps the mini-dial's center at least half its size plus a margin inside the window. */
export function clampHandle(at: Point, width: number, height: number): Point {
  const reach = 28 + margin;
  return { x: clamp(at.x, reach, width - reach), y: clamp(at.y, topMargin + 28, height - reach) };
}
