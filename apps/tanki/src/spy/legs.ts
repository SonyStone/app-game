type Point = { x: number; y: number };

/** A point above the floor: `z` is its height in pixels. */
export type Point3 = { x: number; y: number; z: number };

/**
 * Something a foot can stand on that moves, such as a tank's hull: a planted foot keeps its spot
 * on it and rides along. Rapier's rigid bodies fit.
 */
export type Carrier = { translation(): Point; rotation(): number };

/**
 * Where a foot reaching for `point` lands: the spot itself, or the nearest spot the spider can
 * hold on to, the height of the surface there and what carries it, if it moves.
 */
export type Surface = (point: Point) => { point: Point; height: number; carrier?: Carrier };

/**
 * The build of a four-legged walker. Legs are numbered front left, front right, rear left, rear
 * right; local axes are +x ahead and +y to the right, as on screen with y down.
 */
export type LegSpec = {
  /** Where each leg joins the body, in body coordinates. */
  hips: readonly Point[];
  /** Where each foot rests when the walker stands, in body coordinates. */
  rest: readonly Point[];
  /** Length of the upper and lower bone of every leg, in pixels. */
  femur: number;
  tibia: number;
  /** How far a planted foot may fall behind its spot before its pair steps. */
  stepThreshold: number;
  /** How high a foot lifts in a full step. */
  lift: number;
  /** Seconds a step takes when walking slowly, and at `fullSpeed` pixels per second. */
  slowStep: number;
  fastStep: number;
  fullSpeed: number;
};

/**
 * The body a walker's legs carry: where it is, which way it faces and how fast it moves against
 * what its feet stand on, which is not the world's speed when it rides on a tank.
 */
export type LegBody = Point3 & { angle: number; vx: number; vy: number };

/**
 * Four legs that walk a body around in a trot: the diagonal pairs, front left with rear right and
 * front right with rear left, take turns. A planted foot stays exactly where it landed, or rides
 * along with what carries it, and lifts only when its spot has moved far enough ahead; the
 * stride lengthens and the steps quicken with speed, and feet land ahead of their spots by half
 * a stride, so they swing evenly about them. Standing still, the feet settle back onto their
 * spots one pair at a time.
 *
 * Each frame `update` moves the feet; `pose` solves each leg as two bones whose knee bends up and
 * outward across the leg, so from above the legs arch away from the body like a spider's.
 *
 * @param body - Where the body starts; the feet start planted at rest around it.
 */
export function createLegs(spec: LegSpec, body: LegBody, surface: Surface) {
  const feet: Foot[] = spec.rest.map((rest) => {
    const landing = surface(toWorld(body, rest));
    return plant(landing);
  });
  let stillFor = 0;

  return {
    /** The feet: where each is now and whether it stands or swings. */
    get feet(): readonly Readonly<Foot>[] {
      return feet;
    },

    /** Average height of the surfaces the feet stand on, for the body to keep its height over. */
    get groundHeight() {
      return feet.reduce((total, foot) => total + (foot.step ? foot.step.to.z : foot.position.z), 0) / feet.length;
    },

    /**
     * Moves the feet over `dt` seconds for the body where it is now: carried feet ride along,
     * swinging feet follow their landing spots, and a pair whose feet fell behind steps.
     */
    update(dt: number, body: LegBody) {
      const speed = Math.hypot(body.vx, body.vy);
      const duration = stepDuration(spec, speed);
      // Landing half a stance ahead of the spot makes a foot swing evenly about it; a stance lasts
      // at least the other pair's step.
      const lead = Math.min(0.5 * Math.max(spec.stepThreshold / Math.max(speed, 1e-3), duration + dt), duration + dt);
      stillFor = speed < STILL_SPEED ? stillFor + dt : 0;

      for (const [index, foot] of feet.entries()) {
        const target = surface(toWorld(body, spec.rest[index], { x: body.vx * lead, y: body.vy * lead }));

        if (foot.step) {
          swing(foot, target, dt);
        } else if (foot.carrier && foot.local) {
          const ridden = carriedPoint(foot.carrier, foot.local);
          foot.position = { ...ridden, z: foot.position.z };
        }

        foot.target = target;
      }

      startSteps(body, duration);
    },

    /**
     * Each leg's joints for the body where it is now: the hip on the body, the knee and the foot.
     *
     * @param hipDrop - How far below the body's top the hips sit.
     */
    pose(body: LegBody, hipDrop: number) {
      return feet.map((foot, index) => {
        const hip = { ...toWorld(body, spec.hips[index]), z: Math.max(body.z - hipDrop, 0) };
        const side = spec.hips[index].y < 0 ? -1 : 1;
        const out = { x: -Math.sin(body.angle) * side, y: Math.cos(body.angle) * side };
        const reach = { x: foot.position.x - hip.x, y: foot.position.y - hip.y };
        const length = Math.hypot(reach.x, reach.y) || 1;
        // Across the leg as seen from above, on the side away from the body's middle.
        let across = { x: -reach.y / length, y: reach.x / length };
        across = across.x * out.x + across.y * out.y >= 0 ? across : { x: -across.x, y: -across.y };
        const pole = { x: across.x * KNEE_OUT, y: across.y * KNEE_OUT, z: 1 };
        return { hip, knee: solveKnee(hip, foot.position, spec.femur, spec.tibia, pole), foot: foot.position };
      });
    },

    /** Puts every foot down at rest around `body` at once, as after a jump. */
    land(body: LegBody) {
      for (const [index, foot] of feet.entries()) {
        Object.assign(foot, plant(surface(toWorld(body, spec.rest[index]))));
      }
    }
  };

  /**
   * Starts the steps this frame needs. The pair that fell furthest behind steps while the other
   * pair stands, or once the other pair is past the middle of its step if it fell far behind, as
   * when speeding up. A foot stretched past its reach lifts its whole pair at once.
   */
  function startSteps(body: LegBody, duration: number) {
    const reach = (spec.femur + spec.tibia) * MAX_REACH;

    for (const [index, foot] of feet.entries()) {
      if (!foot.step && distance3(foot.position, { ...toWorld(body, spec.hips[index]), z: body.z }) > reach) {
        const pair = PAIRS.find((candidate) => candidate.some((member) => member === index))!;
        pair.filter((member) => !feet[member].step).forEach((member) => lift(feet[member], duration));
      }
    }

    const threshold = stillFor > SETTLE_DELAY ? SETTLE_THRESHOLD : spec.stepThreshold;
    const lag = PAIRS.map((pair) => Math.max(...pair.map((index) => behind(feet[index]))));
    const order = lag[0] >= lag[1] ? [0, 1] : [1, 0];

    for (const pairIndex of order) {
      const pair = PAIRS[pairIndex];
      const other = PAIRS[1 - pairIndex];
      const otherDown = other.every((index) => !feet[index].step);
      const otherLanding = other.every((index) => (feet[index].step?.t ?? 1) > OVERLAP_AFTER);
      const urgent = lag[pairIndex] > spec.stepThreshold * URGENT_LAG;

      if (lag[pairIndex] > threshold && pair.every((index) => !feet[index].step) && (otherDown || (urgent && otherLanding))) {
        for (const index of pair) {
          if (behind(feet[index]) > MIN_STEP) {
            lift(feet[index], duration);
          }
        }

        return;
      }
    }
  }

  function lift(foot: Foot, duration: number) {
    foot.step = { from: { ...foot.position }, to: { ...foot.target.point, z: foot.target.height }, t: 0, duration };
    foot.carrier = undefined;
    foot.local = undefined;
  }

  /** Moves a swinging foot along its arc toward `target`, which may still move; lands it at the end. */
  function swing(foot: Foot, target: Landing, dt: number) {
    const step = foot.step!;
    step.t = Math.min(step.t + dt / step.duration, 1);
    step.to = { ...target.point, z: target.height };
    const eased = step.t * step.t * (3 - 2 * step.t);
    const length = Math.hypot(step.to.x - step.from.x, step.to.y - step.from.y);
    const arc = Math.sin(Math.PI * step.t) * spec.lift * Math.min(length / spec.stepThreshold, 1);
    foot.position = {
      x: step.from.x + (step.to.x - step.from.x) * eased,
      y: step.from.y + (step.to.y - step.from.y) * eased,
      z: step.from.z + (step.to.z - step.from.z) * eased + arc
    };

    if (step.t >= 1) {
      Object.assign(foot, plant(target));
    }
  }
}

/** The legs of a walker from `createLegs`. */
export type Legs = ReturnType<typeof createLegs>;

/** A foot: planted on a surface, or swinging through a step. */
type Foot = {
  position: Point3;
  /** Where the foot would land if it stepped now. */
  target: Landing;
  step: { from: Point3; to: Point3; t: number; duration: number } | undefined;
  /** What the planted foot stands on, if it moves, and where on it, in its local axes. */
  carrier: Carrier | undefined;
  local: Point | undefined;
};

type Landing = ReturnType<Surface>;

/** The diagonal pairs that step together: front left with rear right, front right with rear left. */
const PAIRS = [
  [0, 3],
  [1, 2]
] as const;

/** Share of a leg's full length it may stretch to before its foot steps regardless of its pair. */
const MAX_REACH = 0.97;
/** Below this speed in pixels per second the walker counts as standing. */
const STILL_SPEED = 4;
/** Seconds of standing before the feet settle back onto their spots. */
const SETTLE_DELAY = 0.2;
/** How far a foot may sit off its spot once settled. */
const SETTLE_THRESHOLD = 1.2;
/** Feet nearer their spot than this stay put when their pair steps. */
const MIN_STEP = 0.6;
/** A pair this many step thresholds behind may step before the other pair lands, */
const URGENT_LAG = 2.6;
/** once the other pair is this far through its step. */
const OVERLAP_AFTER = 0.5;
/** How far the knees lean out across the leg against straight up. */
const KNEE_OUT = 0.35;

function plant(landing: Landing): Foot {
  return {
    position: { ...landing.point, z: landing.height },
    target: landing,
    step: undefined,
    carrier: landing.carrier,
    local: landing.carrier ? carrierLocal(landing.carrier, landing.point) : undefined
  };
}

/** How far a planted foot is from where it would land now; 0 while it swings. */
function behind(foot: Foot) {
  return foot.step ? 0 : Math.hypot(foot.target.point.x - foot.position.x, foot.target.point.y - foot.position.y);
}

/** Seconds a step takes at `speed`: from `slowStep` standing to `fastStep` at full speed. */
function stepDuration(spec: LegSpec, speed: number) {
  const share = Math.min(speed / spec.fullSpeed, 1);
  return spec.slowStep + (spec.fastStep - spec.slowStep) * share;
}

/**
 * The knee of a two-bone leg from `hip` to `foot`: the bones keep their lengths and the knee
 * bends toward `pole`. A foot out of reach straightens the leg toward it.
 */
export function solveKnee(hip: Point3, foot: Point3, femur: number, tibia: number, pole: Point3): Point3 {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const dz = foot.z - hip.z;
  const length = Math.hypot(dx, dy, dz) || 1e-6;
  const reach = Math.min(Math.max(length, Math.abs(femur - tibia) + 1e-3), femur + tibia - 1e-3);
  const along = (femur * femur - tibia * tibia + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(femur * femur - along * along, 0));
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  const dot = pole.x * direction.x + pole.y * direction.y + pole.z * direction.z;
  let bend = { x: pole.x - direction.x * dot, y: pole.y - direction.y * dot, z: pole.z - direction.z * dot };
  const bendLength = Math.hypot(bend.x, bend.y, bend.z);
  bend = bendLength > 1e-6 ? { x: bend.x / bendLength, y: bend.y / bendLength, z: bend.z / bendLength } : { x: 0, y: 0, z: 1 };

  return {
    x: hip.x + direction.x * along + bend.x * out,
    y: hip.y + direction.y * along + bend.y * out,
    z: hip.z + direction.z * along + bend.z * out
  };
}

function toWorld(body: LegBody, local: Point, offset: Point = { x: 0, y: 0 }) {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return { x: body.x + local.x * cos - local.y * sin + offset.x, y: body.y + local.x * sin + local.y * cos + offset.y };
}

function carrierLocal(carrier: Carrier, point: Point) {
  const center = carrier.translation();
  const angle = carrier.rotation();
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
}

function carriedPoint(carrier: Carrier, local: Point) {
  const center = carrier.translation();
  const angle = carrier.rotation();
  return { x: center.x + local.x * Math.cos(angle) - local.y * Math.sin(angle), y: center.y + local.x * Math.sin(angle) + local.y * Math.cos(angle) };
}

function distance3(a: Point3, b: Point3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
