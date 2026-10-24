import { PARTICLE_FIRE, PARTICLE_SPARK, SUN, type ColumnPoint, type createRangeRenderer } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/**
 * Everything that burns, after satellite photos of fires: patches of flame on the ground, a
 * dense column of smoke that hides most of the flames, embers, and a flickering light that throws
 * shadows. A fire of limited life dies down toward its end.
 *
 * The smoke column rises toward the camera. Its axis climbs to `COLUMN_HEIGHT`, swaying, and the
 * wind leans it over more the higher it gets. The camera looks down from `CAMERA_HEIGHT`, so a
 * point of the column appears pushed away from the middle of the screen and larger the higher it
 * is, and the column shifts against the ground as the camera moves. Its shadow is the axis cast
 * onto the ground along the sun, longer for higher points. See `addSmokeColumn` in the renderer.
 */
export function createBurning(renderer: Renderer) {
  const fires: Fire[] = [];

  return {
    /**
     * Sets something on fire.
     *
     * @param spread - Radius in world pixels over which flames appear; bigger fires also smoke more.
     * @param life - Seconds until the fire is out; `Infinity` keeps it burning.
     * @param light - Reach of its light in world pixels.
     * @param brightness - Intensity of its light, 0-1.
     */
    ignite(at: Point, spread: number, life: number, light: number, brightness: number) {
      fires.push({ x: at.x, y: at.y, spread, life, light, brightness, age: 0, flames: 0, embers: 0, seed: Math.random() * 100 });
    },

    /** Feeds every fire's flames and embers over a frame of `dt` seconds, and puts out spent ones. */
    update(dt: number) {
      for (let index = fires.length - 1; index >= 0; index--) {
        const fire = fires[index];
        fire.age += dt;

        if (fire.age >= fire.life) {
          fires.splice(index, 1);
          continue;
        }

        const strength = vigor(fire);
        fire.flames += dt * (FLAME_RATE + fire.spread * FLAME_RATE_PER_SPREAD) * strength;
        fire.embers += dt * EMBER_RATE * strength;

        for (; fire.flames >= 1; fire.flames--) {
          const at = scatter(fire);
          renderer.spawn(PARTICLE_FIRE, at.x, at.y, WIND.x * 0.2 + random(-5, 5), WIND.y * 0.2 + random(-5, 5), random(0.35, 0.7), random(1.6, 3) * strength + 0.6, NO_COLOR);
        }

        for (; fire.embers >= 1; fire.embers--) {
          const angle = Math.random() * Math.PI * 2;
          const speed = random(20, 60);
          renderer.spawn(PARTICLE_SPARK, fire.x, fire.y, Math.cos(angle) * speed + WIND.x, Math.sin(angle) * speed + WIND.y, random(0.4, 0.9), 1.2, EMBER_COLOR);
        }
      }
    },

    /**
     * Adds every fire's smoke column and flickering light to this frame.
     *
     * @param camera - Point on the ground under the camera, which smoke columns lean away from.
     */
    draw(camera: Point) {
      for (const fire of fires) {
        const time = fire.age + fire.seed;
        const axis = columnAxis(fire, time);
        renderer.addSmokeColumn(
          axis.map((point) => seenFrom(camera, point)),
          axis.map(castOnGround),
          RISE_SPEED,
          fire.seed
        );
        const flicker = 0.8 + 0.1 * Math.sin(time * 13) + 0.07 * Math.sin(time * 23.7 + 1) + 0.05 * Math.random();
        renderer.addLight(fire.x, fire.y, fire.light + 6 * Math.sin(time * 7), flicker * fire.brightness * vigor(fire), FIRE_LIGHT, LIGHT_HEIGHT);
      }
    }
  };
}

type Fire = {
  x: number;
  y: number;
  spread: number;
  life: number;
  light: number;
  brightness: number;
  age: number;
  flames: number;
  embers: number;
  /** Offsets the flicker so fires do not pulse in step. */
  seed: number;
};

/** Wind, in world pixels per second: carries smoke and embers to the upper right. */
export const WIND = { x: 22, y: -16 };
const WIND_SPEED = Math.hypot(WIND.x, WIND.y);
/** Speed at which smoke rises, in world pixels per second; billows travel up the column at it. */
const RISE_SPEED = 30;
/** Height above the ground the camera looks down from, in world pixels: sets the strength of parallax. */
const CAMERA_HEIGHT = 600;

/** Height of flames above the floor: above hulls, below turrets. */
const LIGHT_HEIGHT = 8;
const FIRE_LIGHT = [1, 0.62, 0.3];
const FLAME_RATE = 18;
const FLAME_RATE_PER_SPREAD = 4;
/** Height of a smoke column in world pixels, plus more for wider fires. */
const COLUMN_HEIGHT = 140;
const COLUMN_HEIGHT_PER_SPREAD = 3;
/** Radius of a column at its base and at its top. */
const COLUMN_BASE = 6;
const COLUMN_TOP = 34;
/** Sideways drift per pixel of height: smoke rises much faster than the wind carries it off. */
const LEAN = 0.35;
const SPINE_POINTS = 18;
const EMBER_RATE = 3;
/** Seconds over which a dying fire weakens. */
const DYING = 4;
const EMBER_COLOR = [1, 0.6, 0.2, 1];
const NO_COLOR = [0, 0, 0, 0];

/** Strength of a fire, 1 while it burns and falling to 0 over its last seconds. */
function vigor(fire: Fire) {
  return Number.isFinite(fire.life) ? Math.min((fire.life - fire.age) / DYING, 1) : 1;
}

/**
 * Axis of a fire's smoke column in 3D, with its radius: climbing from the fire, leaning downwind
 * the higher it gets, swaying with two waves that travel up it, wider up high, and lower and
 * thinner as the fire dies.
 */
function columnAxis(fire: Fire, time: number) {
  const strength = vigor(fire);
  const along = { x: WIND.x / WIND_SPEED, y: WIND.y / WIND_SPEED };
  const across = { x: -along.y, y: along.x };
  const top = (COLUMN_HEIGHT + fire.spread * COLUMN_HEIGHT_PER_SPREAD) * (0.4 + 0.6 * strength);
  const base = COLUMN_BASE + fire.spread * 0.3;

  return Array.from({ length: SPINE_POINTS + 1 }, (_, index) => {
    const u = index / SPINE_POINTS;
    const height = u * top;
    const drift = height * LEAN;
    const sway = (Math.sin(height * 0.05 - time * 1.1) * 10 + Math.sin(height * 0.12 - time * 1.9 + 2) * 4) * u ** 1.2;
    return {
      x: fire.x + along.x * drift + across.x * sway,
      y: fire.y + along.y * drift + across.y * sway,
      height,
      radius: (base + (COLUMN_TOP - base) * u ** 0.7) * (0.6 + 0.4 * strength)
    };
  });
}

/** Where a point at a height appears from the camera, and how large a radius there looks. */
function seenFrom(camera: Point, point: Point & { height: number; radius: number }): ColumnPoint {
  const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT - point.height);
  return { x: camera.x + (point.x - camera.x) * scale, y: camera.y + (point.y - camera.y) * scale, radius: point.radius * scale };
}

/** Where a point at a height casts its shadow on the ground, along the sun. */
function castOnGround(point: Point & { height: number; radius: number }): ColumnPoint {
  const length = point.height * SUN.shadowLength;
  return { x: point.x + SUN.direction.x * length, y: point.y + SUN.direction.y * length, radius: point.radius };
}

function scatter(fire: Fire) {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * fire.spread;
  return { x: fire.x + Math.cos(angle) * distance, y: fire.y + Math.sin(angle) * distance };
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}
