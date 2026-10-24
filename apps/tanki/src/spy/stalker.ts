import type { Tank } from '../arena/bodies';
import type { MovingBox, NavGrid } from './navgrid';
import { canGrab, sternOf, type Spider } from './spider';
import type { VisibilityRule } from './variants';
import { angleBetween, inFan, type SightFan } from './visibility';

type Point = { x: number; y: number };

/** A tank as the bot spider weighs it: whether it may be grabbed now and what it sees, widened for safety. */
export type Prey = {
  tank: Tank;
  /** Not jammed, hijacked or freshly released. */
  grabbable: boolean;
  /** Where the tank looks, a little wider than it sees; `undefined` when it sees nothing. Cast on demand, as it costs rays. */
  fan: () => SightFan | undefined;
};

/** The world as the bot spider sees it this step. */
export type StalkerView = {
  clock: number;
  rule: VisibilityRule;
  prey: readonly Prey[];
  /** The tank to hunt whenever it is in play, such as the player's. */
  quarry: Tank | undefined;
  /** Some tank fights the spider. */
  hunted: boolean;
  /** Crates and tanks, which block the way. */
  boxes: readonly MovingBox[];
  lineOfSight: (from: Point, to: Point) => boolean;
};

/** Why an attempt on a stern failed. */
export type AttemptFailure = 'spotted' | 'timeout' | 'lost target' | 'killed' | 'knocked off';

/** Hands the outcome of attempts to the sandbox's tally. */
export type AttemptEvents = {
  /** The spider set out for `target`'s stern. */
  start: (target: Tank) => void;
  /** It gave up before grabbing the stern. */
  fail: (reason: AttemptFailure) => void;
};

/**
 * The bot spider. It picks the tank whose stern it reaches soonest without being seen (the
 * quarry, when given, always), plans a way there over `grid` that keeps out of what the tanks
 * look at and waits in cover while a turret sweeps over the next stretch. At the stern it grabs
 * on and holds until the sandbox reports how it ended; under `hidden` it first waits until no
 * other tank watches the stern, since the act gives it away. Spotted before it grabs, it gives
 * up and flees to a hiding place no tank looks at, waits there and tries again.
 */
export function createStalker(grid: NavGrid, random: () => number, events: AttemptEvents) {
  let phase: StalkerPhase = 'hide';
  let target: Tank | undefined;
  let started = 0;
  let path: Point[] = [];
  let replanAt = 0;
  let waited = 0;
  let calm = 0;
  let hideUntil = 1;
  let shelter: Point | undefined;

  return {
    /** What the spider is up to, for display. */
    get phase() {
      return phase;
    },

    /** The tank it is after, if any. */
    get target() {
      return target;
    },

    /** The way it plans to go, for display. */
    get path(): readonly Point[] {
      return path;
    },

    /**
     * Decides this step's run and heading, whether to hold on to a stern and whether to let go.
     *
     * @returns Run direction in world axes with length up to 1, heading in world radians and
     *   whether to hold the ability key.
     */
    think(dt: number, spider: Spider, view: StalkerView) {
      const position = spider.position;
      calm = view.hunted ? 0 : calm + dt;

      if (spider.holding) {
        phase = phase === 'ride' ? 'ride' : 'hold';
        return { move: STOP, face: undefined, hold: phase === 'hold' };
      }

      if (phase === 'hold' || phase === 'ride') {
        return flee(view, position);
      }

      if (phase === 'stalk') {
        return stalk(dt, position, view);
      }

      if (phase === 'flee') {
        return goToShelter(position, view);
      }

      if (view.clock >= hideUntil && calm > CALM_TIME) {
        pick(position, view);
      }

      return { move: STOP, face: undefined, hold: false };
    },

    /** The ability worked; after infecting the spider rides the tank until it jumps off. */
    succeeded(rides: boolean) {
      phase = rides ? 'ride' : 'hold';
      target = undefined;
    },

    /** The spider was knocked off its prey or died before the ability worked; it flees and plans anew. */
    interrupted(reason: 'killed' | 'knocked off') {
      if (phase === 'stalk' || phase === 'hold') {
        events.fail(reason);
      }

      phase = 'flee';
      shelter = undefined;
      target = undefined;
    }
  };

  /** Sets out for the tank whose stern it reaches soonest, or hides when there is none. */
  function pick(position: Point, view: StalkerView) {
    const candidates = view.prey.filter((prey) => prey.grabbable && (view.quarry === undefined || prey.tank === view.quarry));

    if (candidates.length === 0) {
      return;
    }

    planFrom(position, view);
    let best: { prey: Prey; score: number } | undefined;

    for (const prey of candidates) {
      const goal = grid.nearestOpen(rearOf(prey.tank));
      const score = grid.distanceTo(goal) + watchers(prey.tank, view) * WATCHED_PENALTY + random() * 40;

      if (Number.isFinite(score) && (!best || score < best.score)) {
        best = { prey, score };
      }
    }

    if (!best) {
      return;
    }

    target = best.prey.tank;
    started = view.clock;
    waited = 0;
    phase = 'stalk';
    replanAt = 0;
    events.start(target);
  }

  function stalk(dt: number, position: Point, view: StalkerView) {
    const prey = view.prey.find((item) => item.tank === target);

    if (!prey || !prey.grabbable) {
      events.fail('lost target');
      return flee(view, position);
    }

    if (view.hunted) {
      events.fail('spotted');
      return flee(view, position);
    }

    if (view.clock - started > ATTEMPT_TIMEOUT) {
      events.fail('timeout');
      return flee(view, position);
    }

    const tank = prey.tank;
    const stern = sternOf(tank);
    const toTank = Math.atan2(tank.hull.translation().y - position.y, tank.hull.translation().x - position.x);

    if (canGrab(tank, position)) {
      // Under `hidden` grabbing shows the spider to everyone, so it waits for the others to look away.
      const exposed = view.rule === 'hidden' && watchers(tank, view) > 0 && waited < HIDDEN_PATIENCE;
      waited += exposed ? dt : 0;
      return { move: exposed ? STOP : towards(position, stern, 0.4), face: toTank, hold: !exposed };
    }

    const rear = rearOf(tank);

    if (Math.hypot(rear.x - position.x, rear.y - position.y) < DIRECT_RANGE && view.lineOfSight(position, rear)) {
      return { move: towards(position, rear, 1), face: toTank, hold: false };
    }

    if (view.clock >= replanAt) {
      replanAt = view.clock + REPLAN_TIME;
      planFrom(position, view);
      path = grid.pathTo(grid.nearestOpen(rear));
    }

    const next = nextWaypoint(position, view);

    if (!next) {
      return { move: towards(position, rear, 1), face: toTank, hold: false };
    }

    // A turret sweeps over the next stretch: wait in cover for it to pass, though not forever.
    const dangerAhead = grid.dangerOf(grid.indexOf(next)) >= WAIT_DANGER;
    const safeHere = grid.dangerOf(grid.indexOf(position)) < WAIT_DANGER;

    if (dangerAhead && safeHere && waited < PATIENCE) {
      waited += dt;
      return { move: STOP, face: Math.atan2(next.y - position.y, next.x - position.x), hold: false };
    }

    waited = Math.max(waited - dt * 0.5, 0);
    return { move: towards(position, next, 1), face: Math.atan2(next.y - position.y, next.x - position.x), hold: false };
  }

  /** Gives up the current plan and runs for a hiding place. */
  function flee(view: StalkerView, position: Point) {
    phase = 'flee';
    target = undefined;
    shelter = undefined;
    replanAt = 0;
    return goToShelter(position, view);
  }

  /** Runs to a place no tank looks at, far from the tanks, then hides there for a while. */
  function goToShelter(position: Point, view: StalkerView) {
    if (view.clock >= replanAt) {
      replanAt = view.clock + REPLAN_TIME;
      planFrom(position, view);
      shelter ??= findShelter(view);
      path = shelter ? grid.pathTo(grid.indexOf(shelter)) : [];
    }

    if (!shelter || Math.hypot(shelter.x - position.x, shelter.y - position.y) < ARRIVE_RADIUS || path.length === 0) {
      phase = 'hide';
      hideUntil = view.clock + HIDE_TIME.min + random() * (HIDE_TIME.max - HIDE_TIME.min);
      return { move: STOP, face: undefined, hold: false };
    }

    const next = nextWaypoint(position, view) ?? shelter;
    return { move: towards(position, next, 1), face: Math.atan2(next.y - position.y, next.x - position.x), hold: false };
  }

  /** The reachable cell no tank looks at that is farthest from the tanks, without a long run. */
  function findShelter(view: StalkerView) {
    const tanks = view.prey.map((prey) => prey.tank.hull.translation());
    let best: { index: number; score: number } | undefined;

    for (let index = 0; index < grid.cols * grid.rows; index++) {
      const distance = grid.distanceTo(index);

      if (!Number.isFinite(distance) || grid.dangerOf(index) > 0) {
        continue;
      }

      const center = grid.centerOf(index);
      const nearest = Math.min(...tanks.map((tank) => Math.hypot(tank.x - center.x, tank.y - center.y)), SHELTER_SAFE);
      const score = (SHELTER_SAFE - nearest) * 6 + distance * 0.5;

      if (!best || score < best.score) {
        best = { index, score };
      }
    }

    return best ? grid.centerOf(best.index) : undefined;
  }

  function planFrom(position: Point, view: StalkerView) {
    const tanks = view.prey.map((prey) => prey.tank.hull.translation());

    const fans = view.prey.map((prey) => prey.fan());

    grid.plan(position, view.boxes, (point) => {
      let cost = 0;

      for (const [index, fan] of fans.entries()) {
        if (fan && inFan(fan, point)) {
          cost += DANGER_COST;
        }

        const gap = Math.hypot(point.x - tanks[index].x, point.y - tanks[index].y);
        cost += gap < CROWD_RANGE ? ((CROWD_RANGE - gap) / CROWD_RANGE) * CROWD_COST : 0;
      }

      return cost;
    });
  }

  /** The farthest of the next few waypoints the spider can run to in a straight line. */
  function nextWaypoint(position: Point, view: StalkerView) {
    while (path.length > 0 && Math.hypot(path[0].x - position.x, path[0].y - position.y) < ARRIVE_RADIUS) {
      path.shift();
    }

    for (let index = Math.min(path.length, LOOKAHEAD) - 1; index > 0; index--) {
      if (view.lineOfSight(position, path[index])) {
        path.splice(0, index);
        break;
      }
    }

    return path[0];
  }

  /** How many other tanks have the stern of `tank` in plain view within `WATCH_RANGE`. */
  function watchers(tank: Tank, view: StalkerView) {
    const stern = sternOf(tank);

    return view.prey.filter((prey) => {
      if (prey.tank === tank) {
        return false;
      }

      const at = prey.tank.hull.translation();
      return Math.hypot(at.x - stern.x, at.y - stern.y) < WATCH_RANGE && view.lineOfSight(at, stern);
    }).length;
  }
}

/** The bot spider from `createStalker`. */
export type Stalker = ReturnType<typeof createStalker>;

/** What the bot spider is up to: picking prey after hiding, stalking it, holding its stern, riding it, fleeing or hiding. */
export type StalkerPhase = 'hide' | 'stalk' | 'hold' | 'ride' | 'flee';

/**
 * Drives a hijacked tank for the bot spider: it turns on the nearest tank of its old team it
 * can see, closes in to a middle distance and fires once the turret points at it.
 *
 * @param victims - Tanks of the hijacked tank's team in play.
 * @returns Drive direction in world axes, the turret heading to turn to and whether the turret is on target.
 */
export function hijackControls(tank: Tank, victims: readonly Tank[], lineOfSight: (from: Point, to: Point) => boolean) {
  const position = tank.hull.translation();
  const seen = victims
    .map((victim) => ({ victim, at: victim.hull.translation() }))
    .filter((item) => lineOfSight(position, item.at))
    .sort((a, b) => Math.hypot(a.at.x - position.x, a.at.y - position.y) - Math.hypot(b.at.x - position.x, b.at.y - position.y))[0];
  const goal = seen?.at ?? victims[0]?.hull.translation();

  if (!goal) {
    return { move: STOP, aim: tank.turretAngle, onTarget: false };
  }

  const aim = Math.atan2(goal.y - position.y, goal.x - position.x);
  const distance = Math.hypot(goal.x - position.x, goal.y - position.y);
  const move = distance > HIJACK_RANGE ? towards(position, goal, HIJACK_THROTTLE) : STOP;

  return { move, aim, onTarget: seen !== undefined && Math.abs(angleBetween(tank.turretAngle, aim)) < 0.05 };
}

const STOP = { x: 0, y: 0 };
/** Seconds without any tank fighting the spider before it sets out again. */
const CALM_TIME = 1.5;
const HIDE_TIME = { min: 1.5, max: 3.5 };
/** Seconds an attempt may take before the spider gives it up. */
const ATTEMPT_TIMEOUT = 35;
/** Within this distance of a stern in plain sight the spider runs straight at it. */
const DIRECT_RANGE = 48;
const REPLAN_TIME = 0.25;
const ARRIVE_RADIUS = 10;
const LOOKAHEAD = 5;
/** Extra cost of a cell a tank looks at, in pixels of detour. */
const DANGER_COST = 400;
/** Cells at least this costly are worth waiting outside of. */
const WAIT_DANGER = DANGER_COST;
/** Seconds the spider waits in cover for a sweep to pass before it runs anyway. */
const PATIENCE = 2.5;
/** Seconds the spider waits behind a stern under `hidden` for the other tanks to look away. */
const HIDDEN_PATIENCE = 3;
/** Within this distance of a tank cells cost more, up to `CROWD_COST` right next to it. */
const CROWD_RANGE = 70;
const CROWD_COST = 60;
const WATCH_RANGE = 450;
const WATCHED_PENALTY = 300;
/** A hiding place this far from every tank is as good as any farther one. */
const SHELTER_SAFE = 320;
const HIJACK_RANGE = 220;
const HIJACK_THROTTLE = 0.8;

/** The point just behind `tank`'s stern the spider makes for, ahead of where the tank moves. */
function rearOf(tank: Tank) {
  const stern = sternOf(tank);
  const angle = tank.hull.rotation();
  const velocity = tank.hull.linvel();
  return { x: stern.x - Math.cos(angle) * REAR_GAP + velocity.x * LEAD_TIME, y: stern.y - Math.sin(angle) * REAR_GAP + velocity.y * LEAD_TIME };
}

const REAR_GAP = 10;
const LEAD_TIME = 0.3;

function towards(from: Point, to: Point, throttle: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-3) {
    return STOP;
  }

  const scale = Math.min(length / SLOW_RADIUS, 1) * throttle;
  return { x: (dx / length) * scale, y: (dy / length) * scale };
}

/** Within this distance of where it runs to the spider slows down, so it stops on the spot. */
const SLOW_RADIUS = 12;
