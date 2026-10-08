import type { Point } from '../../kit/createSketchCanvas';

/**
 * The Orbit's measurements and polar helpers. Lengths are CSS pixels from the disc's center (before the whole UI
 * scales down to fit a small window). Angles are degrees clockwise from 12 o'clock, as a clock and the canvas
 * rotation count them. Layouts are given for a left-handed painter, with the tools on the left (negative angles) and
 * the settings on the right (positive angles); the other hand multiplies every angle by `side`.
 */

/** Radii of the disc's rings, from the rim inward. */
export const disc = {
  radius: 196,
  /** The rotation rim runs from here to `radius`. */
  rimInner: 164,
  /** The rim's track line and handle. */
  track: 180,
  /** The ring of brush preset slots. */
  presets: 136,
  slot: 44,
  /** Recent colors and the current/previous dot. */
  recent: 97,
  hueOuter: 80,
  hueInner: 64,
  /** The side of the saturation/value square inside the hue ring. */
  square: 88
} as const;

/** Where each satellite sits: a signed angle (left-hand layout) and a radius. */
export const satellites = {
  undo: { angle: -22, radius: 226 },
  fit: { angle: 0, radius: 224 },
  redo: { angle: 22, radius: 226 },
  pan: { angle: -160, radius: 226 },
  flip: { angle: -173, radius: 224 },
  symmetry: { angle: 173, radius: 224 },
  zoom: { angle: 160, radius: 226 },
  pager: { angle: 90, radius: 238 },
  layers: { angle: 90, radius: 278 }
} as const;

/** The tools' arc on the hand side: the first tool at the top, the others below it. */
export const toolArc = { first: -48, step: -12, radius: 234 } as const;

/** The angle of preset slot `index`; twelve slots, half a step off 12 o'clock so the top stays free. */
export function presetAngle(index: number) {
  return 15 + index * 30;
}

/** The angle of recent color `index` (newest first), clockwise from just past the current/previous dot. */
export function recentAngle(index: number) {
  return 28 + index * (304 / 11);
}

/** Where an angle and a radius land, relative to the disc's center. */
export function polar(degrees: number, radius: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: radius * Math.sin(radians), y: -radius * Math.cos(radians) };
}

/** The angle of a point around the disc's center, in (-180, 180]. */
export function angleOf(point: Point) {
  return (Math.atan2(point.x, -point.y) * 180) / Math.PI;
}

/** Wraps degrees into [-180, 180). */
export function wrap(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** An SVG arc along `radius` from angle `from` to `to`: clockwise when `to` is larger, counter-clockwise otherwise. */
export function arcPath(radius: number, from: number, to: number) {
  const start = polar(from, radius);
  const end = polar(to, radius);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x} ${end.y}`;
}

/** A closed ring sector between radii `inner` and `outer`, spanning the angles `from` and `to` in either order. */
export function sectorPath(inner: number, outer: number, from: number, to: number) {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const large = high - low > 180 ? 1 : 0;
  const a = polar(low, outer);
  const b = polar(high, outer);
  const c = polar(high, inner);
  const d = polar(low, inner);
  return (
    `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} ` +
    `L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y} Z`
  );
}

/** A radial line across a ring at `angle`, from `inner` to `outer`. */
export function spokePath(angle: number, inner: number, outer: number) {
  const a = polar(angle, inner);
  const b = polar(angle, outer);
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

/**
 * One place for a setting around the rim on the non-hand side: a ring (`radius`) and an arc from `low` to `high`
 * (actual angles, `low < high`). Values grow clockwise, from `low` to `high`, as a knob turns. Text along the arc
 * reads upright: clockwise on the upper half, counter-clockwise on the lower half, and its readout sits at the end
 * farther from 3 o'clock (or 9 o'clock), where the text is nearly level.
 */
export type SettingSlot = {
  radius: number;
  low: number;
  high: number;
  upper: boolean;
  /** The arc's angle at `t` pixels from where its text path starts. */
  along: (t: number) => number;
  /** The text path, in reading direction. */
  textPath: string;
  /** The text path's length in pixels. */
  length: number;
  /** Where the readout anchors on the text path. */
  anchor: 'start' | 'end';
};

/** The rings that settings use, inside out. */
export const settingRings = [224, 251, 278] as const;
/** The thickness of one setting's band; rings sit 3 px apart. */
export const settingBand = 24;

/**
 * Setting slot `index`: the inner ring's upper and lower arcs first, then the middle ring's, then the outer ring's.
 * `side` is 1 for the left hand (settings on the right) and -1 for the right hand.
 */
export function settingSlot(index: number, side: 1 | -1): SettingSlot {
  const radius = settingRings[Math.min(settingRings.length - 1, Math.floor(index / 2))]!;
  const upper = index % 2 === 0;
  const [near, far] = upper ? [34, 84] : [96, 146];
  const low = side > 0 ? near : -far;
  const high = side > 0 ? far : -near;
  const length = (radius * (high - low) * Math.PI) / 180;
  const degreesPerPixel = 180 / (Math.PI * radius);
  // Upper arcs read clockwise (low → high), lower ones counter-clockwise (high → low).
  const along = (t: number) => (upper ? low + t * degreesPerPixel : high - t * degreesPerPixel);
  return {
    radius,
    low,
    high,
    upper,
    along,
    textPath: upper ? arcPath(radius, low, high) : arcPath(radius, high, low),
    length,
    anchor: side > 0 ? 'start' : 'end'
  };
}

/** How far the UI reaches from the disc's center on each side, for keeping it inside the window. */
export const reach = {
  /** Toward the hand: the tools' arc with its key badges. */
  hand: 262,
  /** Away from the hand with the layers folded: the outer settings ring and the layers orb. */
  folded: 298,
  vertical: 246
} as const;

/** The layers panel: a crescent hugging the settings rings, its inner edge on a circle of `radius`. */
export const crescent = { radius: 300, lineWidth: 196, line: 30, pitch: 31, padding: 6 } as const;

/** The panel's height for `lines` lines. */
export function crescentHeight(lines: number) {
  return crescent.padding * 2 + lines * crescent.pitch - 1;
}

/** How far the panel's crescent reaches from the disc's center, at its middle. */
export const crescentReach = crescent.radius + crescent.lineWidth + crescent.padding * 2 + 4;

/** The inner edge of the crescent at height `y`: the circle around the disc, or its radius beyond it. */
export function crescentEdge(y: number) {
  return Math.sqrt(Math.max(0, crescent.radius ** 2 - y ** 2));
}

/** Clamps `value` into `[min, max]`; the middle when the range is empty. */
export function clamp(value: number, min: number, max: number) {
  if (min > max) {
    return (min + max) / 2;
  }

  return Math.min(max, Math.max(min, value));
}
