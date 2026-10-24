import { TURRET_GATLING, TURRET_LONG_GUN, TURRET_MORTAR, TURRET_TWIN } from '../../damage/renderer';
import { MEDIUM_TANK, type TankClass, type TankClassId } from '../tanks';

/**
 * The tank classes, after the classes of Team Fortress 2 recast in tanks, in a circle where each
 * beats the next: the Scout gets behind the slow casemate gun and kills it up close; the Heavy's
 * gatling shreds the Scout's thin armor; the Soldier's and the Demoman's blasts break the slow,
 * big Heavy from beyond its reach or around cover; the Sniper's charged shot kills whatever is too
 * slow to leave its line. Speeds are shares of the medium tank's, so the classes keep their pace
 * against each other when the medium tank's speed changes.
 */
export const TANK_CLASSES: Record<TankClassId, TankClass> = {
  scout: createScout(),
  soldier: MEDIUM_TANK,
  heavy: createHeavy(),
  demoman: createDemoman(),
  sniper: createSniper()
};

/**
 * The light tank, the Scout: fast, small and thin-skinned, it flanks, hunts cores from behind and
 * takes the point at double weight.
 *
 * - Speed 1.4 of the medium tank's, 350 px/s at 250, the Scout's 400 units per second against the
 *   Soldier's 240 toned down so a scout stays hittable on a screen this size. Bots driving it
 *   dodge three shells in four they see coming.
 * - A 32 x 20 hull with its core 3 px under the rear armor and 6 px under the sides: one good
 *   volley in the back opens it. It weighs 0.65 of a medium tank, so hits shove it around, and a
 *   rocket's blast throws it into the air.
 * - The scattergun: four pellets fanned over 0.16 rad, six volleys 0.625 s apart, loaded one by
 *   one in 0.5 s as in Team Fortress 2. Pellets fly 1400 px/s for 300 px and bite half as deep at
 *   the end of it: at 100 px all four hit a hull within 16 px, at 300 px about two hit it at all.
 */
function createScout(): TankClass {
  return {
    id: 'scout',
    name: 'Scout',
    role: 'Fast flanker with a scattergun; captures twice as fast',
    speed: MEDIUM_TANK.speed * 1.4,
    turretSpeed: 12,
    mount: { kind: 'turret' },
    hull: { halfLength: 16, halfWidth: 10, corner: 1, core: { x: -9, y: 0, radius: 4 }, cell: 0.5, pattern: 'dart' },
    mass: 0.65,
    gun: { interval: 0.625, clip: 6, firstReload: 0.7, reload: 0.5 },
    shell: { speed: 1400, range: 300, hole: 2.8, depth: 1.2, knockback: 90, fade: 0.5, size: 0.45 },
    weapon: { kind: 'volley', pellets: 4, spread: 0.16 },
    capture: 2,
    look: { turret: TURRET_TWIN, muzzle: 23 }
  };
}

/**
 * The heavy tank, the Heavy: slow, big and thick-skinned, it holds the point.
 *
 * - Speed 0.76 of the medium tank's, 190 px/s at 250, down to 0.55 of that while its gatling
 *   spins, as the Heavy slows to a crawl with his minigun spun up.
 * - A 48 x 30 hull with its core 8 px under the rear armor, 10 px under the sides and 30 px
 *   behind the front, in coarser 0.6 px cells to fit a slot. It weighs 2.2 medium tanks: hits
 *   barely shove it, it shoves and rams others aside and dents less in crashes.
 * - The gatling spins up in 0.5 s, then fires ten rounds a second from a belt of 60, six seconds
 *   of fire, which refills in about 3.5 s of quiet. Each round flies 1500 px/s for 520 px, up to
 *   0.07 rad off, and chips a small hole that shrinks to a quarter by the end of its range: lots
 *   of fire that wears the armor down evenly, deadly up close and weak at range, where a Soldier's
 *   rockets and a Demoman's grenades reach and its rounds scatter.
 */
function createHeavy(): TankClass {
  return {
    id: 'heavy',
    name: 'Heavy',
    role: 'Slow and tough; a gatling that must spin up; holds the point',
    speed: MEDIUM_TANK.speed * 0.76,
    turretSpeed: 6,
    mount: { kind: 'turret' },
    hull: { halfLength: 24, halfWidth: 15, corner: 2, core: { x: -11, y: 0, radius: 5 }, cell: 0.6, pattern: 'plated' },
    mass: 2.2,
    gun: { interval: 0.1, clip: 60, firstReload: 0.6, reload: 0.05 },
    shell: { speed: 1500, range: 520, hole: 2, depth: 1, knockback: 60, fade: 0.75, size: 0.4 },
    weapon: { kind: 'spin', spinUp: 0.5, spinDown: 0.6, spread: 0.07, slowdown: 0.55 },
    capture: 1,
    look: { turret: TURRET_GATLING, muzzle: 33 }
  };
}

/**
 * The grenadier, the Demoman: lobs grenades over crates and around corners, the best breaker of
 * groups, cover and walls.
 *
 * - Speed 0.96 of the medium tank's, 240 px/s at 250; a 37 x 23 hull with its core 4 px under the
 *   rear armor and 7 px under the sides, weighing 0.9 of a medium tank.
 * - The grenade launcher: four grenades 0.6 s apart, reloaded in 0.6 s, the first in 1.24 s, as
 *   in Team Fortress 2. A grenade flies 900 px/s over the ground to where it is aimed, a little
 *   slower than the rocket where Team Fortress 2's pipes are a little faster, up to 520 px, in an
 *   arc that clears a crate halfway beyond about 200 px. It bounces off walls keeping 0.7 of its
 *   speed, lands, bounces and rolls, and goes off 1.15 s after it was fired, or at once if it hits
 *   or brushes past an enemy tank before it first lands.
 * - Its blast reaches 95 px, half again as far as the rocket's, chips a 6.2 px crater 3.9 px deep
 *   at its center, enough to open the side of any hull, and hits crates and breakable walls three
 *   times as hard as tanks. On the compact map, among more walls to bounce off, its grenades hurt
 *   most but finished few, killing half as often as it died: the fuse was cut from 1.5 s, so
 *   fewer roll away from their target before they go off, and the crater grew from 5.5 x 3 px.
 */
function createDemoman(): TankClass {
  return {
    id: 'demoman',
    name: 'Demoman',
    role: 'Lobs bouncing grenades over cover; big splash; breaks walls',
    speed: MEDIUM_TANK.speed * 0.96,
    turretSpeed: 9,
    mount: { kind: 'turret' },
    hull: { halfLength: 18.5, halfWidth: 11.5, corner: 1.5, core: { x: -10, y: 0, radius: 4.5 }, cell: 0.5, pattern: 'chevron' },
    mass: 0.9,
    gun: { interval: 0.6, clip: 4, firstReload: 1.24, reload: 0.6 },
    shell: {
      speed: 900,
      range: 520,
      hole: 3,
      depth: 1,
      knockback: 250,
      ricochet: false,
      lob: { fuse: 1.15, gravity: 1500, bounce: 0.45, rebound: 0.7, roll: 4, minReach: 70 },
      blast: { radius: 95, hole: 6.2, depth: 3.9, knockback: 600, structures: 3, self: 0.7 }
    },
    weapon: { kind: 'lob' },
    capture: 1,
    look: { turret: TURRET_MORTAR, muzzle: 22 }
  };
}

/**
 * The casemate gun, the Sniper: a small, low self-propelled anti-tank gun after the Hetzer,
 * without a turret. Its gun sits off to the right in the sloped casemate and swings only
 * 0.16 rad, about 9 degrees, either side of the hull's heading, so to aim further the whole tank
 * turns, in place at 2.4 rad/s.
 *
 * - Speed 0.96 of the medium tank's, 240 px/s at 250, down to 0.35 of that while it charges.
 * - A 35 x 22 hull, smaller than the medium tank's 40 x 25, with its core 4 px under the rear
 *   armor and 7 px under the sides, 23 px behind the front; the casemate covers all but the
 *   engine deck. It weighs 0.8 of a medium tank, as the Hetzer's 16 tonnes were light for its
 *   gun, so it rams and shrugs off hits less.
 * - Holding the trigger charges the shot for up to 2.5 s, letting go fires it: a rail, which hits
 *   at once along the gun (see `ShellSpec.rail`), 900 px long with no charge and 1300 px at full
 *   charge. Its power grows with the charge from 5 px of armor to 40: with none it reaches a core
 *   only through the thin rear armor; half charged, through the sides as well; fully charged,
 *   from the front of any class, through a medium tank side on into the next tank behind it, or
 *   through a wooden fence or a crate. A line that crosses the core blows the tank up from any
 *   side, as a headshot kills in Team Fortress 2; elsewhere it leaves a slit through the armor
 *   that weakens it about as much as a rocket's hit. The gun then takes 2 s to load again. While
 *   it charges, its laser sight is drawn for everyone to see, and bots dodge off its beam.
 */
function createSniper(): TankClass {
  return {
    id: 'sniper',
    name: 'Sniper',
    role: 'Casemate gun: turn the hull to aim, hold to charge a rail that hits at once',
    speed: MEDIUM_TANK.speed * 0.96,
    turretSpeed: 3,
    mount: { kind: 'casemate', arc: 0.16, traverse: 2.4 },
    hull: { halfLength: 17.5, halfWidth: 11, corner: 2, core: { x: -9.5, y: 0, radius: 4 }, cell: 0.5, pattern: 'deck' },
    mass: 0.8,
    gun: { interval: 0.5, clip: 1, firstReload: 1.5, reload: 1.5 },
    shell: { speed: Infinity, range: 900, hole: 1.8, depth: 1, knockback: 120, rail: { power: 5, slit: 1 } },
    weapon: {
      kind: 'charge',
      time: 2.5,
      slowdown: 0.35,
      full: { speed: Infinity, range: 1300, hole: 2.6, depth: 2, knockback: 400, rail: { power: 40, slit: 1.5 } }
    },
    capture: 1,
    look: { turret: TURRET_LONG_GUN, muzzle: 28, casemate: true, mount: { x: 6, y: 2.5 } }
  };
}
