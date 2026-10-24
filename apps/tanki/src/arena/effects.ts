import type { Graphics } from 'pixi.js';
import type { Collider, Rapier, RigidBody } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import type { Tank } from './bodies';

type Point = { x: number; y: number };

/**
 * Blasts at shot impacts, after Godot's `explosion.tscn`. Each blast is a kinematic sphere whose
 * radius grows from 5 to 35 px in 0.1 s, so it shoves nearby tanks and crates, plus a faint ring
 * and four sparks.
 */
export function createBlasts(rapier: Rapier, world: World) {
  const blasts: { body: RigidBody; collider: Collider; age: number }[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; age: number; life: number; scale: number }[] = [];
  const blastColliders = new Set<number>();

  return {
    /** Shot filter that lets shots pass through blast spheres. */
    canShotHit(collider: Collider) {
      return !blastColliders.has(collider.handle);
    },

    /** Starts a blast at `at` in world coordinates. */
    spawn(at: Point) {
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y));
      const collider = world.createCollider(rapier.ColliderDesc.ball(BLAST_START_RADIUS), body);
      blastColliders.add(collider.handle);
      blasts.push({ body, collider, age: 0 });

      for (let index = 0; index < SPARK_COUNT; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(100, 150);
        sparks.push({
          x: at.x,
          y: at.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: SPARK_LIFETIME * (1 - Math.random() * 0.6),
          scale: randomBetween(1, 2)
        });
      }
    },

    /** Grows blast spheres before a physics step and removes finished ones. */
    step(dt: number) {
      for (let index = blasts.length - 1; index >= 0; index--) {
        const blast = blasts[index];
        blast.age += dt;

        if (blast.age >= BLAST_DURATION) {
          blastColliders.delete(blast.collider.handle);
          world.removeRigidBody(blast.body);
          blasts.splice(index, 1);
          continue;
        }

        blast.collider.setRadius(blastRadius(blast.age));
      }
    },

    /** Moves sparks by a frame of `dt` seconds. */
    update(dt: number) {
      for (let index = sparks.length - 1; index >= 0; index--) {
        const spark = sparks[index];
        spark.age += dt;

        if (spark.age >= spark.life) {
          sparks.splice(index, 1);
          continue;
        }

        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
      }
    },

    /** Redraws all blasts and sparks into `graphics`, which this clears first. */
    draw(graphics: Graphics) {
      graphics.clear();

      for (const blast of blasts) {
        const radius = blastRadius(blast.age);
        const center = blast.body.translation();
        graphics
          .circle(center.x, center.y, radius * 0.88)
          .stroke({ width: radius * 0.24, color: 0xffffff, alpha: BLAST_ALPHA * 0.5 })
          .circle(center.x, center.y, radius)
          .stroke({ width: 2, color: 0xffffff, alpha: BLAST_ALPHA });
      }

      for (const spark of sparks) {
        const alpha = 1 - spark.age / spark.life;
        const speed = Math.hypot(spark.vx, spark.vy);
        const half = (SPARK_LENGTH * spark.scale) / 2;
        const dx = (spark.vx / speed) * half;
        const dy = (spark.vy / speed) * half;
        graphics
          .moveTo(spark.x, spark.y)
          .lineTo(spark.x + dx, spark.y + dy)
          .stroke({ width: 2, color: 0xffffff, alpha: alpha * 0.25 })
          .moveTo(spark.x - dx, spark.y - dy)
          .lineTo(spark.x, spark.y)
          .stroke({ width: 2, color: 0xffffff, alpha });
      }
    }
  };
}

const BLAST_DURATION = 0.1;
const BLAST_START_RADIUS = 5;
const BLAST_GROWTH = 30;
const BLAST_ALPHA = 0.23;
const SPARK_COUNT = 4;
const SPARK_LIFETIME = 0.2;
const SPARK_LENGTH = 47;

function blastRadius(age: number) {
  return BLAST_START_RADIUS + BLAST_GROWTH * Math.min(age / BLAST_DURATION, 1);
}

/**
 * Smoke left by hitscan shots, after Godot's `bullet.gd`: a line from muzzle to impact whose
 * points drift apart with decaying random velocities while the line fades out over 2 s.
 */
export function createShotSmoke() {
  const trails: { points: Point[]; velocities: Point[]; age: number }[] = [];

  return {
    /** Adds a smoke line from `start` to `end`. */
    spawn(start: Point, end: Point) {
      const count = Math.max(1, Math.floor(Math.hypot(end.x - start.x, end.y - start.y) / SMOKE_POINT_SPACING));
      const points: Point[] = [];
      const velocities: Point[] = [];

      for (let index = 0; index < count; index++) {
        const t = index / count;
        points.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });

        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(1, 10);
        velocities.push({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
      }

      trails.push({ points, velocities, age: 0 });
    },

    /** Drifts and ages smoke by a frame of `dt` seconds. */
    update(dt: number) {
      const drag = Math.pow(SMOKE_DRAG_PER_FRAME, dt * 60);

      for (let index = trails.length - 1; index >= 0; index--) {
        const trail = trails[index];
        trail.age += dt;

        if (trail.age >= SMOKE_LIFETIME) {
          trails.splice(index, 1);
          continue;
        }

        trail.points.forEach((point, pointIndex) => {
          const velocity = trail.velocities[pointIndex];
          point.x += velocity.x * dt;
          point.y += velocity.y * dt;
          velocity.x *= drag;
          velocity.y *= drag;
        });
      }
    },

    /** Redraws all smoke into `graphics`, which this clears first. */
    draw(graphics: Graphics) {
      graphics.clear();

      for (const trail of trails) {
        const fade = 1 - trail.age / SMOKE_LIFETIME;
        strokeFading(graphics, trail.points, (t) => ({
          width: 5,
          color: grayColor(lerp(0.675, 0.757, t)),
          alpha: lerp(0.31, 1, t) * fade
        }));
      }
    }
  };
}

const SMOKE_POINT_SPACING = 15;
const SMOKE_LIFETIME = 2;
const SMOKE_DRAG_PER_FRAME = 0.98;

/**
 * Track marks behind every tank, after the two `Line2D` nodes in Godot's `tank.tscn`: each
 * remembers the last 100 positions of a point under one side of the hull, thinning and fading
 * toward its oldest end.
 */
export function createTracks(tanks: readonly Tank[]) {
  const lines = tanks.flatMap((tank) => TRACK_OFFSETS.map((offset) => ({ tank, offset, points: [] as Point[] })));

  return {
    /** Records the current track points; call once per physics step, as Godot did. */
    step() {
      for (const line of lines) {
        const point = toWorld(line.tank.hull, line.offset);
        const previous = line.points.at(-1);

        if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) {
          continue;
        }

        line.points.push(point);

        if (line.points.length > TRACK_LENGTH) {
          line.points.shift();
        }
      }
    },

    /** Redraws all tracks into `graphics`, which this clears first. */
    draw(graphics: Graphics) {
      graphics.clear();

      for (const { points } of lines) {
        strokeFading(graphics, points, (t) => ({
          width: TRACK_WIDTH * (1 - Math.pow(1 - t, 1.4)),
          color: TRACK_COLOR,
          alpha: Math.min(t / 0.9, 1)
        }));
      }
    }
  };
}

/** Track points in hull coordinates: the Godot markers at the left and right sides. */
const TRACK_OFFSETS = [
  { x: 0, y: -10 },
  { x: 0, y: 9 }
];
const TRACK_LENGTH = 100;
const TRACK_WIDTH = 5;
const TRACK_COLOR = 0x212121;

/**
 * Exhaust puffs from every tank, after the `EngineSmoke` particles in Godot's `tank.tscn`:
 * about five puffs a second from the left rear, growing and fading from black to gray over 1.5 s.
 */
export function createEngineSmoke(tanks: readonly Tank[]) {
  const puffs: { x: number; y: number; vx: number; vy: number; age: number; size: number }[] = [];
  const emitters = tanks.map((tank) => ({ tank, debt: Math.random() }));

  return {
    /** Emits and moves puffs by a frame of `dt` seconds. */
    update(dt: number) {
      for (const emitter of emitters) {
        emitter.debt += dt * PUFF_RATE;

        while (emitter.debt >= 1) {
          emitter.debt -= 1;
          const origin = toWorld(emitter.tank.hull, EXHAUST_OFFSET);
          const angle = Math.random() * Math.PI * 2;
          const spread = Math.random() * EXHAUST_RADIUS;
          puffs.push({
            x: origin.x + Math.cos(angle) * spread,
            y: origin.y + Math.sin(angle) * spread,
            vx: randomBetween(-PUFF_TURBULENCE, PUFF_TURBULENCE),
            vy: randomBetween(-PUFF_TURBULENCE, PUFF_TURBULENCE),
            age: 0,
            size: randomBetween(2, 10)
          });
        }
      }

      for (let index = puffs.length - 1; index >= 0; index--) {
        const puff = puffs[index];
        puff.age += dt;

        if (puff.age >= PUFF_LIFETIME) {
          puffs.splice(index, 1);
          continue;
        }

        puff.vy += PUFF_GRAVITY * dt;
        puff.x += puff.vx * dt;
        puff.y += puff.vy * dt;
      }
    },

    /** Redraws all puffs into `graphics`, which this clears first. */
    draw(graphics: Graphics) {
      graphics.clear();

      for (const puff of puffs) {
        const t = puff.age / PUFF_LIFETIME;
        const growth = lerp(0.155, 1, 1 - Math.pow(1 - t, 1.4));
        const color = t < 0.767 ? grayColor(lerp(0, 0.315, t / 0.767)) : grayColor(0.333);
        const alpha = t < 0.767 ? 1 : 1 - (t - 0.767) / (1 - 0.767);
        graphics.circle(puff.x, puff.y, (puff.size * growth) / 2).fill({ color, alpha });
      }
    }
  };
}

const EXHAUST_OFFSET = { x: -16, y: -8 };
const EXHAUST_RADIUS = 2;
const PUFF_RATE = 8 / 1.5;
const PUFF_LIFETIME = 1.5;
const PUFF_GRAVITY = -9.8;
const PUFF_TURBULENCE = 6;

/**
 * Strokes a line whose width, color and alpha change along it, as Godot's `Line2D` does with
 * a width curve and gradient. Pixi strokes one style per path, so the line is split into short
 * runs, each a single path with that run's style. Runs meet with butt caps: per-segment strokes
 * with round caps would overlap at every joint and leave dark beads where they are translucent.
 *
 * @param style - Style at `t`, from 0 at the first point to 1 at the last.
 */
function strokeFading(
  graphics: Graphics,
  points: readonly Point[],
  style: (t: number) => { width: number; color: number; alpha: number }
) {
  const last = points.length - 1;

  for (let start = 0; start < last; start += FADE_RUN) {
    const end = Math.min(start + FADE_RUN, last);
    graphics.moveTo(points[start].x, points[start].y);

    for (let index = start + 1; index <= end; index++) {
      graphics.lineTo(points[index].x, points[index].y);
    }

    graphics.stroke({ ...style((start + end) / 2 / last), cap: 'butt', join: 'round' });
  }
}

/** Points per run in `strokeFading`: fewer means smoother fades and more joints. */
const FADE_RUN = 6;

function toWorld(body: RigidBody, local: Point) {
  const center = body.translation();
  const angle = body.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return { x: center.x + local.x * cos - local.y * sin, y: center.y + local.x * sin + local.y * cos };
}

function grayColor(value: number) {
  const channel = Math.round(Math.min(Math.max(value, 0), 1) * 255);

  return (channel << 16) | (channel << 8) | channel;
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}
