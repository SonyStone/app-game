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

/** A gamut mask of `gamutMasks`, or `custom` for a shape of the user's. */
export type GamutMask = keyof typeof gamutMasks | 'custom';

/**
 * The mask's polygon turned clockwise by `angle` degrees: a preset's, or `custom` points for a custom mask; empty for
 * no mask.
 */
export function maskPolygon(mask: GamutMask, angle: number, custom: readonly DiskPoint[] = []): DiskPoint[] {
  const turn = (angle * Math.PI) / 180;
  const cos = Math.cos(turn),
    sin = Math.sin(turn);
  const points = mask === 'custom' ? custom : gamutMasks[mask].points;
  return points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
}

/** Masks with few enough corners to drag them, which turns the mask into a custom one. */
export function editableMask(mask: GamutMask, custom: readonly DiskPoint[]) {
  return (mask === 'custom' ? custom.length : gamutMasks[mask].points.length) >= 3 && mask !== 'atmosphere';
}

/**
 * A mask polygon with corner `index` moved to `point`, kept inside the disk; the polygon is that of the mask as shown,
 * so the result is a custom mask at angle 0.
 */
export function moveMaskCorner(polygon: readonly DiskPoint[], index: number, point: DiskPoint): DiskPoint[] {
  const inside = insideDisk(point);
  return polygon.map((corner, at) => (at === index ? inside : corner));
}

/** Most corners a custom mask can have; adding stops there. */
export const maxMaskCorners = 16;

/**
 * A mask polygon with a new corner at `point`, kept inside the disk, between corner `after` and the next one; as
 * `moveMaskCorner`, the result is a custom mask at angle 0. Returns the polygon unchanged at `maxMaskCorners`.
 */
export function insertMaskCorner(polygon: readonly DiskPoint[], after: number, point: DiskPoint): DiskPoint[] {
  if (polygon.length >= maxMaskCorners) {
    return [...polygon];
  }

  return [...polygon.slice(0, after + 1), insideDisk(point), ...polygon.slice(after + 1)];
}

/** A mask polygon without corner `index`, as a custom mask at angle 0; a triangle keeps all its corners. */
export function removeMaskCorner(polygon: readonly DiskPoint[], index: number): DiskPoint[] {
  return polygon.length > 3 ? polygon.filter((_, at) => at !== index) : [...polygon];
}

/** `point`, or the nearest point of the rim when it lies outside the disk. */
function insideDisk(point: DiskPoint): DiskPoint {
  const length = Math.hypot(point.x, point.y);
  return length > 1 ? { x: point.x / length, y: point.y / length } : point;
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
