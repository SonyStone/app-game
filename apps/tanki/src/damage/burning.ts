import { PARTICLE_FIRE, PARTICLE_SPARK, SUN, type createRangeRenderer, type SmokeBall } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/**
 * Everything that burns, after satellite photos of fires: patches of flame on the ground, a
 * dense plume of smoke that hides most of the flames, embers, and a flickering light that throws
 * shadows. A fire of limited life dies down toward its end, and its last smoke drifts away after it.
 *
 * Smoke leaves a fire as a steady stream of parcels. Each rises toward the camera, quickly at
 * first and then levelling off, while the wind, stronger higher up, carries it off and gusts push
 * it aside; it swells, its billows roll, and it thins out until it is gone. Every parcel's place
 * and size are smooth functions of its age, so the plume flows without jumps at any frame rate.
 * A parcel is a ball with smaller balls heaped on top; laid over each other, younger and lower
 * parcels first, they read as cauliflower billows.
 *
 * The camera looks down from `CAMERA_HEIGHT`, so a parcel appears pushed away from the middle of
 * the screen and larger the higher it is, and the plume shifts against the ground as the camera
 * moves. Each ball casts its shadow onto the ground along the sun.
 */
export function createBurning(renderer: Renderer) {
  const fires: Fire[] = [];

  return {
    /**
     * Sets something on fire.
     *
     * @param spread - Radius in world pixels over which flames appear; bigger fires also smoke more.
     * @param life - Seconds until the flames are out; `Infinity` keeps it burning.
     * @param light - Reach of its light in world pixels.
     * @param brightness - Intensity of its light, 0-1.
     */
    ignite(at: Point, spread: number, life: number, light: number, brightness: number) {
      fires.push({
        x: at.x,
        y: at.y,
        spread,
        life,
        light,
        brightness,
        age: 0,
        flames: 0,
        embers: 0,
        smoke: 0,
        parcels: [],
        seed: Math.random() * 100
      });
    },

    /**
     * Feeds every fire's flames, embers and smoke over a frame of `dt` seconds, and removes fires
     * whose last smoke is gone.
     */
    update(dt: number) {
      for (let index = fires.length - 1; index >= 0; index--) {
        const fire = fires[index];
        fire.age += dt;

        while (fire.parcels.length > 0 && fire.age - fire.parcels[0].born >= smokeLife(fire)) {
          fire.parcels.shift();
        }

        if (fire.age >= fire.life) {
          if (fire.parcels.length === 0) {
            fires.splice(index, 1);
          }

          continue;
        }

        const strength = vigor(fire);
        fire.flames += dt * (FLAME_RATE + fire.spread * FLAME_RATE_PER_SPREAD) * strength;
        fire.embers += dt * EMBER_RATE * strength;
        fire.smoke += dt * (SMOKE_RATE + fire.spread * SMOKE_RATE_PER_SPREAD);

        for (; fire.flames >= 1; fire.flames--) {
          const at = scatter(fire);
          renderer.spawn(PARTICLE_FIRE, at.x, at.y, WIND.x * 0.2 + random(-5, 5), WIND.y * 0.2 + random(-5, 5), random(0.35, 0.7), random(1.6, 3) * strength + 0.6, NO_COLOR);
        }

        for (; fire.embers >= 1; fire.embers--) {
          const angle = Math.random() * Math.PI * 2;
          const speed = random(20, 60);
          renderer.spawn(PARTICLE_SPARK, fire.x, fire.y, Math.cos(angle) * speed + WIND.x, Math.sin(angle) * speed + WIND.y, random(0.4, 0.9), 1.2, EMBER_COLOR);
        }

        // Parcels leave at an even pace whatever the frame rate: each is born when its share of smoke was due.
        for (; fire.smoke >= 1; fire.smoke--) {
          const born = fire.age - fire.smoke / (SMOKE_RATE + fire.spread * SMOKE_RATE_PER_SPREAD);
          fire.parcels.push(releaseParcel(fire, born, strength));
        }
      }
    },

    /**
     * Adds every fire's smoke and flickering light to this frame.
     *
     * @param camera - Point on the ground under the camera, which rising smoke leans away from.
     */
    draw(camera: Point) {
      for (const fire of fires) {
        // Younger parcels are lower, so they go first; a parcel's place in this order never changes.
        for (let index = fire.parcels.length - 1; index >= 0; index--) {
          drawParcel(renderer, camera, fire, fire.parcels[index]);
        }

        if (fire.age < fire.life) {
          const time = fire.age + fire.seed;
          const flicker = 0.8 + 0.1 * Math.sin(time * 13) + 0.07 * Math.sin(time * 23.7 + 1) + 0.05 * Math.random();
          renderer.addLight(fire.x, fire.y, fire.light + 6 * Math.sin(time * 7), flicker * fire.brightness * vigor(fire), FIRE_LIGHT, LIGHT_HEIGHT);
        }
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
  /** Flames, embers and smoke parcels owed, accumulated between frames. */
  flames: number;
  embers: number;
  smoke: number;
  /** Smoke in the air, oldest first. */
  parcels: Parcel[];
  /** Varies flicker and gusts so fires do not move in step. */
  seed: number;
};

/** A parcel of smoke: where and when it left the fire, and what makes it unlike its neighbours. */
type Parcel = {
  /** Age of the fire when the parcel left it. */
  born: number;
  /** Vigor of the fire then: weaker fires give off thinner, smaller smoke that rises less. */
  strength: number;
  /** Where in the flames it rose from, relative to the fire's center. */
  start: Point;
  /** Velocity of the gust that carries it, on top of the wind; neighbours share gusts, so the plume meanders. */
  gust: Point;
  /** Its own slow wander, in world pixels per second. */
  wander: Point;
  /** Scales of its size and of how high it climbs. */
  size: number;
  climb: number;
  /** Brightness of its smoke, about 1: some smoke is denser and darker than the rest. */
  tone: number;
  /** Angle of its billows and how fast they roll, in radians per second. */
  phase: number;
  roll: number;
  billows: Billow[];
};

/** A smaller ball heaped on a parcel; lengths are shares of the parcel's radius. */
type Billow = { angle: number; offset: number; radius: number; lift: number; tone: number };

/** Wind, in world pixels per second: carries smoke and embers to the upper right. */
export const WIND = { x: 22, y: -16 };
const WIND_SPEED = Math.hypot(WIND.x, WIND.y);
const DOWNWIND = { x: WIND.x / WIND_SPEED, y: WIND.y / WIND_SPEED };
const CROSSWIND = { x: -DOWNWIND.y, y: DOWNWIND.x };
/** Height above the ground the camera looks down from, in world pixels: sets the strength of parallax. */
const CAMERA_HEIGHT = 600;

/** Height of flames above the floor: above hulls, below turrets. */
const LIGHT_HEIGHT = 8;
const FIRE_LIGHT = [1, 0.62, 0.3];
const FLAME_RATE = 18;
const FLAME_RATE_PER_SPREAD = 4;
const EMBER_RATE = 3;
/** Seconds over which a dying fire weakens. */
const DYING = 4;
const EMBER_COLOR = [1, 0.6, 0.2, 1];
const NO_COLOR = [0, 0, 0, 0];

/** Smoke parcels per second, plus more for wider fires. */
const SMOKE_RATE = 14;
const SMOKE_RATE_PER_SPREAD = 0.4;
/** Seconds a parcel lives, plus more for wider fires. */
const SMOKE_LIFE = 7;
const SMOKE_LIFE_PER_SPREAD = 0.3;
/** Height smoke levels off at, in world pixels, plus more for wider fires. */
const SMOKE_HEIGHT = 120;
const SMOKE_HEIGHT_PER_SPREAD = 6;
/** Seconds over which a parcel climbs about two thirds of its way up; it rises fastest at the start. */
const RISE_TIME = 2.2;
/** Share of the wind missing near the ground; a parcel drifts at the full wind once it levels off. */
const SHEAR = 0.7;
/**
 * Radius of a parcel leaving the fire and once it levels off, plus more for wider fires; it keeps
 * swelling at `SWELL`, so the plume fans out downwind.
 */
const SMOKE_BASE = 2.5;
const SMOKE_BASE_PER_SPREAD = 0.4;
const SMOKE_TOP = 11;
const SMOKE_TOP_PER_SPREAD = 0.8;
/** World pixels per second. */
const SWELL = 2;
/** Strongest gust across the wind and along it, in world pixels per second. */
const GUST_ACROSS = 9;
const GUST_ALONG = 5;
/** Strongest wander of a single parcel, in world pixels per second. */
const WANDER = 8;
/**
 * Seconds after leaving the fire over which a parcel thickens: smoke right over the flames is thin,
 * so they show through it.
 */
const THICKENING = { from: 0.35, to: 2 };
/** Share of its life after which a parcel starts thinning out. */
const THINNING = 0.5;
/** Seconds over which a parcel stops glowing with the flames below it. */
const HEAT_TIME = 0.8;
/** Fewest and most billows heaped on a parcel. */
const MIN_BILLOWS = 3;
const MAX_BILLOWS = 6;

/** Strength of a fire, 1 while it burns and falling to 0 over its last seconds. */
function vigor(fire: Fire) {
  return Number.isFinite(fire.life) ? Math.max(Math.min((fire.life - fire.age) / DYING, 1), 0) : 1;
}

/** Seconds a parcel of this fire's smoke lives. */
function smokeLife(fire: Fire) {
  return SMOKE_LIFE + fire.spread * SMOKE_LIFE_PER_SPREAD;
}

/**
 * A new parcel. Gusts are smooth functions of the time it leaves, so parcels leaving together
 * travel together and the plume bends in waves that run downwind.
 */
function releaseParcel(fire: Fire, born: number, strength: number): Parcel {
  const time = born + fire.seed;
  const across = (Math.sin(time * 0.7) * 0.6 + Math.sin(time * 1.9 + 2) * 0.4) * GUST_ACROSS;
  const along = Math.sin(time * 1.1 + 4) * GUST_ALONG;
  const angle = Math.random() * Math.PI * 2;
  const reach = Math.sqrt(Math.random()) * fire.spread * 0.6;
  const wanderAngle = Math.random() * Math.PI * 2;
  const wander = Math.random() * WANDER;

  return {
    born,
    strength,
    start: { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach },
    gust: { x: CROSSWIND.x * across + DOWNWIND.x * along, y: CROSSWIND.y * across + DOWNWIND.y * along },
    wander: { x: Math.cos(wanderAngle) * wander, y: Math.sin(wanderAngle) * wander },
    size: random(0.65, 1.35),
    climb: random(0.85, 1.15),
    tone: random(0.85, 1.15),
    phase: Math.random() * Math.PI * 2,
    roll: random(-0.5, 0.5),
    billows: Array.from({ length: Math.floor(random(MIN_BILLOWS, MAX_BILLOWS + 1)) }, () => ({
      angle: Math.random() * Math.PI * 2,
      offset: random(0.5, 0.75),
      radius: random(0.3, 0.55),
      lift: random(0.35, 0.6),
      tone: random(0.9, 1.1)
    }))
  };
}

/** Adds a parcel's balls to the frame: one large ball and smaller billows heaped on its top. */
function drawParcel(renderer: Renderer, camera: Point, fire: Fire, parcel: Parcel) {
  const age = fire.age - parcel.born;
  const life = smokeLife(fire);
  const strength = parcel.strength;
  const risen = 1 - Math.exp(-age / RISE_TIME);
  const height = (SMOKE_HEIGHT + fire.spread * SMOKE_HEIGHT_PER_SPREAD) * parcel.climb * (0.4 + 0.6 * strength) * risen;
  const downwind = WIND_SPEED * (age - SHEAR * RISE_TIME * risen);
  const x = fire.x + parcel.start.x + DOWNWIND.x * downwind + (parcel.gust.x + parcel.wander.x) * age;
  const y = fire.y + parcel.start.y + DOWNWIND.y * downwind + (parcel.gust.y + parcel.wander.y) * age;
  const base = SMOKE_BASE + fire.spread * SMOKE_BASE_PER_SPREAD;
  const top = SMOKE_TOP + fire.spread * SMOKE_TOP_PER_SPREAD;
  const radius = (base + (top - base) * risen + SWELL * age) * parcel.size * (0.5 + 0.5 * strength);
  const thick = 1 - smoothstep(life * THINNING, life, age);
  const opacity = smoothstep(THICKENING.from, THICKENING.to, age) * thick * Math.min(strength * 1.5, 1);
  // Dense smoke has a crisp edge; thinning smoke goes soft, so overlapping balls do not show as rings.
  const softness = 0.12 + 0.6 * (1 - thick);
  const heat = Math.exp(-age / HEAT_TIME) * strength;
  const turn = parcel.phase + parcel.roll * age;

  addBall(renderer, camera, { x, y, height, radius, opacity, softness, heat, turn, tone: parcel.tone });

  for (const [index, billow] of parcel.billows.entries()) {
    const angle = billow.angle + turn;
    const swell = 1 + 0.12 * Math.sin(age * 0.9 + index * 2.1 + parcel.phase);
    addBall(renderer, camera, {
      x: x + Math.cos(angle) * radius * billow.offset,
      y: y + Math.sin(angle) * radius * billow.offset,
      height: height + radius * billow.lift,
      radius: radius * billow.radius * swell,
      opacity,
      softness,
      heat,
      turn: angle * 2,
      tone: parcel.tone * billow.tone
    });
  }
}

/** A ball of smoke at a height above the ground, with the look the renderer takes as it is. */
type Ball = Point & {
  height: number;
  radius: number;
} & Pick<SmokeBall, 'opacity' | 'softness' | 'heat' | 'turn' | 'tone'>;

/** Adds a ball at a height to the frame, as the camera sees it and with its shadow along the sun. */
function addBall(renderer: Renderer, camera: Point, ball: Ball) {
  const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT - ball.height);
  const seen = { x: camera.x + (ball.x - camera.x) * scale, y: camera.y + (ball.y - camera.y) * scale };
  const cast = ball.height * SUN.shadowLength;
  renderer.addSmokeBall({
    seen: { ...seen, radius: ball.radius * scale },
    shadow: { x: ball.x + SUN.direction.x * cast, y: ball.y + SUN.direction.y * cast, radius: ball.radius },
    opacity: ball.opacity,
    softness: ball.softness,
    heat: ball.heat,
    turn: ball.turn,
    tone: ball.tone
  });
}

function scatter(fire: Fire) {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * fire.spread;
  return { x: fire.x + Math.cos(angle) * distance, y: fire.y + Math.sin(angle) * distance };
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
