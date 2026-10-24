import { PARTICLE_FIRE, PARTICLE_SPARK, type createRangeRenderer } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/**
 * Everything that burns and smokes, after satellite photos of fires: patches of flame on the
 * ground, a dense plume of smoke that drifts off the flames, embers, a flickering light that
 * throws shadows, and puffs of soot from exhausts and blasts. A fire of limited life dies down
 * toward its end, and its last smoke drifts away after it.
 *
 * Smoke leaves a fire as a steady stream of parcels. Each rises toward the camera, quickly at
 * first and then levelling off, while the wind, stronger higher up, carries it off and gusts push
 * it aside; it swells, its billows roll, and it thins out until it is gone. Every parcel's place
 * and size are smooth functions of its age, so the plume flows without jumps at any frame rate.
 * A parcel is a body with billows heaped on top and smaller billows on those: cauliflower.
 *
 * All smoke goes to the renderer as balls placed where they are in the air (`addSmokeBall`); the
 * renderer shows them as the camera sees them, in its current style, with their shadows.
 */
export function createBurning(renderer: Renderer) {
  const fires: Fire[] = [];
  const soot: Soot[] = [];

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
     * Gives off a puff of soot, such as exhaust or the smoke of a blast. It drifts off at `vx`,
     * `vy` world pixels per second, slowing down; it swells, rises a little, bigger puffs higher,
     * and fades away over the second half of its `life` in seconds. Puffs of `size` world pixels
     * and more glow at first with the fireball they came from.
     */
    puff(x: number, y: number, vx: number, vy: number, life: number, size: number) {
      soot.push({
        x,
        y,
        vx,
        vy,
        age: 0,
        life,
        size,
        tone: random(0.9, 1.1),
        turn: Math.random() * Math.PI * 2
      });
    },

    /**
     * Feeds every fire's flames, embers and smoke and moves soot over a frame of `dt` seconds;
     * removes fires whose last smoke is gone and soot that has faded away.
     */
    update(dt: number) {
      const drag = Math.exp(-SOOT_DRAG * dt);

      for (let index = soot.length - 1; index >= 0; index--) {
        const puff = soot[index];
        puff.age += dt;
        puff.x += puff.vx * dt;
        puff.y += puff.vy * dt;
        puff.vx *= drag;
        puff.vy *= drag;

        if (puff.age >= puff.life) {
          soot.splice(index, 1);
        }
      }

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

    /** Adds every fire's smoke and flickering light, and all soot, to this frame. */
    draw() {
      soot.forEach((puff) => drawSoot(renderer, puff));

      for (const fire of fires) {
        for (const parcel of fire.parcels) {
          drawParcel(renderer, fire, parcel);
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

/**
 * A smaller ball heaped on a parcel's body (`level` 1) or on one of its billows (`level` 2, on
 * billow `parent`). Lengths are shares of the radius of the ball it sits on, `angle` turns with
 * the parcel's billows.
 */
type Billow = { level: 1 | 2; parent: number; angle: number; offset: number; radius: number; lift: number; tone: number };

/** A puff of soot; `tone` and `turn` as in `SmokeBall`. */
type Soot = Point & {
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  tone: number;
  turn: number;
};

/** Wind, in world pixels per second: carries smoke and embers to the upper right. */
export const WIND = { x: 22, y: -16 };
const WIND_SPEED = Math.hypot(WIND.x, WIND.y);
const DOWNWIND = { x: WIND.x / WIND_SPEED, y: WIND.y / WIND_SPEED };
const CROSSWIND = { x: -DOWNWIND.y, y: DOWNWIND.x };

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
const SMOKE_RATE = 8;
const SMOKE_RATE_PER_SPREAD = 0.25;
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
/** Share of its life after which a parcel starts fading away, and the share of the fading before it thins. */
const THINNING = 0.6;
const FADE_FROM = 0.3;
/** Seconds over which a parcel stops glowing with the flames below it. */
const HEAT_TIME = 0.8;
/** Slowing of soot, per second, as in `PARTICLE_*` drags; how far it rises over its life and swells, per world pixel of its size. */
const SOOT_DRAG = 1.5;
const SOOT_RISE = 2.5;
const SOOT_SWELL = 1.5;
/** Soot at least this many world pixels across comes from blasts and glows for about `SOOT_HEAT_TIME` seconds. */
const SOOT_GLOWING = 3;
const SOOT_HEAT_TIME = 0.35;
/** Fewest and most billows heaped on a parcel's body. */
const MIN_BILLOWS = 4;
const MAX_BILLOWS = 5;
/** Share of billows that carry two smaller billows instead of one. */
const SECOND_BILLOW = 0.3;

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
    billows: heapBillows()
  };
}

/**
 * Billows for a parcel: a ring of them on its body, spread around it so they cover its top, and
 * one smaller one on each of those, sometimes two, which makes the cauliflower of thick smoke.
 */
function heapBillows() {
  const count = Math.floor(random(MIN_BILLOWS, MAX_BILLOWS + 1));
  const start = Math.random() * Math.PI * 2;
  const billows: Billow[] = [];

  for (let index = 0; index < count; index++) {
    billows.push({
      level: 1,
      parent: -1,
      angle: start + ((index + random(-0.3, 0.3)) / count) * Math.PI * 2,
      offset: random(0.45, 0.7),
      radius: random(0.4, 0.55),
      lift: random(0.3, 0.45),
      tone: random(0.92, 1.08)
    });
  }

  for (let parent = 0; parent < count; parent++) {
    for (let index = Math.random() < SECOND_BILLOW ? 2 : 1; index > 0; index--) {
      billows.push({
        level: 2,
        parent,
        angle: Math.random() * Math.PI * 2,
        offset: random(0.45, 0.7),
        radius: random(0.45, 0.6),
        lift: random(0.2, 0.35),
        tone: random(0.94, 1.06)
      });
    }
  }

  return billows;
}

/** Adds a parcel's balls to the frame: its body, billows heaped on its top and smaller billows on those. */
function drawParcel(renderer: Renderer, fire: Fire, parcel: Parcel) {
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
  const opacity = smoothstep(THICKENING.from, THICKENING.to, age) * thinning(age / life) * Math.min(strength * 1.5, 1);
  const heat = Math.exp(-age / HEAT_TIME) * strength;
  const turn = parcel.phase + parcel.roll * age;

  const body = { x, y, height, bodyHeight: height, radius, opacity, heat, turn, tone: parcel.tone };
  const balls: (typeof body)[] = [];
  renderer.addSmokeBall(body);

  for (const [index, billow] of parcel.billows.entries()) {
    const under = billow.level === 1 ? body : balls[billow.parent];
    const angle = billow.angle + turn * billow.level;
    const swell = 1 + 0.12 * Math.sin(age * 0.9 + index * 2.1 + parcel.phase);
    const ball = {
      x: under.x + Math.cos(angle) * under.radius * billow.offset,
      y: under.y + Math.sin(angle) * under.radius * billow.offset,
      height: under.height + under.radius * billow.lift,
      bodyHeight: height,
      radius: under.radius * billow.radius * swell,
      opacity,
      heat,
      turn: angle * 2,
      tone: parcel.tone * billow.tone
    };
    balls.push(ball);
    renderer.addSmokeBall(ball);
  }
}

/** Adds a puff of soot to the frame as one ball of smoke. */
function drawSoot(renderer: Renderer, puff: Soot) {
  const t = puff.age / puff.life;
  const height = SOOT_RISE * puff.size * t;
  renderer.addSmokeBall({
    x: puff.x,
    y: puff.y,
    height,
    bodyHeight: height,
    radius: puff.size * (0.8 + SOOT_SWELL * t),
    opacity: smoothstep(0, 0.12, t) * (1 - smoothstep(0.45, 1, t)),
    heat: Math.exp(-puff.age / SOOT_HEAT_TIME) * Math.min(Math.max((puff.size - SOOT_GLOWING) / 3, 0), 1),
    tone: puff.tone,
    turn: puff.turn + puff.age * 0.3
  });
}

/**
 * Opacity left to smoke that has lived `share` of its life: full until `THINNING`, then thinning
 * out to nothing, slowly at first.
 */
function thinning(share: number) {
  return 1 - smoothstep(THINNING + (1 - THINNING) * FADE_FROM, 1, share);
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
