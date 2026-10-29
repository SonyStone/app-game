import type { Tank } from '../arena/bodies';
import type { Combat, ShellSpec } from '../damage/combat';
import { TURRET_GATLING } from '../damage/renderer';
import { angleBetween } from './classes/casemate';
import type { KothMap } from './map';
import type { TeamId } from './rules';

type Point = { x: number; y: number };

/**
 * The turrets that guard the teams' spawn rooms, on maps whose bases have them, as the towers of Dota guard its bases: a raid
 * into the enemy's room, as Scouts hunting a Sniper make, stays possible but costs dearly. Each
 * is a gatling on its base's wall (see `KothBase.turret`) that nothing destroys. It fires at
 * the nearest enemy tank inside its base's room or its doorways, the zone widened by `DOORWAY`
 * px, that it sees within `REACH` px: it turns at `TURN_SPEED` rad/s, leads its target by the
 * shell's flight and fires `TURRET_SHELL` every `INTERVAL` s while on target, shells that spare
 * its own team. With nothing to fire at, it watches the room's door to the hall. Its shells
 * credit no tank with a kill.
 *
 * @param random - Source of randomness in [0, 1) for the spread of its shells.
 */
export function createBaseTurrets(combat: Combat, map: KothMap, colors: Record<TeamId, number>, random: () => number) {
  const turrets = (['red', 'blue'] as const).flatMap((team) => {
    const { zone, turret: at } = map.bases[team];

    if (!at) {
      return [];
    }

    const inward = -Math.sign(zone.x);
    const door = { x: zone.x + inward * zone.halfWidth, y: zone.y };
    const rest = Math.atan2(door.y - at.y, door.x - at.x);
    const gun = combat.mountGun({ ...at, angle: rest, team, color: colors[team], look: TURRET_LOOK });
    return [{ team, at, zone, rest, gun, cooldown: 0 }];
  });

  return {
    /** Where the turrets stand, by team. */
    turrets: turrets.map(({ team, at }) => ({ team, at })),

    /** The team whose turret guards `point`, its room or doorways, as a tank destroyed there was likely destroyed by it. */
    guarding(point: Point): TeamId | undefined {
      return turrets.find((turret) => inGuarded(turret.zone, point))?.team;
    },

    /**
     * Turns and fires each turret for a step of `dt` seconds at the enemies among `tanks`, each
     * with the team it fights for.
     */
    step(dt: number, tanks: readonly { tank: Tank; team: TeamId }[]) {
      for (const turret of turrets) {
        turret.cooldown = Math.max(turret.cooldown - dt, 0);
        const target = tanks
          .filter(({ tank, team }) => team !== turret.team && guards(turret, tank.hull.translation()))
          .map(({ tank }) => tank)
          .sort((a, b) => distance(turret.at, a.hull.translation()) - distance(turret.at, b.hull.translation()))[0];
        const goal = target ? lead(turret.at, target) : turret.rest;
        const off = angleBetween(turret.gun.angle, goal);
        turret.gun.angle += Math.min(Math.max(off, -TURN_SPEED * dt), TURN_SPEED * dt);

        if (target && Math.abs(off) < AIM_TOLERANCE && turret.cooldown === 0) {
          const aimed = turret.gun.angle;
          turret.gun.angle = aimed + (random() - 0.5) * SPREAD;
          turret.gun.fire(TURRET_SHELL, FLASH);
          turret.gun.angle = aimed;
          turret.cooldown = INTERVAL;
        }
      }
    }
  };

  /** Whether `turret` fires at an enemy at `point`: in its room or doorways, within reach and in sight past the wall it stands on. */
  function guards(turret: (typeof turrets)[number], point: Point) {
    const { zone, at } = turret;
    const range = distance(at, point);

    if (!inGuarded(zone, point) || range > REACH) {
      return false;
    }

    const clear = { x: at.x + ((point.x - at.x) / range) * WALL_CLEAR, y: at.y + ((point.y - at.y) / range) * WALL_CLEAR };
    return combat.lineOfSight(clear, point);
  }

  /** The heading from `at` that meets `target`'s core, led by the shell's flight to it. */
  function lead(at: Point, target: Tank) {
    const core = combat.coreOf(target) ?? target.hull.translation();
    const velocity = target.hull.linvel();
    const time = distance(at, core) / TURRET_SHELL.speed;
    return Math.atan2(core.y + velocity.y * time - at.y, core.x + velocity.x * time - at.x);
  }
}

/** The turrets of both bases, as `createBaseTurrets` returns them. */
export type BaseTurrets = ReturnType<typeof createBaseTurrets>;

const TURRET_LOOK = { turret: TURRET_GATLING, muzzle: 33 };
/** A heavy gatling round: it bites deeper than the Heavy's, so a tank caught in the room is lost within seconds. */
const TURRET_SHELL: ShellSpec = { speed: 1800, range: 360, hole: 3.5, depth: 5, knockback: 40, size: 0.5 };
/** Seconds between shots, and the spread of the shells about the gun's heading, in radians. */
const INTERVAL = 0.08;
const SPREAD = 0.06;
/** Size of each shot's muzzle blast against a tank gun's. */
const FLASH = 0.4;
/** Radians per second the gun turns at, and how far off its target it may be to fire. */
const TURN_SPEED = 8;
const AIM_TOLERANCE = 0.1;
/** How far the turret fires, and how far past its base's zone it guards the doorways, in pixels. */
const REACH = 340;
const DOORWAY = 30;
/** How far from the turret's middle a line of sight starts, clear of the wall it stands on. */
const WALL_CLEAR = 30;

/** Whether `point` lies in a base's `zone` or its doorways, `DOORWAY` px round it. */
function inGuarded(zone: { x: number; y: number; halfWidth: number; halfHeight: number }, point: Point) {
  return Math.abs(point.x - zone.x) <= zone.halfWidth + DOORWAY && Math.abs(point.y - zone.y) <= zone.halfHeight + DOORWAY;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
