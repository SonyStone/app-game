import type { ShellSpec, Shot } from '../../damage/combat';
import type { TankClass } from '../tanks';

/**
 * How a class's trigger works. Every kind fires at a steady cadence for as long as the trigger is
 * held, a shot every `TankClass.interval` seconds, with no clip to run dry and no reload to wait
 * for, so there is nothing to keep count of in a fight:
 *
 * - `single`: a shell per shot, as the Soldier's rocket launcher.
 * - `volley`: `pellets` shells at once, spread evenly over `spread` radians, as a shotgun.
 * - `spin`: a gatling whose barrels take `spinUp` seconds to spin up before the first round, each
 *   round up to about `spread` radians off. Its barrels spin while the trigger is held, or while
 *   it is revved without firing (`Trigger.rev`), and run down over `BARRELS_DOWN` s after, so a
 *   gatling caught cold gives its target a moment to get away, and one revved ahead fires at once.
 *   Spinning slows the tank to `slowdown` of its speed, as the Heavy slows to a crawl with his
 *   minigun spinning.
 * - `lob`: a grenade thrown to where the gun is aimed.
 * - `charge`: holding the trigger charges the shot for up to `time` seconds and letting go fires
 *   it: from the class's `shell` with no charge to `full` at full charge (see `chargedShell`), a
 *   rail for the Sniper whose power grows with the charge. The charge is the aiming, not a reload:
 *   the next one starts as soon as the trigger is held again, once the interval since the last
 *   shot has passed. Charging slows the tank to `slowdown` of its speed.
 */
export type WeaponSpec =
  | { kind: 'single' }
  | { kind: 'volley'; pellets: number; spread: number }
  | { kind: 'spin'; spread: number; slowdown: number; spinUp: number }
  | { kind: 'lob' }
  | { kind: 'charge'; time: number; full: ShellSpec; slowdown: number };

/**
 * What the trigger is doing this step: held, how far away a grenade should land, whether letting
 * go drops a charge instead of firing it, and whether a gatling's barrels spin without firing.
 */
export type Trigger = { fire: boolean; reach?: number; cancel?: boolean; rev?: boolean };

/**
 * The weapon of a tank of `tankClass`: the wait between its shots and the trigger of its
 * `WeaponSpec`. Call `step` every physics step with the trigger; it returns the shots to fire this
 * step, which the caller aims along the gun and hands to the battle's `fire`. The class's
 * interval, shell and `WeaponSpec` are read anew at every use, so the class editor's changes
 * (see `applyClassTuning`) reach a weapon already in a tank's hands.
 *
 * @param random - Source of randomness in [0, 1) for the spread of pellets and gatling rounds.
 */
export function createWeapon(tankClass: TankClass, random: () => number) {
  let cooldown = 0;
  let spin = 0;
  let charged: number | undefined;
  let shots = 0;

  return {
    /** The class whose weapon this is. */
    tankClass,

    /** Whether a pull of the trigger would fire now: the interval since the last shot has passed. */
    get ready() {
      return cooldown === 0;
    },

    /** How fast a gatling's barrels spin, 0-1, for drawing them and slowing the tank; always 0 for other weapons. */
    get spin() {
      return spin;
    },

    /** Charge of a shot being charged, 0-1, or `undefined` while none is. */
    get charge() {
      const spec = tankClass.weapon;
      return charged === undefined || spec.kind !== 'charge' ? undefined : Math.min(charged / spec.time, 1);
    },

    /** Shots fired so far, so a caller can tell when the weapon fired. */
    get shots() {
      return shots;
    },

    /** Share of its speed the tank keeps: less while a gatling spins or a shot charges. */
    get speedShare() {
      const spec = tankClass.weapon;

      if (spec.kind === 'spin') {
        return 1 - (1 - spec.slowdown) * spin;
      }

      return spec.kind === 'charge' && charged !== undefined ? spec.slowdown : 1;
    },

    /**
     * Lets `dt` seconds pass with the trigger as given: the wait after the last shot runs out, a
     * gatling's barrels spin, a shot charges. Returns the shots fired this step, with angles
     * relative to the gun.
     */
    step(dt: number, trigger: Trigger): Shot[] {
      // Six steps of 1/60 s fall a hair short of 0.1 s in floating point; that hair must not cost a seventh step.
      cooldown = cooldown - dt > EPSILON ? cooldown - dt : 0;
      const fired = pull(dt, trigger);
      shots += fired.length;

      if (fired.length > 0) {
        cooldown = tankClass.interval;
      }

      return fired;
    }
  };

  function pull(dt: number, trigger: Trigger): Shot[] {
    const spec = tankClass.weapon;
    const shell = tankClass.shell;
    const ready = cooldown === 0;

    switch (spec.kind) {
      case 'single':
      case 'lob':
        return trigger.fire && ready ? [{ shell, reach: trigger.reach }] : [];

      case 'volley': {
        if (!trigger.fire || !ready) {
          return [];
        }

        const volley = Array.from({ length: spec.pellets }, (_, index) => {
          const even = spec.pellets > 1 ? (index / (spec.pellets - 1) - 0.5) * spec.spread : 0;
          return even + (random() - 0.5) * (spec.spread / spec.pellets) * 0.5;
        });

        return [{ shell, volley, flash: 0.8 }];
      }

      case 'spin': {
        const spinning = trigger.fire || trigger.rev;
        spin = spinning ? (spec.spinUp > 0 ? Math.min(spin + dt / spec.spinUp, 1) : 1) : Math.max(spin - dt / BARRELS_DOWN, 0);

        if (!trigger.fire || !ready || spin < 1) {
          return [];
        }

        // The spread is a triangle of two uniforms: most rounds fly near the aim, a few wide.
        const angle = (random() + random() - 1) * spec.spread;
        return [{ shell, angle, flash: 0.35 }];
      }

      case 'charge': {
        if (trigger.fire) {
          if (charged !== undefined || ready) {
            charged = Math.min((charged ?? 0) + dt, spec.time);
          }

          return [];
        }

        if (charged === undefined || trigger.cancel) {
          charged = undefined;
          return [];
        }

        const charge = Math.min(charged / spec.time, 1);
        charged = undefined;
        return [{ shell: chargedShell(shell, spec.full, charge), flash: 0.7 + 0.5 * charge }];
      }
    }
  }
}

/** A tank's weapon as returned by `createWeapon`. */
export type Weapon = ReturnType<typeof createWeapon>;

/** Seconds of wait so short they count as none. */
const EPSILON = 1e-9;
/** Seconds a gatling's barrels take to run down once it stops. */
const BARRELS_DOWN = 0.5;

/**
 * The shell a charged shot fires at `charge` 0-1: speed, range, hole, depth, knockback and size
 * grow from `empty` to `full`, and so do a rail's power, the width of its slit and how near the
 * core it must pass to blow it, a rail of `full`'s from `FULL_CHARGE` on. A rail's infinite speed stays
 * infinite.
 */
export function chargedShell(empty: ShellSpec, full: ShellSpec, charge: number): ShellSpec {
  const mix = (from: number, to: number) => (from === to ? from : from + (to - from) * charge);
  const rail =
    empty.rail &&
    full.rail &&
    (charge >= FULL_CHARGE
      ? full.rail
      : {
          power: mix(empty.rail.power, full.rail.power),
          slit: mix(empty.rail.slit, full.rail.slit),
          graze: mix(empty.rail.graze ?? empty.rail.slit / 2, full.rail.graze ?? full.rail.slit / 2)
        });

  return {
    ...empty,
    speed: mix(empty.speed, full.speed),
    range: mix(empty.range, full.range),
    hole: mix(empty.hole, full.hole),
    depth: mix(empty.depth, full.depth),
    knockback: mix(empty.knockback, full.knockback),
    size: mix(empty.size ?? 1, full.size ?? 1),
    rail
  };
}

/** Charge from which a charged shot counts as full, as the display shows it. */
export const FULL_CHARGE = 0.95;
