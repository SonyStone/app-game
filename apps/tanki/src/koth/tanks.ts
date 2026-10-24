import type { ShellSpec } from '../damage/combat';

/**
 * A kind of tank, after the classes of Team Fortress 2: how fast it drives and turns its turret,
 * and its gun. Every tank in king of the hill is a `MEDIUM_TANK` for now; a light tank like the
 * Scout or a heavy one like the Heavy would be another value of this type.
 */
export type TankClass = {
  /** Hull speed at full input on a straight run, in pixels per second. */
  speed: number;
  /** Fastest turn of the turret, in radians per second. */
  turretSpeed: number;
  gun: GunSpec;
  shell: ShellSpec;
};

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
 * - Its turret turns at 2.6 rad/s, half a turn in 1.2 s: a tank that circles another at 150 px
 *   can just be followed, and one that comes from behind gets a moment before the turret is round.
 * - Its gun is the rocket launcher: four rounds 0.8 s apart, each reloaded in 0.8 s.
 * - Its shell flies at 900 px/s, the rocket's 1100 units per second, slow enough to be seen and
 *   dodged at range, and falls after 700 px, about the width of the screen. A hit chips a crater
 *   that takes several hits from the side or behind to reach the core and many more from the front.
 */
export const MEDIUM_TANK: TankClass = {
  speed: 200,
  turretSpeed: 2.6,
  gun: { interval: 0.8, clip: 4, firstReload: 0.92, reload: 0.8 },
  shell: { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 }
};
