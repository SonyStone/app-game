import type { Point } from '../../kit/createSketchCanvas';

/**
 * A hand of cards fanned around a pivot, the way cards fan from the fingers that hold them: card `index` sits `radius`
 * from the pivot, turned `lean + (index − middle) · step` degrees clockwise from straight up. A `down` fan hangs below
 * its pivot, mirrored so that its cards stay upright with their tops toward the pivot. Sizes are screen pixels.
 */
export type Fan = {
  pivot: Point;
  /** From the pivot to each card's center. */
  radius: number;
  /** Degrees between neighbouring cards. */
  step: number;
  /** Degrees the whole fan turns clockwise. */
  lean: number;
  down: boolean;
  count: number;
  /** A card's size on screen. */
  width: number;
  height: number;
};

/** Where a card of a fan sits: its center, and its turn in degrees clockwise. */
export type Slot = { x: number; y: number; angle: number };

/**
 * The slot of card `index`. `turn` adds degrees around the pivot (neighbours of an inspected card part with it) and
 * `outward` moves the card away from the pivot (an inspected card rises).
 */
export function fanSlot(fan: Fan, index: number, turn = 0, outward = 0): Slot {
  const degrees = fan.lean + (index - (fan.count - 1) / 2) * fan.step + turn;
  const radians = (degrees * Math.PI) / 180;
  const distance = fan.radius + outward;
  return {
    x: fan.pivot.x + Math.sin(radians) * distance,
    y: fan.pivot.y + (fan.down ? 1 : -1) * Math.cos(radians) * distance,
    angle: fan.down ? -degrees : degrees
  };
}

/**
 * The card a point picks by its direction from the pivot, as a marking menu does, or `undefined` outside the fan:
 * nearer than `reach.inner`, farther than `reach.outer`, or past the outer cards' edges. Each card owns the strip of
 * it that shows: later cards lie on earlier ones, so a card shows from its left edge to its right neighbour's left
 * edge, and the last card shows whole. The `current` card, risen above the others, keeps the point while it is over
 * any of its width (`hold` times its half-width). Directions are stable while cards rise and part, so picks do not
 * flicker.
 */
export function fanIndexAt(
  fan: Fan,
  point: Point,
  reach: { inner: number; outer: number },
  current?: number,
  hold = 1
) {
  const across = point.x - fan.pivot.x;
  const out = (point.y - fan.pivot.y) * (fan.down ? 1 : -1);
  const distance = Math.hypot(across, out);
  if (distance < reach.inner || distance > reach.outer) {
    return undefined;
  }

  const degrees = (Math.atan2(across, out) * 180) / Math.PI;
  const halfWidth = (Math.atan2(fan.width / 2, fan.radius) * 180) / Math.PI;
  const first = fan.lean - ((fan.count - 1) / 2) * fan.step;
  if (degrees < first - halfWidth || degrees > first + (fan.count - 1) * fan.step + halfWidth) {
    return undefined;
  }

  if (current !== undefined && Math.abs(degrees - (first + current * fan.step)) <= halfWidth * hold) {
    return current;
  }

  return Math.min(fan.count - 1, Math.max(0, Math.floor((degrees - first + halfWidth) / fan.step)));
}

/** A screen rectangle by its edges. */
export type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Turns and, if needed, flips and shifts `fan` so that all its cards, also raised by `raise` and grown by `grow` as an
 * inspected card is, fit in `area`. Tries the given lean first, then straighter and steeper ones on either side, then
 * the mirrored fan below (or above) the pivot; when nothing fits, the fan that overflows least moves inside.
 */
export function placeFan(fan: Fan, area: Box, raise: number, grow: number): Fan {
  const leans = [1, 0, -1, 2, -2, 3, -3, 4, -4].map((factor) => fan.lean * factor || factor * 12);
  let best: { fan: Fan; overflow: number; shift: Point } | undefined;
  for (const down of [fan.down, !fan.down]) {
    for (const lean of leans) {
      const candidate = { ...fan, lean, down };
      const bounds = fanBounds(candidate, raise, grow);
      const shift = {
        x: shiftInto(bounds.left, bounds.right, area.left, area.right),
        y: shiftInto(bounds.top, bounds.bottom, area.top, area.bottom)
      };
      const overflow = Math.abs(shift.x) + Math.abs(shift.y);
      if (overflow < 0.5) {
        return candidate;
      }

      if (!best || overflow < best.overflow) {
        best = { fan: candidate, overflow, shift };
      }
    }
  }

  const { pivot } = best!.fan;
  return { ...best!.fan, pivot: { x: pivot.x + best!.shift.x, y: pivot.y + best!.shift.y } };
}

/** The box around every card of a fan, resting and raised. */
export function fanBounds(fan: Fan, raise: number, grow: number): Box {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const include = (slot: Slot, scale: number) => {
    const radians = (slot.angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const halfWidth = ((fan.width * cos + fan.height * sin) / 2) * scale;
    const halfHeight = ((fan.width * sin + fan.height * cos) / 2) * scale;
    bounds.left = Math.min(bounds.left, slot.x - halfWidth);
    bounds.right = Math.max(bounds.right, slot.x + halfWidth);
    bounds.top = Math.min(bounds.top, slot.y - halfHeight);
    bounds.bottom = Math.max(bounds.bottom, slot.y + halfHeight);
  };
  for (let index = 0; index < fan.count; index++) {
    include(fanSlot(fan, index), 1);
    include({ ...fanSlot(fan, index, 0, raise), angle: 0 }, grow);
  }

  return bounds;
}

/** How far a span must move to lie within `[min, max]`; a span too long for it is centered. */
export function shiftInto(low: number, high: number, min: number, max: number) {
  if (high - low > max - min) {
    return (min + max) / 2 - (low + high) / 2;
  }

  if (low < min) {
    return min - low;
  }

  if (high > max) {
    return max - high;
  }

  return 0;
}
