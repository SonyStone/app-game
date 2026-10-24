import type { CombatLayout, Placement, WallPlacement } from '../damage/combat';
import { createField, FAR, sampleField, CHANNELS, type DamageField } from '../damage/field';
import { KIND_FIELD, type createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';

type Point = { x: number; y: number };
type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * Something low on the floor that stops tanks but not the spider, which climbs over it:
 *
 * - `rubble`: a heap of broken concrete, roughly round, that any spider climbs.
 * - `barrier`: a low concrete block along `rotation`, which only the tall spider steps over.
 */
export type Obstacle = { kind: 'rubble'; x: number; y: number; radius: number; seed: number } | {
  kind: 'barrier';
  x: number;
  y: number;
  halfLength: number;
  rotation: number;
};

/**
 * A tank's patrol: a closed loop of waypoints it drives around from the first, and the waypoints
 * where it stops and looks around for a while.
 */
export type Patrol = {
  start: Placement;
  route: readonly Point[];
  /** Seconds the tank waits at the waypoint of each index; waypoints not listed are driven through. */
  posts: Readonly<Record<number, number>>;
};

/** Everything the sandbox needs to know about its arena. */
export type SpyArena = CombatLayout & {
  walls: readonly WallPlacement[];
  obstacles: readonly Obstacle[];
  patrols: readonly Patrol[];
  /** Where the spider starts and comes back after it dies. */
  spiderStart: Placement;
};

/**
 * A town quarter: six blocks of buildings around a small square, with a street around each block
 * that one tank patrols. Narrow alleys cut through four blocks; heaps of rubble close three of
 * them to tanks and low barriers close the fourth, so the spider has shortcuts the tanks lack and
 * the tall spider one more. Crates and a barrier stand on the square, which no tank patrols.
 */
export const SPY_ARENA: SpyArena = {
  halfWidth: 620,
  halfHeight: 400,
  walls: [
    // North-west block, split by an alley.
    { x: -455, y: -175, halfWidth: 55, halfHeight: 115 },
    { x: -305, y: -175, halfWidth: 55, halfHeight: 115 },
    // North block.
    { x: 0, y: -175, halfWidth: 140, halfHeight: 115 },
    // North-east block, split by an alley.
    { x: 305, y: -175, halfWidth: 55, halfHeight: 115 },
    { x: 455, y: -175, halfWidth: 55, halfHeight: 115 },
    // South-west block, split by an alley across it.
    { x: -380, y: 105, halfWidth: 130, halfHeight: 45 },
    { x: -380, y: 240, halfWidth: 130, halfHeight: 50 },
    // South block, split by an alley.
    { x: -80, y: 175, halfWidth: 60, halfHeight: 115 },
    { x: 80, y: 175, halfWidth: 60, halfHeight: 115 },
    // South-east block.
    { x: 380, y: 175, halfWidth: 130, halfHeight: 115 }
  ],
  crates: [
    { x: -95, y: 2, rotation: Math.PI / 2 + 0.15 },
    { x: 100, y: 8, rotation: Math.PI / 2 - 0.2 }
  ],
  obstacles: [
    // Heaps at the mouths of the alleys of the north-west, south-west and south blocks.
    { kind: 'rubble', x: -380, y: -280, radius: 25, seed: 1 },
    { kind: 'rubble', x: -380, y: -70, radius: 25, seed: 2 },
    { kind: 'rubble', x: -500, y: 170, radius: 25, seed: 3 },
    { kind: 'rubble', x: -260, y: 170, radius: 25, seed: 4 },
    { kind: 'rubble', x: 0, y: 70, radius: 25, seed: 5 },
    { kind: 'rubble', x: 0, y: 280, radius: 25, seed: 6 },
    // A heap on the square.
    { kind: 'rubble', x: 30, y: -30, radius: 20, seed: 7 },
    // Barriers at the mouths of the north-east alley, and one on the square.
    { kind: 'barrier', x: 380, y: -283, halfLength: 24, rotation: 0 },
    { kind: 'barrier', x: 380, y: -67, halfLength: 24, rotation: 0 },
    { kind: 'barrier', x: -10, y: 35, halfLength: 34, rotation: 0.25 }
  ],
  patrols: [
    {
      start: { x: -565, y: -200, rotation: -Math.PI / 2 },
      route: [
        { x: -565, y: -345 },
        { x: -195, y: -345 },
        { x: -195, y: -25 },
        { x: -565, y: -25 }
      ],
      posts: { 1: 3, 3: 4 }
    },
    {
      start: { x: 195, y: -200, rotation: -Math.PI / 2 },
      route: [
        { x: 195, y: -345 },
        { x: 565, y: -345 },
        { x: 565, y: -25 },
        { x: 195, y: -25 }
      ],
      posts: { 0: 4, 2: 3 }
    },
    {
      start: { x: -400, y: 25, rotation: 0 },
      route: [
        { x: -195, y: 25 },
        { x: -195, y: 345 },
        { x: -565, y: 345 },
        { x: -565, y: 25 }
      ],
      posts: { 0: 4, 2: 3 }
    },
    {
      start: { x: 400, y: 345, rotation: Math.PI },
      route: [
        { x: 195, y: 345 },
        { x: 195, y: 25 },
        { x: 565, y: 25 },
        { x: 565, y: 345 }
      ],
      posts: { 1: 4, 3: 3 }
    }
  ],
  spiderStart: { x: 0, y: 190, rotation: -Math.PI / 2 }
};

/** Height of a heap of rubble's top, in pixels: below a hull, so tanks look over it. */
export const RUBBLE_HEIGHT = 2.5;

/** Height of a low barrier's top: the low spider cannot reach it, the tall one steps on it. */
export const BARRIER_HEIGHT = 4;

/** Half the thickness of a barrier. */
export const BARRIER_HALF_WIDTH = 6;

/**
 * Collision groups, as Rapier packs them: memberships in the upper 16 bits, the groups a collider
 * meets in the lower 16. The battle's own colliders keep Rapier's default of every group.
 */
export const GROUPS = {
  /** The low spider: meets walls, crates, tanks and barriers. */
  lowSpider: 0x0002_ffff,
  /** The tall spider: meets walls, crates and tanks. */
  tallSpider: 0x0004_ffff,
  /** A spider holding on to a tank: meets nothing. */
  none: 0,
  /** Meets everything but the two spiders, `0x0002` and `0x0004`. */
  rubble: 0x0008_fff9,
  /** Meets everything but the tall spider. */
  barrier: 0x0010_fffb
};

/**
 * Puts the arena's obstacles into `world` as one fixed body and prepares their drawings. Rubble
 * stops tanks and lets both spiders through; barriers let only the tall spider through.
 *
 * Reserves a field slot per obstacle for as long as the renderer lives.
 */
export function createObstacles(rapier: Rapier, world: World, renderer: Renderer, obstacles: readonly Obstacle[]) {
  const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const sample = new Float32Array(CHANNELS);
  const shapes = obstacles.map((obstacle) => {
    const field = obstacle.kind === 'rubble' ? createRubbleField(obstacle.radius, obstacle.seed) : createBarrierField(obstacle.halfLength);
    const slot = renderer.allocateField();

    if (slot === undefined) {
      throw new Error('The sandbox ran out of field slots for its obstacles.');
    }

    renderer.uploadField(slot, field);

    if (obstacle.kind === 'rubble') {
      world.createCollider(
        rapier.ColliderDesc.ball(obstacle.radius * RUBBLE_FOOTPRINT).setTranslation(obstacle.x, obstacle.y).setCollisionGroups(GROUPS.rubble),
        body
      );
    } else {
      world.createCollider(
        rapier.ColliderDesc.cuboid(obstacle.halfLength, BARRIER_HALF_WIDTH)
          .setTranslation(obstacle.x, obstacle.y)
          .setRotation(obstacle.rotation)
          .setCollisionGroups(GROUPS.barrier),
        body
      );
    }

    const angle = obstacle.kind === 'barrier' ? obstacle.rotation : 0;
    const height = obstacle.kind === 'rubble' ? RUBBLE_HEIGHT : BARRIER_HEIGHT;
    const color = obstacle.kind === 'rubble' ? RUBBLE_COLOR : BARRIER_COLOR;

    return { obstacle, field, draw: { ...fieldDraw(field, slot), x: obstacle.x, y: obstacle.y, angle, color, height } };
  });

  return {
    /** The fixed body holding every obstacle's collider, which sight passes over. */
    body,

    /**
     * Height of the obstacle top under `point`, 0 on the open floor. It rises over a pixel and a
     * half at an edge, so a foot set on the edge stands halfway up.
     */
    heightAt(point: Point) {
      let height = 0;

      for (const { obstacle, field } of shapes) {
        const local = toLocal(point, obstacle);
        const distance = sampleField(field, local.x, local.y, sample)[0];

        if (distance < EDGE_RAMP) {
          const top = obstacle.kind === 'rubble' ? RUBBLE_HEIGHT : BARRIER_HEIGHT;
          height = Math.max(height, top * smoothstep(EDGE_RAMP, -EDGE_RAMP, distance));
        }
      }

      return height;
    },

    /** Adds every obstacle to this frame; call right after the floor. */
    draw() {
      for (const shape of shapes) {
        renderer.addBody(shape.draw);
      }
    }
  };
}

/** The obstacles of an arena from `createObstacles`. */
export type Obstacles = ReturnType<typeof createObstacles>;

/** Share of a heap's radius its collider covers: the loose stones at its edge do not stop tanks. */
const RUBBLE_FOOTPRINT = 0.8;
const EDGE_RAMP = 1.5;
const RUBBLE_COLOR = [0.58, 0.55, 0.5];
const BARRIER_COLOR = [0.74, 0.73, 0.69];

/**
 * A heap of broken concrete about `radius` px across: chunks of rounded boxes turned every which
 * way, the edge of each chunk painted as a crack over the ones below.
 */
function createRubbleField(radius: number, seed: number) {
  const random = seededRandom(seed);
  const chunks = Array.from({ length: 9 }, (_, index) => {
    const ring = index === 0 ? 0 : radius * (0.3 + 0.38 * random());
    const angle = random() * Math.PI * 2;
    const size = index === 0 ? radius * 0.55 : radius * (0.2 + 0.18 * random());

    return {
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      halfX: size,
      halfY: size * (0.55 + 0.4 * random()),
      turn: random() * Math.PI
    };
  });
  const reach = radius + 3;

  return createField({ minX: -reach, minY: -reach, maxX: reach, maxY: reach }, 1, (x, y) => {
    let armor = FAR;
    let cracks = FAR;

    for (const chunk of chunks) {
      const cos = Math.cos(chunk.turn);
      const sin = Math.sin(chunk.turn);
      const lx = (x - chunk.x) * cos + (y - chunk.y) * sin;
      const ly = -(x - chunk.x) * sin + (y - chunk.y) * cos;
      const distance = roundedBox(lx, ly, chunk.halfX, chunk.halfY, Math.min(chunk.halfX, chunk.halfY) * 0.35);
      armor = Math.min(armor, distance);
      cracks = Math.min(cracks, Math.abs(distance));
    }

    // Only cracks inside the heap show: the outline already draws its rim.
    return [armor, armor > -0.8 ? FAR : cracks - 0.35, FAR, 0];
  });
}

/** A low concrete block `halfLength` px to either side along +x, with a seam along its top. */
function createBarrierField(halfLength: number) {
  const reachX = halfLength + 2;
  const reachY = BARRIER_HALF_WIDTH + 2;

  return createField({ minX: -reachX, minY: -reachY, maxX: reachX, maxY: reachY }, 0.5, (x, y) => {
    const armor = roundedBox(x, y, halfLength, BARRIER_HALF_WIDTH, 2);
    const seam = Math.abs(roundedBox(x, y, halfLength - 3, BARRIER_HALF_WIDTH - 3, 1)) - 0.35;
    return [armor, seam, FAR, 0];
  });
}

/** Signed distance to a box of half size `halfX` x `halfY` with rounded corners. */
function roundedBox(x: number, y: number, halfX: number, halfY: number, radius: number) {
  const qx = Math.abs(x) - halfX + radius;
  const qy = Math.abs(y) - halfY + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function toLocal(point: Point, obstacle: Obstacle) {
  const angle = obstacle.kind === 'barrier' ? obstacle.rotation : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - obstacle.x;
  const dy = point.y - obstacle.y;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A small deterministic generator in [0, 1), so a heap looks the same on every load. */
export function seededRandom(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1;

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function fieldDraw(field: DamageField, slot: number) {
  return { kind: KIND_FIELD, originX: field.originX, originY: field.originY, cell: field.cell, cols: field.cols, rows: field.rows, slot };
}
