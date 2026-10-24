import { ramBlow, ramDent, type WallMaterial } from '../damage/combat';
import { MAX_BITE, WALL_BLOW, WALL_MATERIALS } from '../damage/walls';
import { CRUMBLE_AT } from '../damage/wrecks';
import { chargedShell } from './classes/weapon';
import type { TankClass } from './tanks';

/** What blocks a way, as the battle's `breakableNear` tells it: a breakable wall, or a wreck with its armor area. */
export type Blocker = { material: WallMaterial; thickness: number } | { material: 'wreck'; area: number };

/**
 * How a tank of `tankClass` best opens a way it fits through in `blocker`, and what that takes:
 * the seconds, counting a ram's dent in the nose as time, and the shots or rams. `undefined` when
 * neither way opens it within `MAX_OPENING` s, as steel, concrete and thick brick for most guns.
 *
 * - Ramming (`ramsToOpen`): only walls, by the class's blow at full speed, its mass times its speed
 *   (see the battle's `ramBlow`). Each ram costs `RAM_TIME` s and the dent it leaves in the nose,
 *   as a share of the nose's armor in front of the core, at `ARMOR_WORTH` s for all of it.
 * - Shooting (`shotsToOpen`): at the gun's pace with its reloads, a gatling's spin-up and a charged
 *   shot's charging, as the bots' kill times count them.
 */
export function openingFor(blocker: Blocker, tankClass: TankClass): Opening | undefined {
  const rams = ramsToOpen(blocker, tankClass);
  const shots = shotsToOpen(blocker, tankClass);
  const ram = Number.isFinite(rams) ? rams * (RAM_TIME + dentShare(blocker, tankClass) * ARMOR_WORTH) : Infinity;
  const shoot = Number.isFinite(shots) ? secondsToFire(shots, tankClass) : Infinity;
  const seconds = Math.min(ram, shoot);

  if (seconds > MAX_OPENING) {
    return undefined;
  }

  return ram <= shoot ? { method: 'ram', seconds, rams, shots: 0 } : { method: 'shoot', seconds, rams: 0, shots };
}

/** How a way through a blocker opens, as `openingFor` weighs it. */
export type Opening = { method: 'ram' | 'shoot'; seconds: number; rams: number; shots: number };

/**
 * Rams from a run-up at full speed that break a way through a wall: its thickness, of which the
 * material's `RAM_THROUGH` share must give way before the rest falls with the tile, over the
 * depth each ram bites, the class's blow times the material's bite. `Infinity` for wrecks, which a
 * ram only shoves, for concrete and steel, and where a ram bites less than `MIN_RAM_BITE` px.
 *
 * Measured with every class against walls 240 px long from a run-up of 130 px: a fence takes one
 * ram of any class; brick 24-30 px thick one of a Heavy, two of a Soldier or a Sniper, three or
 * four of a Demoman or a Scout; brick 40 px thick two of a Heavy, three of a Soldier or a Sniper,
 * four of a Demoman; brick 60 px thick two of a Heavy, four of a Soldier, five of a Sniper and
 * eight of a Demoman, and a Scout never gets through 40 px.
 */
export function ramsToOpen(blocker: Blocker, tankClass: TankClass) {
  const through = RAM_THROUGH[blocker.material];

  if (blocker.material === 'wreck' || through === undefined) {
    return Infinity;
  }

  const depth = Math.min(ramBlow(tankClass.mass, tankClass.speed) * WALL_MATERIALS[blocker.material].ram.bite, MAX_BITE);
  return depth < MIN_RAM_BITE ? Infinity : Math.ceil((blocker.thickness * through) / depth);
}

/**
 * Shots of the class's gun that open a way through a blocker: the area to clear over the area each
 * shot chips (`shotBite`). Through a wall that is a channel `WALL_CHANNEL` px wide, a tank's
 * clearance on either side of its center, across the wall's thickness, times the material's
 * `SHOT_THROUGH`; a wreck falls apart once `1 - CRUMBLE_AT` of its armor is gone. A charged shot
 * that pierces bores clean through a thin wall, and `PIERCE_SHOTS` tunnels make a way.
 *
 * Measured with every class from 50 px before the wall, at lines across it in turn, as bots shoot:
 * brick 24 px thick takes about 17 rockets of a Soldier in 25 s, 16 volleys of a Scout, 7 grenades
 * of a Demoman in 8 s and 90 gatling rounds; brick 60 px thick 13 grenades; a fence six rockets or
 * two grenades; a medium tank's wreck, lengthwise, five rockets or three grenades.
 */
export function shotsToOpen(blocker: Blocker, tankClass: TankClass) {
  const weapon = tankClass.weapon;

  if (blocker.material === 'wreck') {
    return Math.ceil((blocker.area * (1 - CRUMBLE_AT)) / shotBite(tankClass, undefined));
  }

  const material = WALL_MATERIALS[blocker.material];

  if (material.thin && weapon.kind === 'charge' && weapon.full.pierce?.thin) {
    return PIERCE_SHOTS;
  }

  const through = SHOT_THROUGH[blocker.material];
  return through === undefined || !material.crater ? Infinity : Math.ceil((WALL_CHANNEL * blocker.thickness * through) / shotBite(tankClass, material.crater));
}

/**
 * Square pixels one shot of the class's gun chips out of a wall's material, or out of a wreck's
 * armor without `crater`: the craters of its shell or of every pellet of a volley, a little
 * smaller for the fade over `STAND_RANGE` px, and of its blast, grown by its `structures`, as the
 * battle cuts them. A crater of a hole of radius `h` reaching `d` deeper counts `πh² + 2hd`. A
 * charged shot counts at full charge; a grenade bounces back off the wall and goes off a little way
 * from it, so its blast counts at `LOB_FALLOFF`.
 *
 * @param crater - The material's crater for a blow of `WALL_BLOW`, which every blow scales.
 */
export function shotBite(tankClass: TankClass, crater: { hole: number; depth: number } | undefined) {
  const weapon = tankClass.weapon;
  const shell = weapon.kind === 'charge' ? chargedShell(tankClass.shell, weapon.full, 1) : tankClass.shell;
  const pellets = weapon.kind === 'volley' ? weapon.pellets : 1;
  const bite = 1 - (shell.fade ?? 0) * Math.min(STAND_RANGE / shell.range, 1);
  let area = pellets * craterArea(shell.hole * bite, shell.depth * bite, crater);

  if (shell.blast) {
    const structures = shell.blast.structures ?? 1;
    const falloff = weapon.kind === 'lob' ? LOB_FALLOFF : 1;
    area += craterArea(shell.blast.hole * falloff * Math.sqrt(structures), shell.blast.depth * falloff * structures, crater);
  }

  return area;
}

/** Area of a crater of a blow with `hole` and `depth`, in a material of `crater`, or in armor without one. */
function craterArea(hole: number, depth: number, crater: { hole: number; depth: number } | undefined) {
  const radius = crater ? (crater.hole * hole) / WALL_BLOW.hole : hole;
  const reach = crater ? (crater.depth * depth) / WALL_BLOW.depth : depth;
  return Math.PI * radius * radius + 2 * radius * reach;
}

/**
 * Seconds to fire `shots` from the class's gun: one interval apart, with a reload after every clip,
 * plus a gatling's spin-up or each charged shot's charging.
 */
function secondsToFire(shots: number, tankClass: TankClass) {
  const { interval, clip, firstReload, reload } = tankClass.gun;
  const weapon = tankClass.weapon;
  const reloads = Math.max(Math.ceil(shots / clip) - 1, 0);
  const extra = weapon.kind === 'spin' ? weapon.spinUp : weapon.kind === 'charge' ? shots * weapon.time : 0;
  return shots * interval + reloads * (firstReload + (clip - 1) * reload) + extra;
}

/** The dent one ram leaves in the class's nose, as a share of the armor between the nose and the core. */
function dentShare(blocker: Blocker, tankClass: TankClass) {
  const hull = tankClass.hull;
  const hardness = blocker.material === 'wreck' ? 1 : WALL_MATERIALS[blocker.material].ram.hardness;
  return ramDent(ramBlow(tankClass.mass, tankClass.speed), hardness) / (hull.halfLength - hull.core.x - hull.core.radius);
}

/** Longest opening worth planning, in seconds. */
const MAX_OPENING = 40;
/** Seconds a ram costs over driving on: stopping at the run-up, running into the wall, getting going again. */
const RAM_TIME = 1.2;
/** Seconds the whole armor in front of a tank's core is worth to it, against which a ram's dent is weighed. */
const ARMOR_WORTH = 20;
/**
 * Shallowest bite of a ram worth planning on: shallower ones, a Demoman's or a Scout's into brick,
 * take ever more runs at it than their depth tells, or never get through.
 */
const MIN_RAM_BITE = 8;
/** Shares of a wall's thickness rams must bite through before the rest falls with the tile, by material. */
const RAM_THROUGH: Partial<Record<Blocker['material'], number>> = { wood: 0.5, brick: 0.6 };
/** Width of the way to clear through a wall, a tank's clearance on either side of its center. */
const WALL_CHANNEL = 48;
/** Area to clear through a wall against the channel across its thickness, by material, measured with every class. */
const SHOT_THROUGH: Partial<Record<Blocker['material'], number>> = { wood: 1.55, brick: 1.3 };
/** Shots of a piercing charge that bore a way through a fence. */
const PIERCE_SHOTS = 2;
/** Distance to the wall a bot shoots it from, for the fade of shells, and the falloff of a grenade's blast off the wall. */
const STAND_RANGE = 50;
const LOB_FALLOFF = 0.75;
