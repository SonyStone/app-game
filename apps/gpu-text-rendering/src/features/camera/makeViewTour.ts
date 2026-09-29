import type { Camera } from './camera';

/**
 * Plans flights through saved camera stops, separately from the renderer. Each leg starts from the camera passed to
 * the update that begins it, so a route starts, and resumes after interruption, from the displayed camera; its target
 * is fixed when it begins.
 *
 * A slow push-in rides on top of every flight, so the camera arrives with a little momentum instead of stopping dead.
 * While looping, the push-in runs at a constant rate through flights and holds alike, passing through each saved view
 * midway through its hold, so the tour never freezes. A single visit instead settles: the push-in fades out and the
 * route ends exactly on the stop.
 */
export function makeViewTour(options: {
  /** Index of the first stop to fly to; wrapped into the stop count. */
  start: number;
  /** Continues to the following stop after holding at each one, wrapping after the last. */
  loop: boolean;
}) {
  let index = options.start;
  let leg: ReturnType<typeof planLeg> | undefined;

  return {
    /**
     * Returns the camera at `timestamp` milliseconds, the index of the stop being approached or held, and whether the
     * route has ended. `stops` may change between updates; the current index wraps into its length. Requires at least
     * one stop.
     */
    update(timestamp: number, stops: readonly Camera[], camera: Camera) {
      if (!leg || (options.loop && timestamp - leg.start >= leg.length)) {
        index = (leg ? index + 1 : index) % stops.length;
        leg = planLeg(timestamp, camera, stops[index]!, options.loop);
      }

      index %= stops.length;
      const elapsed = timestamp - leg.start;

      return {
        camera: leg.at(elapsed),
        index,
        done: !options.loop && elapsed >= leg.length
      };
    }
  };
}

/** Milliseconds the tour spends at each stop after arriving, drifting through it, before flying to the next. */
export const holdMs = 2500;

/** Milliseconds a single visit keeps drifting after arriving, while the push-in fades out. */
export const settleMs = 1400;

/** Push-in speed as the natural log of zoom per second: about 3% closer each second. */
const driftRate = 0.03;

/**
 * Plans one leg starting at `start` milliseconds from `from` to `to`: a flight plus, while looping, a hold with a
 * constant push-in, or for a single visit a settle whose push-in eases to rest. The push-in is added to the flight's
 * log zoom and is zero where the view should match `to` exactly: mid-hold, or at the end of a visit. To start from
 * `from` regardless, the flight begins from `from` less the initial push-in offset.
 */
function planLeg(start: number, from: Camera, to: Camera, loop: boolean) {
  const flightMs = planFlight(from, to).duration;
  const length = flightMs + (loop ? holdMs : settleMs);
  const reach = (driftRate * length) / 2000;

  /** Log-zoom offset at `elapsed` milliseconds; positive is wider, and it shrinks as the camera pushes in. */
  const pushIn = loop
    ? (elapsed: number) => (driftRate * (flightMs + holdMs / 2 - elapsed)) / 1000
    : (elapsed: number) => reach * (1 - ease(Math.min(1, elapsed / length)));

  const flight = planFlight({ ...from, zoom: from.zoom * Math.exp(-pushIn(0)) }, to);

  return {
    start,
    /** Milliseconds from the leg's start until the next leg, or until a visit ends. */
    length,

    /** Camera at `elapsed` milliseconds into the leg. */
    at(elapsed: number): Camera {
      const camera = flight.at(ease(Math.min(1, elapsed / flightMs)));
      return { ...camera, zoom: camera.zoom * Math.exp(pushIn(elapsed)) };
    }
  };
}

/**
 * Plans the smooth zoom-and-pan path between two cameras from van Wijk and Nuij, "Smooth and efficient zooming and
 * panning" (2003): the view pulls back while travelling and settles in on arrival, moving at a steady apparent speed.
 * `at` maps linear progress in [0, 1] to a camera on the path; `duration` in milliseconds grows with the logarithm of
 * the path's perceived length, so short hops stay brisk and long journeys unhurried without dragging. Rotation turns
 * the shorter way.
 */
export function planFlight(from: Camera, to: Camera) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const turn = Math.atan2(Math.sin(to.rotation - from.rotation), Math.cos(to.rotation - from.rotation));
  const path = zoomPath(from.zoom, to.zoom, distance);

  return {
    duration: Math.min(maxFlightMs, minFlightMs + msPerPathLog * Math.log1p(path.length)),

    at(progress: number): Camera {
      const { travelled, zoom } = path.at(progress);
      const along = distance > 0 ? travelled / distance : 0;

      return {
        x: from.x + (to.x - from.x) * along,
        y: from.y + (to.y - from.y) * along,
        zoom,
        rotation: from.rotation + turn * progress
      };
    }
  };
}

/** Returns the camera at linear `progress` along the flight from one camera to another; see planFlight. */
export function flyCamera(from: Camera, to: Camera, progress: number) {
  return planFlight(from, to).at(progress);
}

/**
 * How strongly flights trade zooming out for panning: van Wijk and Nuij recommend about 1.4, which pulls back until
 * both ends are in view. Lower values pan more and pull back less.
 */
const rho = 0.55;

/** Shortest flight, for tiny hops and pure rotations. */
const minFlightMs = 1100;

/** Longest flight, however far apart the views are. */
const maxFlightMs = 4000;

/** Milliseconds added per unit of log(1 + path length): longer journeys take longer, with diminishing returns. */
const msPerPathLog = 1000;

/**
 * Parametrises the optimal path from view width `w0` to `w1` across `distance` (van Wijk and Nuij, equations 9-11).
 * Returns its perceived length and, for progress in [0, 1], the distance travelled and the view width.
 */
function zoomPath(w0: number, w1: number, distance: number) {
  const rho2 = rho * rho;

  // Without travel, zoom geometrically at the same apparent speed.
  if (distance < 1e-9) {
    const length = Math.abs(Math.log(w1 / w0)) / rho;

    return {
      length,
      at: (progress: number) => ({ travelled: 0, zoom: w0 * (w1 / w0) ** progress })
    };
  }

  const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * distance * distance) / (2 * w0 * rho2 * distance);
  const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * distance * distance) / (2 * w1 * rho2 * distance);
  // ln(√(b² + 1) − b), written as −asinh(b) to stay accurate when b is large.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const length = (r1 - r0) / rho;

  return {
    length,
    at(progress: number) {
      const s = progress * length;
      const coshR0 = Math.cosh(r0);

      return {
        travelled: (w0 / rho2) * (coshR0 * Math.tanh(rho * s + r0) - Math.sinh(r0)),
        zoom: (w0 * coshR0) / Math.cosh(rho * s + r0)
      };
    }
  };
}

/**
 * Eases progress in and out with zero velocity and acceleration at both ends (quintic smootherstep), so flights leave
 * and arrive without a jolt.
 */
function ease(t: number) {
  return t * t * t * (t * (6 * t - 15) + 10);
}
