import type { WheelColor } from './oklch';

/** A point of the wheel's unit disk in screen orientation: hue 0 at the top, increasing clockwise; y grows down. */
export type DiskPoint = { x: number; y: number };

/** The disk point of a color's hue and saturation. */
export function toDisk({ s, h }: Pick<WheelColor, 's' | 'h'>): DiskPoint {
  const angle = (h * Math.PI) / 180;
  return { x: s * Math.sin(angle), y: -s * Math.cos(angle) };
}

/** Hue and saturation at a disk point; points beyond the rim take its saturation, 1. */
export function fromDisk({ x, y }: DiskPoint): Pick<WheelColor, 's' | 'h'> {
  return { s: Math.min(1, Math.hypot(x, y)), h: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360 };
}

/**
 * Color harmonies as hue offsets in degrees from the chosen color: the other colors of the scheme, at the same
 * lightness and saturation.
 */
export const harmonies = {
  none: { label: 'No harmony', offsets: [] },
  complementary: { label: 'Complementary', offsets: [180] },
  analogous: { label: 'Analogous', offsets: [-30, 30] },
  triad: { label: 'Triad', offsets: [120, 240] },
  split: { label: 'Split complementary', offsets: [150, 210] },
  square: { label: 'Square', offsets: [90, 180, 270] }
} as const satisfies Record<string, { label: string; offsets: readonly number[] }>;

/** A harmony of `harmonies`. */
export type Harmony = keyof typeof harmonies;

/** The other colors of `harmony` for `color`. */
export function harmonyColors(color: WheelColor, harmony: Harmony): WheelColor[] {
  return harmonies[harmony].offsets.map((offset) => ({ ...color, h: (((color.h + offset) % 360) + 360) % 360 }));
}

/**
 * Gamut masks after James Gurney: shapes on the wheel that limit a painting to the colors inside them. Each is a
 * polygon of disk points before rotation, the first five covering the neutral center.
 */
export const gamutMasks = {
  none: { label: 'No mask', points: [] },
  triangle: { label: 'Triad', points: polygon([0, 120, 240], 0.95) },
  split: { label: 'Split complementary', points: [at(0, 0.95), at(155, 0.8), at(205, 0.8)] },
  complementary: {
    label: 'Complementary',
    points: [at(-12, 0.95), at(12, 0.95), at(90, 0.2), at(168, 0.95), at(192, 0.95), at(270, 0.2)]
  },
  square: { label: 'Square', points: polygon([0, 90, 180, 270], 0.9) },
  atmosphere: { label: 'Atmospheric', points: circle({ x: 0, y: -0.35 }, 0.45) }
} as const satisfies Record<string, { label: string; points: readonly DiskPoint[] }>;

/** A gamut mask of `gamutMasks`. */
export type GamutMask = keyof typeof gamutMasks;

/** The mask's polygon turned clockwise by `angle` degrees; empty for no mask. */
export function maskPolygon(mask: GamutMask, angle: number): DiskPoint[] {
  const turn = (angle * Math.PI) / 180;
  const cos = Math.cos(turn),
    sin = Math.sin(turn);
  return gamutMasks[mask].points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
}

/** `point` itself when inside `polygon` or without a polygon, otherwise the nearest point of its edge. */
export function clampToPolygon(point: DiskPoint, polygon: readonly DiskPoint[]): DiskPoint {
  if (polygon.length < 3 || contains(polygon, point)) {
    return point;
  }

  let nearest = polygon[0]!,
    distance = Infinity;
  for (const [index, start] of polygon.entries()) {
    const end = polygon[(index + 1) % polygon.length]!;
    const dx = end.x - start.x,
      dy = end.y - start.y;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
    const candidate = { x: start.x + t * dx, y: start.y + t * dy };
    const candidateDistance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (candidateDistance < distance) {
      nearest = candidate;
      distance = candidateDistance;
    }
  }

  return nearest;
}

/** Whether `point` lies inside `polygon`, by the even-odd rule. */
export function contains(polygon: readonly DiskPoint[], point: DiskPoint) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!,
      b = polygon[previous]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }

  return inside;
}

function at(hue: number, saturation: number): DiskPoint {
  return toDisk({ h: hue, s: saturation });
}

function polygon(hues: readonly number[], saturation: number) {
  return hues.map((hue) => at(hue, saturation));
}

function circle(center: DiskPoint, radius: number) {
  return Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}
