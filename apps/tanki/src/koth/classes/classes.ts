import { TURRET_GATLING, TURRET_LONG_GUN, TURRET_MORTAR, TURRET_TWIN } from '../../damage/renderer';
import { MEDIUM_TANK, type TankClass, type TankClassId } from '../tanks';

/**
 * The tank classes, after the classes of Team Fortress 2 recast in tanks, each the best pick for
 * one job and each with a class it beats: the Scout gets behind tanks and kills the slow casemate
 * gun up close; the Heavy holds the point and its gatling shreds the Scout's thin armor; the
 * Sniper's rail goes through the Heavy's plates from beyond its reach; the Soldier's rockets and
 * the Demoman's grenades break groups, cover and walls and catch a Sniper behind its crate. Every
 * gun fires at a steady cadence while its trigger is held, with no clip and no reload. Speeds are
 * shares of the medium tank's, so the classes keep their pace against each other when the medium
 * tank's speed changes.
 */
export const TANK_CLASSES: Record<TankClassId, TankClass> = {
  scout: createScout(),
  soldier: MEDIUM_TANK,
  heavy: createHeavy(),
  demoman: createDemoman(),
  sniper: createSniper()
};

/**
 * The light tank, the Scout: fast, small and thin-skinned, the flanker who kills from behind and
 * takes the point at double weight.
 *
 * - Speed 1.4 of the medium tank's, 350 px/s at 250, the Scout's 400 units per second against the
 *   Soldier's 240 toned down so a scout stays hittable on a screen this size. Bots driving it
 *   dodge six shells in ten they see coming, down from three in four once shells slowed to the
 *   pace's 0.8 of their speed and left more time to see one coming.
 * - A 32 x 20 hull with its core 3 px under the rear armor and 6 px under the sides: a rocket in
 *   the back kills it. It weighs 0.65 of a medium tank, so hits shove it around, and a rocket's
 *   blast throws it into the air.
 * - The scattergun: four pellets fanned over 0.16 rad, a volley every 0.85 s for as long as the
 *   trigger is held. Pellets fly 1400 px/s for 300 px and tear at point blank (see `biteAt`):
 *   four times as deep right at the muzzle, falling off to their own small bite at 200 px, and
 *   half that at 300 px. At the default pace (see `PACE_DEFAULTS`), from 80 px one volley into a
 *   medium tank's rear blows it up, three open its side and five its front; from 160 px it takes
 *   three into the rear, and beyond 200 px the pellets only chip, so the Scout has to get close,
 *   the way Team Fortress 2's scattergun kills with a point-blank meatshot.
 */
function createScout(): TankClass {
  return {
    id: 'scout',
    name: 'Scout',
    role: 'Fast flanker; a point-blank scattergun, deadliest from behind; captures 2x',
    speed: MEDIUM_TANK.speed * 1.4,
    turretSpeed: 12,
    mount: { kind: 'turret' },
    hull: { halfLength: 16, halfWidth: 10, corner: 1, core: { x: -9, y: 0, radius: 4 }, cell: 0.5, pattern: 'dart' },
    mass: 0.65,
    interval: 0.85,
    shell: { speed: 1400, range: 300, hole: 2.8, depth: 1.2, knockback: 90, fade: 0.5, size: 0.45, pointBlank: { range: 200, depth: 4, hole: 1.2 } },
    weapon: { kind: 'volley', pellets: 4, spread: 0.16 },
    capture: 2,
    look: { turret: TURRET_TWIN, muzzle: 23 }
  };
}

/**
 * The heavy tank, the Heavy: slow, big and plated, it holds the point and shreds what comes near.
 *
 * - Speed 0.76 of the medium tank's, 190 px/s at 250, down to 0.55 of that while its gatling
 *   fires, as the Heavy slows to a crawl with his minigun spinning.
 * - A 48 x 30 hull with its core 8 px under the rear armor, 10 px under the sides and 30 px
 *   behind the front, in coarser 0.6 px cells to fit a slot. Its plates give way to only 0.75 of
 *   a blow (see `HullSpec.plating`): at the default pace rockets into its side take ten hits
 *   instead of a medium tank's six or seven and grenades thirteen or so, though two rockets into
 *   its rear still kill it. It weighs 2.2 medium tanks: hits barely shove it, and it rams harder
 *   than any other class.
 * - The gatling's barrels take 0.35 s to spin up before the first round, as Team Fortress 2's
 *   minigun spins up, so a Heavy caught cold gives a Scout or Soldier at its side a moment to
 *   strike or get away; a Heavy expecting a fight revs ahead and fires at once. Then ten rounds a
 *   second for as long as it is held. Each round flies 1500 px/s for 520 px, up to 0.05 rad off,
 *   and chips a small hole that shrinks to 0.3 by the end of its range, but the stream drills
 *   (see `DrillSpec`): a round landing within 7 px of the stream's rounds of the last half second
 *   digs 0.8 px deeper for each, up to 6 px. A round shoves its target with only 25, against a
 *   rocket's 350, as a push of 60 spun a tank's hull round under the stream and turned the hole it
 *   drilled away from the gun. At the default pace, held on a medium tank's side it blows it up
 *   in under a second from 80 px and in about one and a half from 160 or 280 px, through the
 *   front in one and a half to three seconds; beyond 400 px its rounds scatter too wide to drill
 *   and fade, where a Soldier's rockets and a Sniper's rail still reach.
 */
function createHeavy(): TankClass {
  return {
    id: 'heavy',
    name: 'Heavy',
    role: 'Slow, plated; a gatling stream that drills armor up close; holds the point',
    speed: MEDIUM_TANK.speed * 0.76,
    turretSpeed: 6,
    mount: { kind: 'turret' },
    hull: { halfLength: 24, halfWidth: 15, corner: 2, core: { x: -11, y: 0, radius: 5 }, cell: 0.6, pattern: 'plated', plating: 0.75 },
    mass: 2.2,
    interval: 0.1,
    shell: { speed: 1500, range: 520, hole: 2, depth: 1, knockback: 25, fade: 0.7, size: 0.4, drill: { radius: 7, gain: 0.8, most: 6, memory: 0.5 } },
    weapon: { kind: 'spin', spread: 0.05, slowdown: 0.55, spinUp: 0.35 },
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
 * - The grenade launcher: a grenade every 0.8 s for as long as the trigger is held, as Team
 *   Fortress 2's four grenades 0.6 s apart and their reload come to over a fight. A grenade flies
 *   900 px/s over the ground to where it is aimed, a little slower than the rocket where Team
 *   Fortress 2's pipes are a little faster, up to 520 px, in an arc that clears a crate halfway
 *   beyond about 200 px. It bounces off walls keeping 0.7 of its speed, lands, bounces and rolls,
 *   and goes off 1.15 s after it was fired, or at once if it hits or brushes past an enemy tank
 *   before it first lands.
 * - Its blast reaches 95 px, half again as far as the rocket's, chips a 6.2 px crater 3.9 px deep
 *   at its center, enough to open the side of any hull but the Heavy's plates, and hits crates and
 *   breakable walls three times as hard as tanks. On the compact map, among more walls to bounce
 *   off, its grenades hurt most but finished few: the fuse was cut from 1.5 s, so fewer roll away
 *   from their target before they go off, and the crater grew from 5.5 x 3 px.
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
    interval: 0.8,
    shell: {
      speed: 900,
      range: 520,
      hole: 3,
      depth: 1,
      knockback: 250,
      ricochet: false,
      lob: { fuse: 1.15, gravity: 1500, bounce: 0.45, rebound: 0.7, roll: 4, minReach: 70 },
      blast: { radius: 95, hole: 6.2, depth: 3.9, knockback: 600, structures: 3 }
    },
    weapon: { kind: 'lob' },
    capture: 1,
    look: { turret: TURRET_MORTAR, muzzle: 22 }
  };
}

/**
 * The casemate gun, the Sniper: a small, low self-propelled anti-tank gun after the Hetzer,
 * without a turret, the pick that kills with one shot from afar. Its gun sits off to the right in
 * the sloped casemate and swings only 0.16 rad, about 9 degrees, either side of the hull's
 * heading, so to aim further the whole tank turns, in place at 2.4 rad/s.
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
 *   from the front of any class, the Heavy's plates included, through a medium tank side on into
 *   the next tank behind it, or through a wooden fence or a crate. A line that crosses the core
 *   blows the tank up from any side, as a headshot kills in Team Fortress 2, and a fully charged
 *   one also passing within 2.2 px of the core's rim, so the core a full charge must find is
 *   about 13 px across instead of 9; elsewhere the rail leaves a slit through the armor that
 *   weakens it about as much as a rocket's hit. The charge is the aiming, not a reload: the next
 *   one starts as soon as the trigger is held again, a second after the shot. While it charges,
 *   its laser sight is drawn for everyone to see and bots dodge off its beam; a player's scope
 *   marks the cores of the enemies in sight and the crosshair tells when the rail would blow one
 *   up (see `AimOverlay`).
 */
function createSniper(): TankClass {
  return {
    id: 'sniper',
    name: 'Sniper',
    role: 'Casemate gun: hold to charge; the scope shows cores; a rail through one kills',
    speed: MEDIUM_TANK.speed * 0.96,
    turretSpeed: 3,
    mount: { kind: 'casemate', arc: 0.16, traverse: 2.4 },
    hull: { halfLength: 17.5, halfWidth: 11, corner: 2, core: { x: -9.5, y: 0, radius: 4 }, cell: 0.5, pattern: 'deck' },
    mass: 0.8,
    interval: 1,
    shell: { speed: Infinity, range: 900, hole: 1.8, depth: 1, knockback: 120, rail: { power: 5, slit: 1 } },
    weapon: {
      kind: 'charge',
      time: 2.5,
      slowdown: 0.35,
      full: { speed: Infinity, range: 1300, hole: 2.6, depth: 2, knockback: 400, rail: { power: 40, slit: 1.5, graze: 2.2 } }
    },
    capture: 1,
    look: { turret: TURRET_LONG_GUN, muzzle: 28, casemate: true, mount: { x: 6, y: 2.5 } }
  };
}
