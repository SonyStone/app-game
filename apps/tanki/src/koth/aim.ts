import type { Tank } from '../arena/bodies';
import { OVER_RUBBLE, PROXIMITY, RICOCHET_COS, TANK_TOP, type Combat, type ShellSpec } from '../damage/combat';
import { isRolling, launchLob, stepLob, type LobSpec } from '../damage/weapons/lob';
import type { TankClass } from './tanks';

type Point = { x: number; y: number };

/**
 * Where the next shot of `tank`, a tank of `tankClass`, goes if it is fired now along `angle`, as
 * the battle core flies it: every lane is cast with the battle's own `raycast`, the query its
 * shells fly by, so the forecast shows no way the shot does not take. The world is taken as it
 * stands; a tank crossing a lane may be gone by the time the shell gets there.
 *
 * - A single shell, as the Soldier's rocket, flies one lane from the muzzle to the first wall,
 *   wreck, crate or enemy tank, or to the end of its range.
 * - A volley, as the Scout's scattergun, flies a lane per pellet, at the volley's even spread.
 * - A gatling, as the Heavy's, scatters its rounds over its whole spread: the lanes fan out over
 *   it, the middle one first, each weighted by the share of rounds that fly near it.
 * - A grenade flies its arc, bounces off walls and bodies taller than it flies, lands, bounces and
 *   rolls until its fuse burns down, or goes off at once at an enemy tank it meets or brushes past
 *   before it first lands.
 * - A charged shot, the Sniper's, gets no forecast: its own laser sight shows its line.
 *
 * Shots pass through the shooter's teammates, as in the king of the hill without friendly fire,
 * and through the shooter's own tank until they first bounce.
 *
 * @param angle - World direction in radians the gun fires along.
 * @param reach - How far away the player aims, from the hull's center: a grenade first lands that
 *   far past the muzzle. Defaults to the grenade's longest throw.
 * @returns The lanes, a blast's reach, and the verdict for the crosshair; `undefined` for a charged shot.
 */
export function forecastShot(combat: ForecastCombat, tank: Tank, tankClass: TankClass, angle: number, reach?: number): ShotForecast | undefined {
  const weapon = tankClass.weapon;
  const shell = tankClass.shell;
  const muzzle = tankClass.look.muzzle;
  const passes = passerOf(combat, tank);
  let lanes: Lane[];

  switch (weapon.kind) {
    case 'charge':
      return undefined;

    case 'single':
      lanes = [shellLane(combat, combat.muzzleOf(tank, angle), angle, shell, passes, 1)];
      break;

    case 'volley': {
      const start = combat.muzzleOf(tank, angle);
      lanes = Array.from({ length: weapon.pellets }, (_, index) => {
        const offset = weapon.pellets > 1 ? (index / (weapon.pellets - 1) - 0.5) * weapon.spread : 0;
        return shellLane(combat, start, angle + offset, shell, passes, 1 / weapon.pellets);
      });
      break;
    }

    case 'spin':
      lanes = fanOffsets(weapon.spread).map(({ offset, weight }) => {
        return shellLane(combat, combat.muzzleOf(tank, angle + offset), angle + offset, shell, passes, weight);
      });
      break;

    case 'lob':
      lanes = [lobLane(combat, tank, angle, shell, shell.lob!, reach ?? shell.range, passes)];
      break;
  }

  const main = lanes[0];
  const blast = shell.blast && blastAt(combat, main, shell.blast.radius, passes);
  const reachable = shell.lob ? { min: shell.lob.minReach, max: shell.range } : { min: 0, max: muzzle + shell.range };
  const spread = weapon.kind === 'volley' ? weapon.spread / 2 : weapon.kind === 'spin' ? weapon.spread : 0;

  return { kind: weapon.kind, lanes, blast, reachable, spread, verdict: verdictOf(lanes, blast) };
}

/** What `forecastShot` needs of the battle. */
export type ForecastCombat = Pick<Combat, 'raycast' | 'muzzleOf' | 'teamOf' | 'tanks' | 'hullOf'>;

/** Where the next shot goes, as `forecastShot` foresees it. */
export type ShotForecast = {
  /** How the weapon fires, as its `WeaponSpec` says. */
  kind: 'single' | 'volley' | 'spin' | 'lob';
  /** Each way the shot's shells may take, the most likely first. */
  lanes: Lane[];
  /** The blast where the first lane ends, for a shell that goes off: its center, radius and the enemy tanks it reaches. */
  blast: { at: Point; radius: number; reaches: Tank[] } | undefined;
  /**
   * How far from the hull's center the player can aim and be answered: a shell falls at the
   * muzzle plus its range, a grenade is thrown at least `min` and at most `max` pixels.
   */
  reachable: { min: number; max: number };
  /** How far the lanes fan out to either side of the gun, in radians: 0 for a single shell or grenade. */
  spread: number;
  /** What the shot will do, the best of its lanes and blast, for the crosshair. */
  verdict: Verdict;
};

/**
 * What a shot will do, best first: open a core and kill (`kill`), chip an enemy tank (`hit`),
 * only glance off one (`glance`), reach one with its blast (`splash`), stop at a wall, wreck or
 * crate (`blocked`), or fly its whole range without meeting anything (`clear`).
 */
export type Verdict = 'kill' | 'hit' | 'glance' | 'splash' | 'blocked' | 'clear';

/**
 * One way a shell takes: points from the muzzle, each with its height above the ground, to where
 * it stops, and what it stops at.
 */
export type Lane = {
  path: { x: number; y: number; height: number }[];
  end: LaneEnd;
  /** Share of the shot's shells that take this lane: 1 for a single shell. */
  weight: number;
  /** For a grenade, where it first touches the ground. */
  landing?: Point;
};

/**
 * Where a lane ends and what it meets there: an enemy tank, a crate, a wreck or a wall, or
 * `nothing` where a shell falls at the end of its range or a grenade's fuse burns down.
 */
export type LaneEnd = {
  at: Point;
  /** Unit direction the shell flies in as it stops. */
  heading: Point;
  meets: 'tank' | 'crate' | 'wreck' | 'wall' | 'nothing';
  /** The enemy tank met; never the shooter's own, which a grenade bouncing back can meet. */
  tank?: Tank;
  /** The shell meets the tank's open core, which destroys it. */
  core: boolean;
  /** Shots chip what the lane meets: anything but steel, the border and campfire stones. */
  breakable: boolean;
  /** The shell meets the tank's armor at so steep an angle that it glances off with a scuff. */
  glancing: boolean;
};

/** Whether a shot from `tank` passes `other`, before and after its first bounce. */
type Passer = (other: Tank, bounced: boolean) => boolean;

/** The shooter's own tank until the shot first bounces, and its teammates always. */
function passerOf(combat: ForecastCombat, tank: Tank): Passer {
  const team = combat.teamOf(tank);
  return (other, bounced) => (other === tank && !bounced) || (other !== tank && team !== undefined && combat.teamOf(other) === team);
}

/**
 * A shell flying in a straight line from `start` along `angle`, as `flyShell` flies it: it passes
 * over rubble for `OVER_RUBBLE` px past the muzzle and stops at the first thing it meets, or falls
 * at the end of its range.
 */
function shellLane(combat: ForecastCombat, start: Point, angle: number, shell: ShellSpec, passes: Passer, weight: number): Lane {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const hit = combat.raycast(start, direction, shell.range, (other) => passes(other, false), { overRubble: OVER_RUBBLE });
  const at = { x: start.x + direction.x * hit.distance, y: start.y + direction.y * hit.distance };
  const facing = hit.normal ? -(direction.x * hit.normal.x + direction.y * hit.normal.y) : 1;
  const glancing = hit.kind === 'tank' && !hit.core && shell.ricochet !== false && facing <= RICOCHET_COS;
  const end: LaneEnd = { at, heading: direction, meets: hit.kind ?? 'nothing', tank: hit.tank, core: hit.core, breakable: hit.breakable, glancing };

  return { path: [{ ...start, height: 0 }, { ...at, height: 0 }], end, weight };
}

/**
 * The offsets of the lanes over a gatling's spread and the share of rounds near each: a round
 * flies `(random() + random() - 1) * spread` off the gun, so the shares follow a triangle that
 * peaks in the middle. The middle lane comes first.
 */
function fanOffsets(spread: number) {
  const bins = Array.from({ length: FAN_LANES }, (_, index) => {
    const from = -1 + (2 * index) / FAN_LANES;
    const to = from + 2 / FAN_LANES;
    return { offset: ((from + to) / 2) * spread, weight: triangleShare(to) - triangleShare(from) };
  });
  const middle = (FAN_LANES - 1) / 2;
  return [bins[middle], ...bins.filter((_, index) => index !== middle)];
}

/** Lanes a gatling's spread is cast with; odd, so one runs straight down the gun. */
const FAN_LANES = 9;

/** Share of a triangle distribution over [-1, 1] that falls below `x`. */
function triangleShare(x: number) {
  return x < 0 ? (1 + x) ** 2 / 2 : 1 - (1 - x) ** 2 / 2;
}

/**
 * A grenade's flight step by step, as `flyLob` flies it, from the muzzle along `angle`, thrown
 * `reach` pixels: its height from `stepLob`, its ground speed cut at every bounce and while it
 * rolls, bouncing off what `raycast` meets at its height, until it meets or brushes past an enemy
 * tank before it first lands, or its fuse burns down.
 */
function lobLane(combat: ForecastCombat, tank: Tank, angle: number, shell: ShellSpec, lob: LobSpec, reach: number, passes: Passer): Lane {
  const state = launchLob(lob, shell.speed, reach, shell.range);
  const path = [{ ...combat.muzzleOf(tank, angle), height: 0 }];
  let position: Point = path[0];
  let direction = { x: Math.cos(angle), y: Math.sin(angle) };
  let speed = shell.speed;
  let bounced = false;
  let landing: Point | undefined;
  // A grenade bouncing back into its thrower goes off there, which is no hit on an enemy.
  const end = (at: Point, meets: LaneEnd['meets'], target?: Tank, core = false): Lane => ({
    path: [...path, { ...at, height: state.height }],
    end: { at, heading: direction, meets, tank: target === tank ? undefined : target, core: core && target !== tank, breakable: false, glancing: false },
    weight: 1,
    landing
  });

  for (let steps = 0; steps < MAX_LOB_STEPS; steps++) {
    if (stepLob(lob, state, STEP)) {
      speed *= lob.bounce;
      landing ??= position;
    }

    if (isRolling(state)) {
      speed *= Math.exp(-lob.roll * STEP);
    }

    let step = speed * STEP;

    for (let strikes = 0; strikes < 3 && step > 1e-6; strikes++) {
      const hit = combat.raycast(position, direction, step, (other) => passes(other, bounced), { height: state.height });
      const at = { x: position.x + direction.x * hit.distance, y: position.y + direction.y * hit.distance };
      position = at;

      if (hit.distance >= step) {
        break;
      }

      step -= hit.distance;

      if (hit.tank && !state.landed) {
        return end(at, 'tank', hit.tank, hit.core);
      }

      const normal = hit.normal ?? { x: -direction.x, y: -direction.y };
      const along = direction.x * normal.x + direction.y * normal.y;
      direction = normalize({ x: direction.x - 2 * along * normal.x, y: direction.y - 2 * along * normal.y });
      speed *= lob.rebound;
      bounced = true;
      path.push({ ...at, height: state.height });
      position = { x: at.x + normal.x * 0.5, y: at.y + normal.y * 0.5 };
    }

    const brushed = !state.landed && state.height < TANK_TOP ? combat.tanks.find((other) => !passes(other, bounced) && hullDistance(combat, other, position) < PROXIMITY) : undefined;

    if (brushed) {
      return end(position, 'tank', brushed);
    }

    if (state.age >= lob.fuse) {
      return end(position, 'nothing');
    }

    path.push({ ...position, height: state.height });
  }

  return end(position, 'nothing');
}

/** The battle's physics step, which a grenade's flight is foreseen in. */
const STEP = 1 / 60;
/** A grenade whose fuse never burns down is followed for this many steps at most. */
const MAX_LOB_STEPS = 600;

/** Distance from `point` to the outside of `tank`'s hull box, by its shape, as the battle tells a grenade brushing past. */
function hullDistance(combat: ForecastCombat, tank: Tank, point: Point) {
  const hull = combat.hullOf(tank);

  if (!hull) {
    return Infinity;
  }

  const center = tank.hull.translation();
  const angle = tank.hull.rotation();
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const qx = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) - hull.halfLength;
  const qy = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) - hull.halfWidth;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/**
 * The blast of a shell that goes off where `lane` ends, a little back from the surface as the
 * battle sets it off, and the enemy tanks it reaches: those whose armor a ray from the blast
 * toward their center meets within `radius`, before any wall, wreck or crate.
 */
function blastAt(combat: ForecastCombat, lane: Lane, radius: number, passes: Passer) {
  const { at: end, heading } = lane.end;
  const at = { x: end.x - heading.x * BLAST_BACKOFF, y: end.y - heading.y * BLAST_BACKOFF };
  const reaches = combat.tanks.filter((other) => {
    if (passes(other, true) || passes(other, false)) {
      return false;
    }

    const center = other.hull.translation();
    const distance = Math.hypot(center.x - at.x, center.y - at.y);
    const direction = distance > 1e-6 ? { x: (center.x - at.x) / distance, y: (center.y - at.y) / distance } : { x: 1, y: 0 };
    return combat.raycast(at, direction, radius, (tank) => tank !== other).tank === other;
  });

  return { at, radius, reaches };
}

/** Pixels back from where a shell stops along its flight that its blast goes off, as `detonate` sets it. */
const BLAST_BACKOFF = 1.5;

/** The best a shot's lanes and blast will do, as `Verdict` orders it. */
function verdictOf(lanes: readonly Lane[], blast: ShotForecast['blast']): Verdict {
  const enemy = lanes.filter((lane) => lane.end.tank !== undefined);

  if (enemy.some((lane) => lane.end.core)) {
    return 'kill';
  }

  if (enemy.some((lane) => !lane.end.glancing)) {
    return 'hit';
  }

  if (enemy.length > 0) {
    return 'glance';
  }

  if (blast && blast.reaches.length > 0) {
    return 'splash';
  }

  return lanes[0].end.meets === 'nothing' ? 'clear' : 'blocked';
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}
