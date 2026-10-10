import type { Camera } from '../camera';

/**
 * Follows the camera across frames and extrapolates where a pan or zoom in progress will be `lookaheadMs` later, so
 * the virtual texture can load the pages the view is about to reach. `update` takes each frame's camera and
 * `performance.now()` time and returns the camera ahead, or `undefined` while the view stands still or moves too
 * slowly to need it. A pause longer than `pauseMs` starts the motion over.
 */
export function createCameraMotion(lookaheadMs = 250) {
  let previous: { camera: Camera; time: number } | undefined;
  let velocity = { x: 0, y: 0, zoom: 0 };
  return {
    update(camera: Camera, time: number): Camera | undefined {
      const last = previous;
      previous = { camera, time };
      const elapsed = last ? time - last.time : 0;
      if (!last || elapsed <= 0 || elapsed > pauseMs) {
        velocity = { x: 0, y: 0, zoom: 0 };
        return undefined;
      }

      const current = {
        x: (camera.x - last.camera.x) / elapsed,
        y: (camera.y - last.camera.y) / elapsed,
        zoom: Math.log(camera.zoom / last.camera.zoom) / elapsed
      };
      velocity = {
        x: velocity.x * smoothing + current.x * (1 - smoothing),
        y: velocity.y * smoothing + current.y * (1 - smoothing),
        zoom: velocity.zoom * smoothing + current.zoom * (1 - smoothing)
      };
      const screenSpeed = Math.hypot(velocity.x, velocity.y) * camera.zoom;
      if (screenSpeed < minimumScreenSpeed && Math.abs(velocity.zoom) < minimumZoomRate) {
        return undefined;
      }

      const zoom = camera.zoom * Math.exp(Math.max(-Math.LN2, Math.min(Math.LN2, velocity.zoom * lookaheadMs)));
      return { ...camera, x: camera.x + velocity.x * lookaheadMs, y: camera.y + velocity.y * lookaheadMs, zoom };
    }
  };
}

/** A gap between frames, in milliseconds, after which the view is taken to have stopped. */
const pauseMs = 100;

/** Weight of the earlier velocity when a new frame arrives, damping uneven frame timing. */
const smoothing = 0.5;

/** Slowest pan worth loading ahead for, in CSS pixels per millisecond (50 px/s). */
const minimumScreenSpeed = 0.05;

/** Slowest zoom worth loading ahead for, in natural-log zoom per millisecond (about 10% per second). */
const minimumZoomRate = 0.0001;
