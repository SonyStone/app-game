import { PLAYER_PULL_SPEED, type Tank } from '../arena/bodies';
import { PLAYER_COLOR, PROP_COLOR } from '../arena/draw';
import type { Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createCombat, type CombatLayout, type Placement, type TankLook } from './combat';
import type { createRangeRenderer } from './renderer';
import type { HullSpec } from './shapes';

type Point = { x: number; y: number };

/**
 * The damage range: the player's tank among idle target tanks and crates whose armor is a
 * distance field, on the battle core of `createCombat`. Shots chip holes, dent the armor and
 * knock bodies back; shots that meet armor at a glancing angle ricochet. Crashes dent both
 * bodies, armor cut loose falls off as debris, and a shot that reaches a tank's core, hidden
 * until a hole opens onto it, blows the tank apart. Destroyed targets come back after a few
 * seconds.
 *
 * The range owns its Rapier bodies and renderer field slots; `reset` rebuilds everything.
 *
 * @param options.lineup - Tanks of these kinds stand in a row in front of the player instead of
 *   the scattered targets, to compare them side by side.
 */
export function createDamageRange(
  rapier: Rapier,
  world: World,
  renderer: ReturnType<typeof createRangeRenderer>,
  options: { lineup?: readonly { hull: HullSpec; mass: number; look: TankLook }[] } = {}
) {
  const combat = createCombat(rapier, world, renderer, RANGE);
  let player = spawnPlayer();

  spawnTargets();

  return {
    /** The player's tank, replaced on reset. */
    get player() {
      return player;
    },

    /** Camera shake in world pixels, from shots and explosions; decays by itself. */
    get shake() {
      return combat.shake;
    },

    /** The armor field of `tank`, live; `undefined` once the tank is destroyed. */
    armorOf(tank: Tank) {
      return combat.armorOf(tank);
    },

    /** Every tank in play, the player's included. */
    get tanks() {
      return combat.tanks;
    },

    /**
     * Advances physics by one fixed step: drives the player, steps Rapier, dents bodies that
     * crashed into something and refreshes changed shapes.
     *
     * @param drive - Player's drive direction in world axes, length up to 1.
     */
    step(dt: number, drive: Point) {
      combat.drive(player, drive);
      combat.step(dt);
    },

    /**
     * Fires `tank`'s gun: a hitscan shot with recoil. It chips the first armor it meets, knocking
     * the body back, or detonates a core; at a glancing angle it ricochets and flies on.
     */
    fire(tank: Tank) {
      combat.fire(tank);
    },

    /** Moves debris, emits exhaust, feeds fires and fades hit flashes over a frame of `dt` seconds. */
    update(dt: number) {
      combat.update(dt);
    },

    /**
     * Queues every body, turret, debris piece, smoke and light for drawing, bottom to top.
     *
     * @param view - Point on the ground under the camera.
     */
    draw(view: Point) {
      combat.draw(view);
    },

    /** Removes every body and debris piece and builds the range again. */
    reset() {
      combat.reset();
      player = spawnPlayer();
      spawnTargets();
    }
  };

  /** The scattered targets, or the lineup in a row, each turned a little so its turret shows. */
  function spawnTargets() {
    if (!options.lineup) {
      RANGE.targets.forEach((placement) => spawnTarget(placement));
      return;
    }

    options.lineup.forEach((kind, index) => {
      const y = (index - (options.lineup!.length - 1) / 2) * LINEUP_SPACING;
      spawnTarget({ x: LINEUP_X, y, rotation: 0, turret: 0.12 }, kind);
    });
  }

  function spawnPlayer() {
    return combat.spawnTank(RANGE.player, { color: PLAYER_COLOR, pullSpeed: PLAYER_PULL_SPEED });
  }

  function spawnTarget(placement: Placement, kind?: { hull: HullSpec; mass: number; look: TankLook }) {
    combat.spawnTank(placement, { color: PROP_COLOR, respawn: true, ...kind });
  }
}

/** Where the lineup stands, ahead of the player, and how far apart its tanks are. */
const LINEUP_X = -60;
const LINEUP_SPACING = 60;

/** Layout of the range, in pixels around the origin. */
const RANGE = {
  halfWidth: 480,
  halfHeight: 320,
  player: { x: -300, y: 0, rotation: 0 },
  targets: [
    { x: 60, y: -150, rotation: 0.3, turret: 2.6 },
    { x: 180, y: 40, rotation: Math.PI, turret: Math.PI - 0.4 },
    { x: 20, y: 190, rotation: -Math.PI / 2, turret: -2 },
    { x: 330, y: -80, rotation: Math.PI / 2, turret: 2.2 },
    { x: -120, y: -40, rotation: 0.8, turret: -0.6 }
  ] satisfies Placement[],
  crates: [
    { x: -60, y: -220, rotation: 0.4 },
    { x: -150, y: 170, rotation: 0 },
    { x: 300, y: 200, rotation: 1.2 }
  ],
  /** A campfire between the player's start and the nearest target, to try lights and shadows on. */
  campfires: [{ x: -210, y: -140 }]
} satisfies CombatLayout & { player: Placement; targets: Placement[] };
