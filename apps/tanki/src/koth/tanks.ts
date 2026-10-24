import type { ShellSpec, TankLook } from '../damage/combat';
import { TURRET_MEDIUM } from '../damage/renderer';
import { MEDIUM_HULL, type HullSpec } from '../damage/shapes';
import type { WeaponSpec } from './classes/weapon';

/**
 * A kind of tank, after the classes of Team Fortress 2: how fast it drives and turns its turret,
 * its hull and armor, its gun and how the gun's trigger works, how much it counts for on the point
 * and how it looks. The five classes are in `./classes/classes`; the medium tank, the Soldier of
 * tanks, is `MEDIUM_TANK` here, and the others' speeds are shares of its speed.
 */
export type TankClass = {
  id: TankClassId;
  /** Name shown to the player. */
  name: string;
  /** What the class is for, in a few words, for the class menu. */
  role: string;
  /** Hull speed at full input on a straight run, in pixels per second. */
  speed: number;
  /**
   * Fastest turn of a bot's turret, in radians per second. The player's turret follows the aim at
   * once, as in a shooter, so this only keeps bots from snapping round faster than a hand would.
   */
  turretSpeed: number;
  /**
   * How the gun is mounted: in a turret that turns all the way round, or in a casemate fixed in
   * the hull, where it swings only `arc` radians either side of the hull's heading and the hull
   * turns in place at `traverse` radians per second to aim further.
   */
  mount: { kind: 'turret' } | { kind: 'casemate'; arc: number; traverse: number };
  hull: HullSpec;
  /** Mass of the hull, 1 for the medium tank: heavier tanks shrug off hits and shove harder. */
  mass: number;
  gun: GunSpec;
  /** The shell the gun fires; a charged weapon fires it with no charge. */
  shell: ShellSpec;
  /** How the trigger works: single shots, volleys, a spinning gatling, lobbed grenades or charged shots. */
  weapon: WeaponSpec;
  /** How many tanks the class counts as on the control point, as the Scout counts double in Team Fortress 2. */
  capture: number;
  look: TankLook;
};

/** The five classes, in the order of the class menu and its keys 1-5. */
export const TANK_CLASS_IDS = ['scout', 'soldier', 'heavy', 'demoman', 'sniper'] as const;

/** One of `TANK_CLASS_IDS`. */
export type TankClassId = (typeof TANK_CLASS_IDS)[number];

/**
 * How a gun fires and reloads, after the Soldier's rocket launcher: shots at least `interval`
 * apart from a clip of `clip` rounds. Once the gun has been quiet for `interval`, it loads one
 * round every `reload` seconds, the first a little slower; firing breaks off the round being
 * loaded.
 */
export type GunSpec = {
  interval: number;
  clip: number;
  /** Seconds to load the first round after firing stops, and each following one. */
  firstReload: number;
  reload: number;
};

/**
 * The medium tank, the Soldier of tanks. A hull of 40 px stands for about 48 Hammer units, the
 * width of a player in Team Fortress 2, so a pixel is about 1.2 units:
 *
 * - It drives at 200 px/s, about the Soldier's 240 units per second; crossing the map takes as
 *   long as walking a king of the hill map.
 * - A bot's turret turns at 10 rad/s, half a turn in 0.3 s, about a quick flick of the mouse;
 *   reaction time and aim error, not the turret, are what make bots beatable.
 * - Its gun is the rocket launcher: four rounds 0.8 s apart, each reloaded in 0.8 s.
 * - Its shell flies at 900 px/s, the rocket's 1100 units per second, slow enough to be seen and
 *   dodged at range, and falls after 700 px, about the width of the screen. A hit chips a crater
 *   that takes several hits from the side or behind to reach the core and many more from the front.
 */
export const MEDIUM_TANK: TankClass = {
  id: 'soldier',
  name: 'Soldier',
  role: 'Rockets with splash and shrapnel; rocket-jump by firing at your feet',
  speed: 200,
  turretSpeed: 10,
  mount: { kind: 'turret' },
  hull: MEDIUM_HULL,
  mass: 1,
  gun: { interval: 0.8, clip: 4, firstReload: 0.92, reload: 0.8 },
  shell: rocket(),
  weapon: { kind: 'single' },
  capture: 1,
  look: { turret: TURRET_MEDIUM, muzzle: 30 }
};

/**
 * The medium tank's rocket. The rocket itself chips less than the old shell did, since the blast
 * at the spot it hits chips a second crater there:
 *
 * - The blast reaches 65 px, about one and a half hulls, a little over half the Soldier's splash
 *   of 146 units, so that it hits tanks pressed together and a tank hiding just behind cover
 *   without making near misses as good as hits.
 * - Six fragments fly 75 px from the blast and only scratch the armor; the ones that fly back
 *   into the tank hit add a few chips around the crater.
 * - Its own tank takes twice the push of a blast at its feet, without damage: enough to throw it
 *   about four hull lengths through the air, the top-down rocket jump.
 */
function rocket(): ShellSpec {
  return {
    speed: 900,
    range: 700,
    hole: 3.5,
    depth: 2,
    knockback: 350,
    ricochet: false,
    blast: { radius: 65, hole: 4, depth: 1.5, knockback: 450, self: 2.8 },
    fragments: { count: 6, shell: { speed: 650, range: 75, hole: 1.3, depth: 0, knockback: 40, size: 0.35 } }
  };
}
