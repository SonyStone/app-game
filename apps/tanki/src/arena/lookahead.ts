import type { Camera } from './camera';
import type { Aim } from './input';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/**
 * A camera that looks ahead of the player's tank toward where the player aims, so the screen
 * shows more of what lies ahead and less of what lies behind. The view's center sits on the gun's
 * pivot plus a lead: `share` of the cursor's offset from the screen's center, a mirror of the
 * cursor about the tank shrunk to that share. The lead is read off the cursor's place on the
 * screen, never off the ground under it, which the lead itself moves, so it cannot run away.
 *
 * The gun aims at the ground under the cursor, and a cursor held still keeps the gun's aim
 * however the view settles, the tank drives or turns or the view zooms:
 *
 * - The view follows the gun's pivot rigidly: the pivot keeps its place on the screen, so the
 *   ground under a still cursor moves along with the tank and keeps its direction from the gun.
 * - The lead always lies on the line from the cursor through the screen's center, so the pivot,
 *   the screen's center and the cursor stay on one line: the gun's line, which runs from the
 *   pivot through the screen's center to the cursor. The lead is eased only along that line, so
 *   while it settles the ground under a still cursor slides along the gun's line, nearer or
 *   farther, and never across it. When the cursor moves round the screen's center, the lead swings
 *   round with it at once: easing it across the line as well would turn the gun after a still
 *   cursor for as long as the view settled.
 * - The lead is kept in screen pixels and screen axes, so zooming and turning the view keep the
 *   tank where it is on the screen and scale or turn the world about it.
 *
 * A stick's aim is a direction, which no camera changes: the lead eases toward that direction,
 * as far as `STICK_REACH` of the way to the screen's edge, at `share`. Without aim the lead eases
 * back to the tank. However far the cursor goes, even off the canvas, the lead stops short of
 * putting the tank closer than `EDGE_MARGIN` to the screen's edge.
 *
 * Call `place` once a frame before aiming, with `dt` 0, to center the view on where the tank is
 * now for the cursor as it is now, and again after physics with the frame's `dt` to ease the lead
 * and follow the tank.
 */
export function createLookAhead() {
  let lead: Point = { x: 0, y: 0 };

  return {
    /** From the tank's place on the screen to the screen's center, in screen pixels. */
    get lead() {
      return lead;
    },

    /**
     * Eases the lead over a frame of `dt` seconds for `aim` and centers `camera` on `pivot` plus the lead.
     *
     * @param pivot - Where the player's gun turns, in the world.
     * @param options.share - Share of the cursor's offset from the screen's center to lead by, 0 for none.
     */
    place(camera: Camera, screen: Size, pivot: Point, aim: Aim | undefined, options: { share: number; dt: number }) {
      lead = stepLead(lead, aim, screen, options.share, options.dt);
      centerOn(camera, pivot, lead);
    },

    /** Drops the lead at once, as when the view is handed to watching. */
    reset() {
      lead = { x: 0, y: 0 };
    }
  };
}

/** The look-ahead camera as returned by `createLookAhead`. */
export type LookAhead = ReturnType<typeof createLookAhead>;

/**
 * The lead after a frame of `dt` seconds, in screen pixels from the tank to the screen's center,
 * as `createLookAhead` describes: for a cursor, its projection on the line from the cursor
 * through the screen's center, eased along it toward `share` of the cursor's offset; for a
 * stick, eased toward its direction; without aim, eased back to none. A `dt` of 0 only puts the
 * lead on the cursor's line and keeps it on the screen.
 */
export function stepLead(lead: Point, aim: Aim | undefined, screen: Size, share: number, dt: number): Point {
  const ease = 1 - Math.exp(-dt / LEAD_TIME);

  if (aim?.kind === 'direction') {
    const direction = { x: Math.cos(aim.angle), y: Math.sin(aim.angle) };
    const goal = scale(direction, share * edgeDistance(screen, direction, 0) * STICK_REACH);
    return keepOnScreen(screen, mix(lead, goal, ease));
  }

  const offset = aim ? { x: aim.x - screen.width / 2, y: aim.y - screen.height / 2 } : { x: 0, y: 0 };
  const length = Math.hypot(offset.x, offset.y);

  // At the screen's center the cursor gives no direction: the lead shrinks along itself, which keeps the gun's aim too.
  if (length < CENTERED) {
    return keepOnScreen(screen, scale(lead, 1 - ease));
  }

  const along = scale(offset, 1 / length);
  const room = edgeDistance(screen, along, edgeMargin(screen));
  // Never farther from the screen's center than the cursor, so a cursor passing close by the center does not throw the view across it.
  const most = Math.min(room, length);
  const current = clamp(lead.x * along.x + lead.y * along.y, -most, most);
  const goal = clamp(share * length, -most, most);

  return scale(along, current + (goal - current) * ease);
}

/** Puts `camera`'s center at `pivot` plus `lead`, a screen offset in screen pixels, in the camera's zoom and rotation. */
export function centerOn(camera: Camera, pivot: Point, lead: Point) {
  const cos = Math.cos(-camera.rotation);
  const sin = Math.sin(-camera.rotation);
  camera.x = pivot.x + (lead.x * cos - lead.y * sin) / camera.zoom;
  camera.y = pivot.y + (lead.x * sin + lead.y * cos) / camera.zoom;
}

/**
 * Seconds over which the lead closes all but `1 / e` of its way to where it should be: about
 * 0.35 s to settle within a twentieth.
 */
const LEAD_TIME = 0.12;
/** A stick leads as if a cursor were this share of the way from the screen's center to its edge. */
const STICK_REACH = 0.8;
/** Screen pixels the tank stays clear of the screen's edge, at most a fifth of the screen's smaller side. */
const EDGE_MARGIN = 110;
/** Screen pixels from the screen's center within which a cursor counts as on the center. */
const CENTERED = 1;

function edgeMargin(screen: Size) {
  return Math.min(EDGE_MARGIN, Math.min(screen.width, screen.height) * 0.2);
}

/** The lead, cut short along itself where it would put the tank closer than the margin to the screen's edge. */
function keepOnScreen(screen: Size, lead: Point) {
  const length = Math.hypot(lead.x, lead.y);

  if (length < 1e-9) {
    return lead;
  }

  const room = edgeDistance(screen, scale(lead, 1 / length), edgeMargin(screen));
  return length > room ? scale(lead, room / length) : lead;
}

/** Distance from the screen's center along the unit `direction` to `margin` short of the screen's edge. */
function edgeDistance(screen: Size, direction: Point, margin: number) {
  const across = Math.abs(direction.x) > 1e-9 ? Math.max(screen.width / 2 - margin, 0) / Math.abs(direction.x) : Infinity;
  const down = Math.abs(direction.y) > 1e-9 ? Math.max(screen.height / 2 - margin, 0) / Math.abs(direction.y) : Infinity;
  return Math.min(across, down);
}

function mix(from: Point, to: Point, share: number) {
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
}

function scale(point: Point, factor: number) {
  return { x: point.x * factor, y: point.y * factor };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
