import { screenToWorld, type Camera } from '../../arena/camera';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/**
 * The Sniper's scope: while the player's casemate gun charges a shot, the view zooms out to
 * `SCOPE_ZOOM` of the zoom it had, about the cursor, and back in once the shot is gone, so the
 * sniper sees farther around what it aims at. Zooming about the cursor keeps the ground under the
 * cursor where it is: the gun, which aims at that point, holds its aim however the view changes.
 * A view that slid forward along the gun instead moved the ground under a still cursor, the gun
 * turned after it, and the view slid on.
 *
 * Call `step` once a frame after the player's own zoom and before the camera follows the tank.
 * While `amount` is above 0 the camera should give the tank more room before it follows, as
 * following moves the ground under the cursor too; `followMargin` says how much.
 */
export function createScope() {
  let amount = 0;

  return {
    /** How far the view has zoomed out, from 0, not at all, to 1, fully. */
    get amount() {
      return amount;
    },

    /**
     * The share of the half screen the tank may stray from the middle before the camera follows
     * it, from `normal` unscoped to `SCOPE_MARGIN` fully scoped, so the camera eases back to
     * following as the scope closes.
     */
    followMargin(normal: number) {
      return normal + (SCOPE_MARGIN - normal) * amount;
    },

    /**
     * Eases the scope toward open while `on`, else toward closed, over a frame of `dt` seconds, and
     * zooms `camera` by as much as it changed about `anchor`, a point on `screen` in screen pixels:
     * the cursor, or for aim that does not depend on the camera, such as a stick's, the tank.
     */
    step(camera: Camera, screen: Size, anchor: Point, on: boolean, dt: number) {
      const before = amount;
      const goal = on ? 1 : 0;
      amount += (goal - amount) * Math.min(dt * SCOPE_SPEED, 1);

      if (Math.abs(goal - amount) < SETTLED) {
        amount = goal;
      }

      zoomAbout(camera, screen, anchor, zoomAt(amount) / zoomAt(before));
    },

    /** Closes the scope at once without touching the camera, as when the view is handed to watching. */
    reset() {
      amount = 0;
    }
  };
}

/** The scope as returned by `createScope`. */
export type Scope = ReturnType<typeof createScope>;

/** Multiplies `camera`'s zoom by `factor`, moving it so the ground under `anchor`, a point on `screen`, stays where it is. */
export function zoomAbout(camera: Camera, screen: Size, anchor: Point, factor: number) {
  if (factor === 1) {
    return;
  }

  const before = screenToWorld(camera, anchor, screen);
  camera.zoom *= factor;
  const after = screenToWorld(camera, anchor, screen);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

/** Zoom against the unscoped view at scope `amount`. */
function zoomAt(amount: number) {
  return 1 - (1 - SCOPE_ZOOM) * amount;
}

/**
 * The fully scoped view is `SCOPE_ZOOM` of the zoom it had, two and a third times the ground; the
 * scope opens or closes `SCOPE_SPEED` of the rest of the way per second, nine tenths in 0.4 s,
 * and counts as settled within `SETTLED`.
 */
const SCOPE_ZOOM = 0.65;
const SCOPE_SPEED = 6;
const SETTLED = 1e-3;
/** Share of the half screen the tank may stray from the middle while fully scoped before the camera follows it. */
const SCOPE_MARGIN = 0.75;
