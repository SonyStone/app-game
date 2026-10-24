import type { Tank } from '../arena/bodies';
import type { Rapier, RigidBody } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { GROUPS } from './arena';
import { createLegs, type LegSpec, type Surface } from './legs';
import type { Gait } from './variants';
import { angleBetween } from './visibility';

type Point = { x: number; y: number };

/**
 * The spider: a light round body that runs where it is told, faces where it is told and walks
 * on four legs (see `createLegs`). It bumps into walls, crates and tanks but not into the low
 * obstacles of its build, which it climbs: its feet stand on top of them and its body rises
 * with its feet. It can hold on to a tank's stern, riding along with its feet on the hull, and
 * jump off again.
 *
 * @param heightAt - Height of the obstacle top under a point, 0 on the floor.
 */
export function createSpider(rapier: Rapier, world: World, gait: Gait, start: Point & { rotation: number }, heightAt: (point: Point) => number) {
  const build = BUILDS[gait];
  const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(start.x, start.y).lockRotations().setLinearDamping(0));
  const collider = world.createCollider(
    rapier.ColliderDesc.ball(build.radius).setMass(SPIDER_MASS).setCollisionGroups(gait === 'low' ? GROUPS.lowSpider : GROUPS.tallSpider),
    body
  );
  let facing = start.rotation;
  let height = build.height;
  let climb = 0;
  let hop: { velocity: number; z: number } | undefined;
  let hold: { tank: Tank; seat: Point; angle: number; velocity: Point } | undefined;
  const surface: Surface = (point) => {
    if (hold) {
      return onHull(hold.tank, point);
    }

    return { point, height: heightAt(point) };
  };
  const legs = createLegs(build.legs, legBody(), surface);

  return {
    gait,

    /** The spider's build: its size, speed and legs. */
    build,

    /** The Rapier body; its rotation stays fixed, the heading is `facing`. */
    body,

    /** Where the spider is on the floor. */
    get position() {
      return body.translation();
    },

    /** Heading in world radians. */
    get facing() {
      return facing;
    },

    /** Height of the body's top above the floor, in pixels. */
    get height() {
      return height + (hop?.z ?? 0);
    },

    /** The tank the spider holds on to, if any. */
    get holding() {
      return hold?.tank;
    },

    /** Whether the spider is in the air after jumping off a tank. */
    get airborne() {
      return hop !== undefined;
    },

    /** The feet and joints of every leg, for drawing. */
    pose() {
      return legs.pose(legBody(), build.hipDrop);
    },

    /** The feet, where each is now and whether it stands or swings. */
    get feet() {
      return legs.feet;
    },

    /**
     * Sets the spider's run for the next physics step: it speeds up toward `move` times its
     * speed and turns toward `face`, both quickly but not at once. Holding on to a tank, it rides
     * on its seat instead and faces the tank's front.
     *
     * @param move - Direction in world axes, length up to 1.
     * @param face - Heading to turn to in world radians; `undefined` keeps the heading.
     */
    steer(dt: number, move: Point, face: number | undefined) {
      if (hold) {
        const seat = seatOf(hold.tank, hold.seat);
        hold.angle = hold.tank.hull.rotation();
        hold.velocity = hold.tank.hull.linvel();
        body.setTranslation(seat, true);
        body.setLinvel(hold.velocity, true);
        facing = turnToward(facing, hold.angle, TURN_SPEED * dt);
        return;
      }

      const velocity = body.linvel();
      const blend = 1 - Math.exp(-ACCELERATION * dt);
      const scale = hop ? HOP_CONTROL : 1;
      body.setLinvel(
        {
          x: velocity.x + (move.x * build.speed - velocity.x) * blend * scale,
          y: velocity.y + (move.y * build.speed - velocity.y) * blend * scale
        },
        true
      );

      if (face !== undefined) {
        facing = turnToward(facing, face, TURN_SPEED * dt);
      }
    },

    /** Moves the legs and the body's height over a frame of `dt` seconds, after physics. */
    update(dt: number) {
      const floor = hold ? HULL_TOP : Math.max(legs.groundHeight, heightAt(body.translation()) * CENTER_WEIGHT);
      const target = build.height + floor;
      climb += (target - height) * CLIMB_STIFFNESS * dt;
      climb *= Math.exp(-CLIMB_DAMPING * dt);
      height += climb * dt;

      if (hop) {
        hop.velocity -= HOP_GRAVITY * dt;
        hop.z += hop.velocity * dt;

        if (hop.z <= 0) {
          hop = undefined;
          legs.land(legBody());
        }
      }

      if (!hop) {
        legs.update(dt, legBody());
      }
    },

    /**
     * Grabs `tank`'s stern: from now on the spider rides on it, its feet on the hull, and meets
     * nothing until it lets go.
     */
    grab(tank: Tank) {
      hold = { tank, seat: STERN_SEAT, angle: tank.hull.rotation(), velocity: tank.hull.linvel() };
      collider.setCollisionGroups(GROUPS.none);
    },

    /**
     * Lets go of the tank and jumps off backward, away from its stern, at `speed` pixels per
     * second; the legs land together when the jump ends. It reads the tank only as it was at the
     * last step, so it also works once the tank is destroyed and its body gone.
     */
    jumpOff(speed = JUMP_SPEED) {
      if (!hold) {
        return;
      }

      const { angle, velocity: tankVelocity } = hold;
      body.setLinvel({ x: tankVelocity.x - Math.cos(angle) * speed, y: tankVelocity.y - Math.sin(angle) * speed }, true);
      hold = undefined;
      hop = { velocity: HOP_LIFT, z: 0 };
      collider.setCollisionGroups(gait === 'low' ? GROUPS.lowSpider : GROUPS.tallSpider);
    },

    /** Puts the spider at `place` at once, standing, as when it respawns. */
    place(place: Point & { rotation: number }) {
      hold = undefined;
      hop = undefined;
      collider.setCollisionGroups(gait === 'low' ? GROUPS.lowSpider : GROUPS.tallSpider);
      body.setTranslation(place, true);
      body.setLinvel({ x: 0, y: 0 }, true);
      facing = place.rotation;
      height = build.height + heightAt(place);
      climb = 0;
      legs.land(legBody());
    },

    /** Takes the spider's body out of the world. */
    remove() {
      world.removeRigidBody(body);
    }
  };

  /** The body as its legs see it; riding a tank, it stands still on the hull. */
  function legBody() {
    const position = body.translation();
    const velocity = hold ? { x: 0, y: 0 } : body.linvel();
    return { x: position.x, y: position.y, z: height + (hop?.z ?? 0), angle: facing, vx: velocity.x, vy: velocity.y };
  }
}

/** The spider from `createSpider`. */
export type Spider = ReturnType<typeof createSpider>;

/**
 * Whether the spider at `position` may grab `tank`'s stern: close to its middle and behind the
 * hull, not beside it.
 */
export function canGrab(tank: Tank, position: Point) {
  const stern = sternOf(tank);
  const center = tank.hull.translation();
  const angle = tank.hull.rotation();
  const back = { x: -Math.cos(angle), y: -Math.sin(angle) };
  const offset = { x: position.x - center.x, y: position.y - center.y };
  const length = Math.hypot(offset.x, offset.y) || 1;
  const behindCos = (offset.x * back.x + offset.y * back.y) / length;

  return Math.hypot(position.x - stern.x, position.y - stern.y) < GRAB_REACH && behindCos > GRAB_BEHIND_COS;
}

/** The middle of `tank`'s rear edge in world coordinates. */
export function sternOf(tank: Tank) {
  return seatOf(tank, { x: -HULL_HALF_LENGTH, y: 0 });
}

/**
 * The spider's builds: `low` small and quick, `tall` slower, higher and with longer legs. Sizes
 * are in pixels, the hull of a tank being 40 x 25.
 */
export const BUILDS = {
  low: {
    /** Collider radius. */
    radius: 7,
    /** Top speed in pixels per second. */
    speed: 155,
    /** Height of the body's top over what its feet stand on. */
    height: 4.5,
    /** How far below the body's top the hips sit. */
    hipDrop: 1.5,
    /** Radius of the front and rear part of the body, and of the upper and lower bone. */
    head: 4.5,
    abdomen: { x: 6.5, y: 5 },
    femurRadius: 1.4,
    tibiaRadius: 1.05,
    legs: {
      hips: [
        { x: 5.5, y: -2.5 },
        { x: 5.5, y: 2.5 },
        { x: 2, y: -3 },
        { x: 2, y: 3 }
      ],
      rest: [
        { x: 14, y: -17 },
        { x: 14, y: 17 },
        { x: -11, y: -17 },
        { x: -11, y: 17 }
      ],
      femur: 13,
      tibia: 14,
      stepThreshold: 6,
      lift: 4,
      slowStep: 0.16,
      fastStep: 0.08,
      fullSpeed: 155
    } satisfies LegSpec
  },
  tall: {
    radius: 8.5,
    speed: 130,
    height: 7.5,
    hipDrop: 2,
    head: 5.4,
    abdomen: { x: 7.8, y: 6 },
    femurRadius: 1.6,
    tibiaRadius: 1.2,
    legs: {
      hips: [
        { x: 6.6, y: -3 },
        { x: 6.6, y: 3 },
        { x: 2.4, y: -3.6 },
        { x: 2.4, y: 3.6 }
      ],
      rest: [
        { x: 17, y: -19 },
        { x: 17, y: 19 },
        { x: -12, y: -19 },
        { x: -12, y: 19 }
      ],
      femur: 17,
      tibia: 19,
      stepThreshold: 8,
      lift: 6,
      slowStep: 0.2,
      fastStep: 0.12,
      fullSpeed: 130
    } satisfies LegSpec
  }
};

/** Height of a hull's top, which the spider's feet stand on while it holds on to a tank. */
const HULL_TOP = 6;
const HULL_HALF_LENGTH = 20;
const HULL_HALF_WIDTH = 12.5;
/** Where the spider sits on a hull it holds, in hull coordinates: over the stern, above the core. */
const STERN_SEAT = { x: -13, y: 0 };
const GRAB_REACH = 22;
/** The spider must be within about 60 degrees of straight behind the hull to grab it. */
const GRAB_BEHIND_COS = 0.5;
const SPIDER_MASS = 0.15;
/** How quickly the run follows the input: the remaining difference falls by e every 1/12 s. */
const ACCELERATION = 12;
const TURN_SPEED = 9;
/** Share of the body height taken from the obstacle right under it, against the feet's average. */
const CENTER_WEIGHT = 0.8;
const CLIMB_STIFFNESS = 260;
const CLIMB_DAMPING = 26;
const JUMP_SPEED = 160;
/** Upward speed of a jump in pixels per second, and the pull back down. */
const HOP_LIFT = 40;
const HOP_GRAVITY = 260;
/** How much a jumping spider can still steer. */
const HOP_CONTROL = 0.15;

/**
 * Where a foot reaching for `point` lands on `tank`'s hull: the nearest spot a pixel inside the
 * hull's top, which carries the foot along.
 */
function onHull(tank: Tank, point: Point) {
  const center = tank.hull.translation();
  const angle = tank.hull.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const local = {
    x: Math.min(Math.max(dx * cos + dy * sin, -HULL_HALF_LENGTH + 1), HULL_HALF_LENGTH - 1),
    y: Math.min(Math.max(-dx * sin + dy * cos, -HULL_HALF_WIDTH + 1), HULL_HALF_WIDTH - 1)
  };

  return { point: seatOf(tank, local), height: HULL_TOP, carrier: tank.hull as RigidBody };
}

function seatOf(tank: Tank, local: Point) {
  const center = tank.hull.translation();
  const angle = tank.hull.rotation();
  return { x: center.x + local.x * Math.cos(angle) - local.y * Math.sin(angle), y: center.y + local.x * Math.sin(angle) + local.y * Math.cos(angle) };
}

function turnToward(from: number, to: number, step: number) {
  const turn = angleBetween(from, to);
  return from + Math.sign(turn) * Math.min(Math.abs(turn), step);
}
