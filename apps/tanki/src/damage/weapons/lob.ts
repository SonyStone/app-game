/**
 * The flight of a lobbed shell, such as a grenade, in height: it leaves the muzzle at its fixed
 * ground speed with just the upward speed that brings it down where it was thrown, so a long throw
 * flies high and a short one skims the ground. It bounces lower every time it lands and then rolls
 * until its fuse burns down. The battle core moves it over the ground and bounces it off walls and
 * bodies; this module only follows its height, so bots can predict where it will go off.
 */
export type LobSpec = {
  /** Seconds from launch until it goes off. */
  fuse: number;
  /** Downward acceleration in pixels per second squared. */
  gravity: number;
  /** Share of its falling speed it bounces back up with, and of its ground speed it keeps at each bounce. */
  bounce: number;
  /** Share of its speed it keeps when it bounces off a wall or a body. */
  rebound: number;
  /** Rate at which it slows down while rolling: its speed falls by `exp(-roll)` every second. */
  roll: number;
  /** Shortest throw in pixels: aiming closer still throws it this far, nearly flat. */
  minReach: number;
};

/** Height and vertical motion of a lobbed shell in flight. */
export type LobState = {
  /** Height above the ground in pixels. */
  height: number;
  /** Upward speed in pixels per second. */
  climb: number;
  /** It has touched the ground once, so a body it meets now only stops it instead of setting it off. */
  landed: boolean;
  /** Seconds since launch. */
  age: number;
};

/** A shell leaving the muzzle at ground speed `speed` to land `reach` pixels away, cut to `minReach` to `range`. */
export function launchLob(spec: LobSpec, speed: number, reach: number, range: number): LobState {
  const distance = Math.min(Math.max(reach, spec.minReach), range);
  const time = distance / speed;

  return { height: 0, climb: (spec.gravity * time) / 2, landed: false, age: 0 };
}

/**
 * Advances the height of a lobbed shell by `dt` seconds.
 *
 * @returns Whether it bounced off the ground this step; the caller then cuts its ground speed by
 *   `spec.bounce`.
 */
export function stepLob(spec: LobSpec, state: LobState, dt: number) {
  state.age += dt;

  if (state.height === 0 && state.climb === 0) {
    return false;
  }

  state.climb -= spec.gravity * dt;
  state.height += state.climb * dt;

  if (state.height > 0) {
    return false;
  }

  state.height = 0;
  state.landed = true;
  // A bounce too low to see ends the bouncing; it rolls from here.
  state.climb = -state.climb * spec.bounce < MIN_BOUNCE ? 0 : -state.climb * spec.bounce;
  return true;
}

/** Whether a lobbed shell of `state` is rolling on the ground, no longer bouncing. */
export function isRolling(state: LobState) {
  return state.height === 0 && state.climb === 0;
}

/**
 * How far over open ground a shell thrown `reach` pixels at ground speed `speed` gets before its
 * fuse burns down: its flight, its bounces and its roll.
 */
export function lobCarry(spec: LobSpec, speed: number, reach: number, range: number) {
  const state = launchLob(spec, speed, reach, range);
  let ground = speed;
  let travelled = 0;

  while (state.age < spec.fuse) {
    if (stepLob(spec, state, STEP)) {
      ground *= spec.bounce;
    }

    if (isRolling(state)) {
      ground *= Math.exp(-spec.roll * STEP);
    }

    travelled += ground * STEP;
  }

  return travelled;
}

/**
 * The throw, in pixels, after which a shell goes off as near as it can to `distance` pixels away
 * over open ground: the inverse of `lobCarry`, cut to the shortest and longest throw.
 */
export function reachFor(spec: LobSpec, speed: number, distance: number, range: number) {
  let low = spec.minReach;
  let high = range;

  if (lobCarry(spec, speed, low, range) >= distance) {
    return low;
  }

  for (let iteration = 0; iteration < 18; iteration++) {
    const middle = (low + high) / 2;

    if (lobCarry(spec, speed, middle, range) < distance) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return high;
}

/** Upward speed in pixels per second below which a landing shell stops bouncing. */
const MIN_BOUNCE = 40;
/** The physics step the battle runs at, for predictions. */
const STEP = 1 / 60;
