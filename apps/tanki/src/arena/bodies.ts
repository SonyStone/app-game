import type { Collider, Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { ARENA, type Placement } from './level';

/**
 * Pull speed of the player's tank in pixels per second. Godot's `tank.gd` sets
 * `pull.linear_velocity = direction * speed * delta` with `speed = 25000` and a 1/60 s step.
 */
export const PLAYER_PULL_SPEED = 25000 / 60;

/** Pull speed of other tanks, from the Godot default `speed = 15000`. */
export const DEFAULT_PULL_SPEED = 15000 / 60;

/**
 * A tank: a heavily damped hull dragged by a massive point, the "pull", through a pin joint
 * in front of the hull. Moving the pull tows the hull, which swings around to trail behind it,
 * so the tank turns into its direction of travel on its own instead of steering like a real tank.
 */
export type Tank = ReturnType<typeof createTank>;

/**
 * Creates a tank's hull, pull and joint in `world`. The hull has no collider yet: add one with
 * `addHullBox` or build it from the hull's shape.
 *
 * @param placement - Hull center and heading.
 * @param color - Hull and turret fill color.
 * @param pullSpeed - Pull speed in pixels per second at full input.
 */
export function createTank(
  rapier: Rapier,
  world: World,
  placement: Placement,
  color: number,
  pullSpeed = DEFAULT_PULL_SPEED
) {
  const hull = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(placement.x, placement.y)
      .setRotation(placement.rotation)
      .setLinearDamping(HULL_LINEAR_DAMPING)
      .setAngularDamping(HULL_ANGULAR_DAMPING)
  );
  const pullStart = toWorld(placement, PULL_ANCHOR);
  const pull = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic().setTranslation(pullStart.x, pullStart.y).setAdditionalMass(1).lockRotations()
  );
  world.createImpulseJoint(rapier.JointData.revolute(PULL_ANCHOR, { x: 0, y: 0 }), hull, pull, true);

  return {
    hull,
    pull,
    color,
    pullSpeed,
    /** Turret heading in world radians, independent of the hull. */
    turretAngle: placement.rotation,
    /** Seconds until the gun can fire again. */
    reload: 0
  };
}

/** Gives `tank` the solid box collider of Godot's hull, with Godot's mass of 1. */
export function addHullBox(rapier: Rapier, world: World, tank: Tank) {
  world.createCollider(rapier.ColliderDesc.cuboid(HULL_SIZE.x / 2, HULL_SIZE.y / 2).setMass(1), tank.hull);
}

/**
 * Sets the pull's velocity for the next physics step, as Godot did every physics frame.
 * Zero input stops the pull, and the hull's damping then brings the tank to rest.
 *
 * @param move - Direction with length up to 1, in world axes.
 */
export function driveTank(tank: Tank, move: { x: number; y: number }) {
  tank.pull.setLinvel({ x: move.x * tank.pullSpeed, y: move.y * tank.pullSpeed }, true);
}

/** Muzzle position in world coordinates: the tip of the barrel, 30 px from the hull center along the turret. */
export function muzzleOf(tank: Tank) {
  const center = tank.hull.translation();

  return {
    x: center.x + Math.cos(tank.turretAngle) * MUZZLE_OFFSET,
    y: center.y + Math.sin(tank.turretAngle) * MUZZLE_OFFSET
  };
}

/** Pushable crate with Godot's mass 10 and the tanks' damping, so a tank shoves it slowly. */
export function createCrate(rapier: Rapier, world: World, placement: Placement) {
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(placement.x, placement.y)
      .setRotation(placement.rotation)
      .setLinearDamping(HULL_LINEAR_DAMPING)
      .setAngularDamping(HULL_ANGULAR_DAMPING)
  );
  world.createCollider(rapier.ColliderDesc.cuboid(CRATE_SIZE.x / 2, CRATE_SIZE.y / 2).setMass(10), body);

  return body;
}

/** Creates the arena's static geometry: the floor outline as a closed wall and the pillar. */
export function createArenaWalls(rapier: Rapier, world: World) {
  const loop = [...ARENA.floor, ARENA.floor[0]];
  const vertices = new Float32Array(loop.flatMap((point) => [point.x, point.y]));
  const walls = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  world.createCollider(rapier.ColliderDesc.polyline(vertices), walls);

  const { pillar } = ARENA;
  world.createCollider(rapier.ColliderDesc.ball(pillar.radius).setTranslation(pillar.x, pillar.y), walls);
}

/** Returns whether a shot can hit `collider`; blast spheres, for example, should let shots through. */
export type ShotFilter = (collider: Collider) => boolean;

/**
 * Casts a hitscan shot from `tank`'s muzzle. Godot's ray started inside the firing hull
 * and ignored it; here the firing tank is excluded explicitly.
 *
 * @returns The muzzle and the end point: the first hit, or the end of the 1000 px range.
 */
export function castShot(rapier: Rapier, world: World, tank: Tank, canHit: ShotFilter) {
  const start = muzzleOf(tank);
  const direction = { x: Math.cos(tank.turretAngle), y: Math.sin(tank.turretAngle) };
  const hit = world.castRay(
    new rapier.Ray(start, direction),
    SHOT_RANGE,
    true,
    undefined,
    undefined,
    undefined,
    tank.hull,
    canHit
  );
  const distance = hit?.timeOfImpact ?? SHOT_RANGE;

  return {
    start,
    end: { x: start.x + direction.x * distance, y: start.y + direction.y * distance }
  };
}

/** Collider size of a hull, from Godot's `RectangleShape2D`. The drawing is a pixel smaller. */
export const HULL_SIZE = { x: 42, y: 26 };

/** Collider size of a crate. */
export const CRATE_SIZE = { x: 44, y: 94 };

/** Rapier's velocity damping on hulls and crates: `v *= 1 / (1 + dt * damping)` per step. */
const HULL_LINEAR_DAMPING = 50;
const HULL_ANGULAR_DAMPING = 25;

/** Pin joint position in hull coordinates, ahead of the center. */
const PULL_ANCHOR = { x: 15, y: 0 };

const MUZZLE_OFFSET = 30;
const SHOT_RANGE = 1000;

function toWorld(placement: Placement, local: { x: number; y: number }) {
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);

  return {
    x: placement.x + local.x * cos - local.y * sin,
    y: placement.y + local.x * sin + local.y * cos
  };
}
