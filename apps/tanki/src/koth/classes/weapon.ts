import type { ShellSpec, Shot } from '../../damage/combat';
import { createGun } from '../gun';
import type { TankClass } from '../tanks';

/**
 * How a class's trigger works; every kind fires from the class's clip (`TankClass.gun`):
 *
 * - `single`: a shell per round while the trigger is held, as the Soldier's rocket launcher.
 * - `volley`: `pellets` shells at once, spread evenly over `spread` radians, as a shotgun.
 * - `spin`: a gatling that first spins up for `spinUp` seconds and runs down in `spinDown` when
 *   let go, then fires as fast as its interval allows, each round up to about `spread` radians
 *   off. Spinning, and spinning up, slows the tank to `slowdown` of its speed.
 * - `lob`: a grenade thrown to where the gun is aimed.
 * - `charge`: holding the trigger charges the shot for up to `time` seconds and letting go fires
 *   it: from the class's `shell` with no charge to `full` at full charge (see `chargedShell`), a
 *   rail for the Sniper whose power grows with the charge. Charging slows the tank to `slowdown`
 *   of its speed.
 */
export type WeaponSpec =
  | { kind: 'single' }
  | { kind: 'volley'; pellets: number; spread: number }
  | { kind: 'spin'; spinUp: number; spinDown: number; spread: number; slowdown: number }
  | { kind: 'lob' }
  | { kind: 'charge'; time: number; full: ShellSpec; slowdown: number };

/**
 * What the trigger is doing this step: held, the gatling spun without firing, how far away a
 * grenade should land, and whether letting go drops a charge instead of firing it.
 */
export type Trigger = { fire: boolean; rev?: boolean; reach?: number; cancel?: boolean };

/**
 * The weapon of a tank of `tankClass`: its clip from `createGun` and the trigger of its
 * `WeaponSpec`. Call `step` every physics step with the trigger; it returns the shots to fire this
 * step, which the caller aims along the gun and hands to the battle's `fire`.
 *
 * @param random - Source of randomness in [0, 1) for the gatling's spread.
 */
export function createWeapon(tankClass: TankClass, random: () => number) {
  const spec = tankClass.weapon;
  const gun = createGun(tankClass.gun);
  let spin = 0;
  let charged: number | undefined;
  let shots = 0;

  return {
    /** The class whose weapon this is. */
    tankClass,

    /** Rounds left in the clip, and its size. */
    get rounds() {
      return gun.rounds;
    },

    clip: tankClass.gun.clip,

    /** How far the round being loaded is, 0-1. */
    get loading() {
      return gun.loading;
    },

    /** Whether a pull of the trigger would fire now, once a gatling has spun up. */
    get ready() {
      return gun.ready;
    },

    /** How far a gatling has spun up, 0-1; always 0 for other weapons. */
    get spin() {
      return spin;
    },

    /** Charge of a shot being charged, 0-1, or `undefined` while none is. */
    get charge() {
      return charged === undefined || spec.kind !== 'charge' ? undefined : Math.min(charged / spec.time, 1);
    },

    /** Shots fired so far, so a caller can tell when the weapon fired. */
    get shots() {
      return shots;
    },

    /** Share of its speed the tank keeps: less while a gatling spins or a shot charges. */
    get speedShare() {
      if (spec.kind === 'spin') {
        return 1 - (1 - spec.slowdown) * spin;
      }

      return spec.kind === 'charge' && charged !== undefined ? spec.slowdown : 1;
    },

    /**
     * Lets `dt` seconds pass with the trigger as given: the clip reloads, a gatling spins, a shot
     * charges. Returns the shots fired this step, with angles relative to the gun.
     */
    step(dt: number, trigger: Trigger): Shot[] {
      gun.step(dt);
      const fired = pull(dt, trigger);
      shots += fired.length;
      return fired;
    }
  };

  function pull(dt: number, trigger: Trigger): Shot[] {
    const shell = tankClass.shell;

    switch (spec.kind) {
      case 'single':
        return trigger.fire && gun.fire() ? [{ shell, reach: trigger.reach }] : [];

      case 'lob':
        return trigger.fire && gun.fire() ? [{ shell, reach: trigger.reach }] : [];

      case 'volley': {
        if (!trigger.fire || !gun.fire()) {
          return [];
        }

        const volley = Array.from({ length: spec.pellets }, (_, index) => {
          const even = spec.pellets > 1 ? (index / (spec.pellets - 1) - 0.5) * spec.spread : 0;
          return even + (random() - 0.5) * (spec.spread / spec.pellets) * 0.5;
        });

        return [{ shell, volley, flash: 0.8 }];
      }

      case 'spin': {
        const spinning = trigger.fire || (trigger.rev ?? false);
        spin = spinning ? Math.min(spin + dt / spec.spinUp, 1) : Math.max(spin - dt / spec.spinDown, 0);

        if (!trigger.fire || spin < 1 || !gun.fire()) {
          return [];
        }

        // The spread is a triangle of two uniforms: most rounds fly near the aim, a few wide.
        const angle = (random() + random() - 1) * spec.spread;
        return [{ shell, angle, flash: 0.35 }];
      }

      case 'charge': {
        if (trigger.fire) {
          if (charged !== undefined || gun.ready) {
            charged = Math.min((charged ?? 0) + dt, spec.time);
          }

          return [];
        }

        if (charged === undefined || trigger.cancel || !gun.fire()) {
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

/**
 * The shell a charged shot fires at `charge` 0-1: speed, range, hole, depth, knockback and size
 * grow from `empty` to `full`, and so do a rail's power and the width of its slit, a rail of
 * `full`'s power from `FULL_CHARGE` on. A rail's infinite speed stays infinite.
 */
export function chargedShell(empty: ShellSpec, full: ShellSpec, charge: number): ShellSpec {
  const mix = (from: number, to: number) => (from === to ? from : from + (to - from) * charge);
  const rail = empty.rail && full.rail && (charge >= FULL_CHARGE ? full.rail : { power: mix(empty.rail.power, full.rail.power), slit: mix(empty.rail.slit, full.rail.slit) });

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
