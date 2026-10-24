import type { GunSpec } from './tanks';

/**
 * The state of a tank's gun, as `GunSpec` describes it: rounds in the clip, the wait before the
 * next shot and the round being loaded. Call `step` every physics step and `fire` to shoot.
 */
export function createGun(spec: GunSpec) {
  let rounds = spec.clip;
  let cooldown = 0;
  let loading = 0;
  let first = true;

  return {
    /** Rounds left in the clip. */
    get rounds() {
      return rounds;
    },

    /** Whether a shot can be fired now. */
    get ready() {
      return cooldown === 0 && rounds > 0;
    },

    /** How far the round being loaded is, 0-1; 0 while the gun fires or the clip is full. */
    get loading() {
      return rounds < spec.clip ? loading / (first ? spec.firstReload : spec.reload) : 0;
    },

    /** Lets `dt` seconds pass: the wait after a shot runs out, then rounds load one by one. */
    step(dt: number) {
      const quiet = Math.max(dt - cooldown, 0);
      // Six steps of 1/60 s fall a hair short of 0.1 s in floating point; that hair must not cost a seventh step.
      cooldown = cooldown - dt > EPSILON ? cooldown - dt : 0;

      if (rounds >= spec.clip || quiet === 0) {
        return;
      }

      loading += quiet;
      const needed = first ? spec.firstReload : spec.reload;

      if (loading >= needed) {
        loading -= needed;
        rounds++;
        first = false;

        if (rounds >= spec.clip) {
          loading = 0;
        }
      }
    },

    /** Takes a round for a shot if the gun is ready; returns whether it did. */
    fire() {
      if (cooldown > 0 || rounds === 0) {
        return false;
      }

      rounds--;
      cooldown = spec.interval;
      loading = 0;
      first = true;
      return true;
    }
  };
}

/** A tank's gun as returned by `createGun`. */
export type Gun = ReturnType<typeof createGun>;

/** Seconds of wait so short they count as none. */
const EPSILON = 1e-9;
