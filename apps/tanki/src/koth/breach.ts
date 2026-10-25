import type { Tank } from '../arena/bodies';
import type { Combat } from '../damage/combat';
import { canDrive, cellAt, cellCenter, findBreachPath, findPath, isOpenAt, pathLength, type NavGrid } from './navigation';
import type { Trigger, Weapon } from './classes/weapon';
import { openingFor, type Blocker } from './opening';
import type { Member, TeamBoard } from './team';

type Point = { x: number; y: number };

/** What a breacher needs from the match around its bot. */
export type BreachContext = {
  combat: Combat;
  grid: NavGrid;
  /** The board of the bot's team, for known enemies and how exposed places are. */
  board: TeamBoard;
  /** Match time in seconds. */
  clock: () => number;
  /** Sets how the member works its trigger this step; the match fires what the weapon gives. */
  trigger: (member: Member, trigger: Trigger) => void;
};

/**
 * Where the bot is going and whether it may break through a wall on the way: only on its way
 * somewhere, not while it fights or holds a spot.
 *
 * @param cost - Extra cell costs of the bot's route, as for `findPath`.
 * @param route - The way the bot's driver plans to `destination`, if it has one: the way around
 *   that a breach is weighed against, which spares planning it again.
 */
export type BreachTravel = { destination: Point | undefined; allowed: boolean; cost: (cell: number) => number; route?: readonly Point[] };

/**
 * What the breacher wants the bot to do this step: drive to `destination` with its driver, or
 * drive along `move` directly; and swing the turret to `aim`, in world radians. Without an order
 * the bot goes its own way.
 */
export type BreachOrder = { destination?: Point; arrive?: number; move?: Point; aim?: number };

/**
 * A bot's sense for breaking through walls on its way: whether a way through a breakable wall or
 * a wreck beats driving around, and the doing of it.
 *
 * Deciding, about once a second while the bot travels: it plans the way to where it is going
 * twice, around everything and through what breaks (`findBreachPath`), where a crossing costs
 * the time its class needs to open it, by ramming or by its own gun, whichever is quicker
 * (`openingFor`): a Heavy rams brick open, a Demoman blows it apart, a Scout shoots a wreck to
 * pieces. Standing still to break adds risk. The bot breaks through only where it saves at least
 * `MIN_SAVING` s and a quarter of the drive around, never through steel or concrete, never under
 * fire, with known enemies within `VETO_RANGE` px or where they could see the spot it would
 * break from; but when wrecks and walls have closed every way there, it breaks through wherever
 * the enemy is, unless under fire.
 *
 * Doing (`step`): the bot drives to a spot in front of the wall square to it. A wall it rams: back
 * to a run-up, full ahead into the wall, again if need be. Anything else it shoots, spreading the
 * shots over the crossing where material is left. Once the grid shows the way open, the bot drives
 * on, through it. It gives up when enemies show up or it comes under fire, when breaking
 * takes far longer than planned, or when the bot is going elsewhere now; it does not try the same
 * spot again for a while.
 */
export function createBreacher(member: Member, context: BreachContext) {
  const { combat, grid, board } = context;
  /** Share of its class's top speed a tank keeps along a way, as the bots' travel estimates take it. */
  const pace = () => member.tankClass.speed * PACE_SHARE;
  const refused: { at: Point; until: number }[] = [];
  let plan: Plan | undefined;
  let nextThought = (member.id * 0.37) % CONSIDER_INTERVAL;
  const stats = {
    /** Times a way through a wall was weighed against the way around, and taken. */
    considered: 0,
    chosen: 0,
    /** Breaches opened, driven through, and given up. */
    opened: 0,
    passed: 0,
    abandoned: 0,
    rams: 0,
    shots: 0,
    /** Seconds saved in all by the breaches driven through, against driving around. */
    saved: 0,
    /**
     * Ways through weighed, by the class that weighed them and what blocked them: how many, and how
     * many were turned down as seen by enemies or saving too little, or taken.
     */
    weighed: new Map<string, { considered: number; exposed: number; short: number; chosen: number }>(),
    log: [] as BreachLog[]
  };

  return {
    stats,

    /** The breach under way, for the debug overlay: how and what stage it is at. */
    get plan() {
      return plan && { method: plan.method, phase: plan.phase, face: plan.face, material: plan.material };
    },

    /**
     * Decides whether to break through and carries a breach out, for one physics step.
     *
     * @returns What the bot should do this step instead of its own driving, or `undefined`.
     */
    step(now: number, tank: Tank, travel: BreachTravel): BreachOrder | undefined {
      const position = tank.hull.translation();

      if (plan && plan.phase !== 'through') {
        const elsewhere = !travel.allowed || !travel.destination || distance(travel.destination, plan.destination) > MOVED_ON;

        const threat = plan.forced ? underFire(now) : threatened(position, now);

        if (elsewhere || threat || now - plan.startedAt > plan.deadline) {
          finish('abandoned', now, elsewhere ? 'elsewhere' : threat ? 'threat' : 'late');
        }
      }

      if (!plan && travel.allowed && travel.destination && now >= nextThought) {
        nextThought = now + CONSIDER_INTERVAL;
        plan = consider(position, travel.destination, travel.cost, now, travel.route);
      }

      return plan && act(plan, tank, position, now);
    },

    /** Forgets the breach under way and the spots given up, for a new tank or match. */
    reset() {
      plan = undefined;
      nextThought = 0;
      refused.length = 0;
    }
  };

  /**
   * Weighs the way through a wall against the way around and plans a breach where it pays. A way
   * around hardly longer than a straight line leaves nothing to save, which spares the planning.
   */
  function consider(position: Point, destination: Point, cost: (cell: number) => number, now: number, route?: readonly Point[]): Plan | undefined {
    const straight = distance(position, destination);

    if (straight < MIN_TRIP || underFire(now)) {
      return undefined;
    }

    const known = route && route.length > 1 && distance(route[route.length - 1], destination) < ROUTE_MATCH ? remaining(route, position) : undefined;
    const around = known ?? pathLength(findPath(grid, position, destination, { cost }) ?? []);
    const detour = around > 0 ? around / pace() : Infinity;
    // Wrecks and walls may close every way there; then the bot breaks through even where enemies
    // may see it do so, for waiting gets it nowhere.
    const forced = !Number.isFinite(detour);

    if (!forced && enemyNear(position)) {
      return undefined;
    }

    if (detour - straight / pace() < Math.max(MIN_SAVING, detour * MIN_SHARE)) {
      return undefined;
    }

    const way = findBreachPath(grid, position, destination, { cost, through: priceOf });

    if (!way?.crossing) {
      return undefined;
    }

    stats.considered++;
    const crossing = describe(way.crossing);

    if (!crossing || refused.some((spot) => spot.until > now && distance(spot.at, crossing.face) < REFUSED_RADIUS)) {
      return undefined;
    }

    const key = `${member.tankClass.id} ${crossing.material} ${crossing.method}`;
    const tally = stats.weighed.get(key) ?? { considered: 0, exposed: 0, short: 0, chosen: 0 };
    stats.weighed.set(key, tally);
    tally.considered++;
    const spot = crossing.method === 'ram' ? crossing.runup : crossing.stand;

    if (!forced && (board.danger(cellAt(grid, spot)) > 0 || enemyNear(spot))) {
      tally.exposed++;
      return undefined;
    }

    const split = way.path.indexOf(way.crossing.exit);
    const setup = crossing.method === 'ram' ? 0 : SETUP;
    const toGap = (pathLength(way.path.slice(0, split)) + distance(way.path[split - 1] ?? position, spot)) / pace() + setup + crossing.seconds * (1 + STAND_RISK);
    const fromGap = (distance(crossing.face, way.crossing.exit) + pathLength(way.path.slice(split))) / pace();
    const saving = detour - toGap - fromGap;

    if (saving < Math.max(MIN_SAVING, detour * MIN_SHARE)) {
      tally.short++;
      return undefined;
    }

    stats.chosen++;
    tally.chosen++;

    return {
      ...crossing,
      destination: { x: destination.x, y: destination.y },
      entry: way.crossing.entry,
      exit: way.crossing.exit,
      phase: crossing.method === 'ram' ? 'runup' : 'approach',
      forced,
      startedAt: now,
      deadline: toGap * 2 + DEADLINE_SLACK,
      estimate: { detour, toGap, fromGap },
      rams: 0,
      shots: 0,
      aims: 0,
      seenShots: undefined,
      charge: undefined,
      openedAt: 0,
      checkedAt: -Infinity
    };
  }

  /**
   * How to break through a crossing: what blocks it, the direction square through the wall, the
   * wall's near face, the spots to ram from or shoot from, the method and the seconds it takes;
   * `undefined` when nothing breakable blocks it or the class cannot open it in a useful time.
   */
  function describe(crossing: { cells: number[]; entry: Point; exit: Point }) {
    const middle = { x: (crossing.entry.x + crossing.exit.x) / 2, y: (crossing.entry.y + crossing.exit.y) / 2 };
    const blocker =
      combat.breakableNear(middle, grid.clearance + 8) ??
      crossing.cells.map((cell) => combat.breakableNear(cellCenter(grid, cell), grid.clearance + 2)).find(Boolean);

    const opening = blocker && openingFor(blocker, member.tankClass);

    if (!blocker || !opening) {
      return undefined;
    }

    let dir = normalize({ x: crossing.exit.x - crossing.entry.x, y: crossing.exit.y - crossing.entry.y });

    if (blocker.material !== 'wreck') {
      // Square through the wall, across its thin side.
      const angle = blocker.wall.rotation ?? 0;
      const axis = blocker.wall.halfWidth < blocker.wall.halfHeight ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: -Math.sin(angle), y: Math.cos(angle) };
      const sign = axis.x * dir.x + axis.y * dir.y >= 0 ? 1 : -1;
      dir = { x: axis.x * sign, y: axis.y * sign };
    }

    const face = nearFace(middle, dir);

    if (!face) {
      return undefined;
    }

    const back = (gap: number) => ({ x: face.x - dir.x * gap, y: face.y - dir.y * gap });
    const stand = [STAND_GAP, STAND_GAP - 14, grid.clearance + 2].map(back).find((spot) => isOpenAt(grid, spot)) ?? crossing.entry;
    const runup = [RUNUP_GAP, RUNUP_GAP - 20, RUNUP_GAP - 40].map(back).find((spot) => isOpenAt(grid, spot)) ?? stand;
    return {
      material: blocker.material,
      method: opening.method,
      seconds: opening.seconds,
      dir,
      across: { x: -dir.y, y: dir.x },
      face,
      stand,
      runup,
      cells: crossing.cells,
      maxShots: Math.ceil(opening.shots * 2) + 4,
      maxRams: opening.rams + 2
    };
  }

  /**
   * The first point of breakable solid on the line through `middle` along `dir`, coming from
   * `FACE_SEARCH` px before it: the face of the wall the bot will meet.
   */
  function nearFace(middle: Point, dir: Point) {
    for (let step = -FACE_SEARCH; step <= FACE_SEARCH; step++) {
      const point = { x: middle.x + dir.x * step, y: middle.y + dir.y * step };

      // On the seam of two tiles the distance is 0 inside the wall.
      if (combat.obstacleDistance(point, 4) <= 0) {
        return point;
      }
    }

    return undefined;
  }

  /** Carries out a step of the breach under way. */
  function act(current: Plan, tank: Tank, position: Point, now: number): BreachOrder | undefined {
    if (current.phase !== 'through' && now - current.checkedAt > OPEN_CHECK) {
      current.checkedAt = now;

      if (isOpen(current)) {
        // A fence that gives way to a ram lets the tank on without a stop that would end the charge.
        if (current.phase === 'charge') {
          current.rams++;
          stats.rams++;
        }

        current.phase = 'through';
        current.openedAt = now;
        stats.opened++;
      }
    }

    switch (current.phase) {
      case 'through': {
        if (along(current, position) > PASSED) {
          finish('passed', now);
        } else if (now - current.openedAt > THROUGH_TIME) {
          finish('opened', now);
        }

        return undefined;
      }

      case 'approach': {
        if (distance(position, current.stand) > ARRIVED) {
          return { destination: current.stand, arrive: ARRIVED / 2 };
        }

        current.phase = 'shoot';
        return shoot(current, tank, position, now);
      }

      case 'shoot':
        return shoot(current, tank, position, now);

      case 'runup': {
        if (distance(position, current.runup) > ARRIVED) {
          return { destination: current.runup, arrive: ARRIVED / 2 };
        }

        current.phase = 'charge';
        current.charge = { startedAt: now, check: { at: now, position: { x: position.x, y: position.y } } };
        return { move: current.dir };
      }

      case 'charge':
        return charge(current, position, now);
    }
  }

  /**
   * Holds still and shoots the crossing, each shot at the next spot across it where material is
   * left, working the trigger as the class's weapon wants it: a shot charged in full, a grenade
   * thrown as far as the spot. The match fires after the bot's step, so a shot
   * is counted on the step after it went.
   */
  function shoot(current: Plan, tank: Tank, position: Point, now: number): BreachOrder {
    const weapon = member.weapon;
    const fired = weapon && current.seenShots !== undefined ? weapon.shots - current.seenShots : 0;
    current.seenShots = weapon?.shots;
    current.shots += fired;
    current.aims += fired;
    stats.shots += fired;

    if (current.shots >= current.maxShots) {
      finish('abandoned', now, 'spent');
      return { move: STOP };
    }

    const target = nextTarget(current);

    if (!target || !weapon) {
      return { move: STOP };
    }

    const aim = Math.atan2(target.y - position.y, target.x - position.x);
    const range = distance(position, target);
    const aligned = Math.abs(angleBetween(tank.turretAngle, aim)) < Math.max(Math.atan2(AIM_TOLERANCE, range), 0.01);
    context.trigger(member, triggerFor(weapon, aligned, range));
    return { move: STOP, aim };
  }

  /**
   * The next line across the crossing, at one of `AIM_OFFSETS` in turn, that still has breakable
   * material in it, and the first of that material along it: craters eat the near face first, so
   * later shots go deeper.
   */
  function nextTarget(current: Plan) {
    for (let tried = 0; tried < AIM_OFFSETS.length; tried++) {
      const offset = AIM_OFFSETS[(current.aims + tried) % AIM_OFFSETS.length];

      for (let depth = -AIM_DEPTH; depth <= AIM_REACH; depth += AIM_DEPTH) {
        const point = {
          x: current.face.x + current.dir.x * depth + current.across.x * offset,
          y: current.face.y + current.dir.y * depth + current.across.y * offset
        };

        if (combat.breakableNear(point, 1)) {
          current.aims += tried;
          return point;
        }
      }
    }

    return undefined;
  }

  /**
   * Drives full ahead into the wall; once the tank has stopped against it, backs off for another
   * ram. A wall that gives way at once lets the tank through in the same run.
   */
  function charge(current: Plan, position: Point, now: number): BreachOrder | undefined {
    const run = current.charge!;

    if (along(current, position) > PASSED) {
      current.rams++;
      stats.rams++;
      stats.opened++;
      finish('passed', now);
      return undefined;
    }

    if (now - run.check.at >= STALL_CHECK) {
      const stalled = distance(position, run.check.position) < STALL_DISTANCE;
      run.check = { at: now, position: { x: position.x, y: position.y } };

      if ((stalled && now - run.startedAt > CHARGE_MIN) || now - run.startedAt > CHARGE_MAX) {
        current.rams++;
        stats.rams++;

        if (current.rams >= current.maxRams) {
          finish('abandoned', now, 'spent');
          return undefined;
        }

        current.phase = 'runup';
        return { destination: current.runup, arrive: ARRIVED / 2 };
      }
    }

    return { move: current.dir };
  }

  /** Whether the crossing is open now: the grid has a short way through it. */
  function isOpen(current: Plan) {
    if (canDrive(grid, current.entry, current.exit)) {
      return true;
    }

    const way = findPath(grid, current.entry, current.exit);
    return way !== undefined && pathLength(way) < distance(current.entry, current.exit) * OPEN_DETOUR + grid.cell * 2;
  }

  /** Ends the breach under way, records how it went and, if it was given up, why, and keeps away from the spot for a while. */
  function finish(outcome: BreachLog['outcome'], now: number, reason?: BreachLog['reason']) {
    const current = plan!;
    const spent = now - current.startedAt;
    plan = undefined;

    if (outcome === 'abandoned') {
      stats.abandoned++;
      refused.push({ at: current.face, until: now + REFUSE_TIME });
    }

    if (outcome === 'passed') {
      stats.passed++;
      stats.saved += current.estimate.detour - spent - current.estimate.fromGap;
    }

    stats.log.push({
      at: now,
      tankClass: member.tankClass.id,
      material: current.material,
      method: current.method,
      outcome,
      reason,
      detour: round(current.estimate.detour),
      planned: round(current.estimate.toGap + current.estimate.fromGap),
      spent: round(spent),
      rams: current.rams,
      shots: current.shots
    });
  }

  /** Whether the bot is under fire or known enemies are near: no time to stand and break walls. */
  function threatened(position: Point, now: number) {
    return underFire(now) || enemyNear(position);
  }

  function underFire(now: number) {
    return now - member.shotAt < UNDER_FIRE;
  }

  function enemyNear(point: Point) {
    return board.known().some((sighting) => distance(sighting.position, point) < VETO_RANGE);
  }

  /**
   * Extra cost of driving into a closed cell for `findBreachPath`: the seconds the bot's class
   * needs to open a crossing of whatever blocks it, spread over the cells a crossing of it takes,
   * as a multiple of a step's length; `Infinity` for cells nothing breakable blocks. Shared by the
   * bots of a match that drive the same class, and worked out anew when the grid's cells open or close.
   */
  function priceOf(cell: number) {
    const prices = pricesFor(grid, member.tankClass.id);
    let price = prices[cell];

    if (Number.isNaN(price)) {
      const blocker: Blocker | undefined = combat.breakableNear(cellCenter(grid, cell), grid.clearance + 2);
      const thickness = !blocker ? 0 : blocker.material === 'wreck' ? WRECK_THICKNESS : blocker.thickness;
      const seconds = blocker ? (openingFor(blocker, member.tankClass)?.seconds ?? Infinity) : Infinity;
      price = (seconds * pace()) / (thickness + grid.clearance * 2);
      prices[cell] = price;
    }

    return price;
  }
}

/** A breacher as returned by `createBreacher`. */
export type Breacher = ReturnType<typeof createBreacher>;

/** How one breach went: which class broke what and how, when it ended and how, and the seconds planned against those spent. */
export type BreachLog = {
  at: number;
  tankClass: string;
  material: string;
  method: 'ram' | 'shoot';
  outcome: 'passed' | 'opened' | 'abandoned';
  /**
   * Why a breach was given up: the bot was going `elsewhere` now, a `threat` came, enemies near or
   * fire, it took too `late`, or it `spent` the shots or rams it had for it.
   */
  reason?: 'elsewhere' | 'threat' | 'late' | 'spent';
  /** Seconds of the way around, and of the way through as planned, both from where the bot decided. */
  detour: number;
  planned: number;
  /** Seconds from deciding until the breach ended. */
  spent: number;
  rams: number;
  shots: number;
};

/** A breach under way. */
type Plan = {
  material: string;
  method: 'ram' | 'shoot';
  /** Seconds the opening was planned to take. */
  seconds: number;
  /** Unit direction square through the wall, and across it. */
  dir: Point;
  across: Point;
  /** The wall's near face on the line of the crossing. */
  face: Point;
  /** Where the bot shoots from, and where it starts its runs at the wall from. */
  stand: Point;
  runup: Point;
  /** Grid cells of the crossing, and the open cells' centers before and after it. */
  cells: number[];
  entry: Point;
  exit: Point;
  /** Where the bot was going when it decided. */
  destination: Point;
  phase: 'approach' | 'shoot' | 'runup' | 'charge' | 'through';
  /** No way round was left, so only coming under fire stops the breach. */
  forced: boolean;
  startedAt: number;
  /** Seconds after which the breach is given up. */
  deadline: number;
  /** Seconds of the way around, of the way to the gap and through it, and from the gap on. */
  estimate: { detour: number; toGap: number; fromGap: number };
  rams: number;
  maxRams: number;
  shots: number;
  maxShots: number;
  /** Shots aimed so far, which picks the next spot across the crossing. */
  aims: number;
  /** The weapon's shot count at the last step of shooting, to count the shots it fired since. */
  seenShots: number | undefined;
  /** The run at the wall under way, and where the tank was at the last check for a stop. */
  charge: { startedAt: number; check: { at: number; position: Point } } | undefined;
  openedAt: number;
  checkedAt: number;
};

/**
 * How to work the trigger of `weapon` at a wall `range` px away, on target when `aligned`: a
 * charged shot is held until full and let go on target; anything else fires on target, a grenade
 * thrown that far.
 */
function triggerFor(weapon: Weapon, aligned: boolean, range: number): Trigger {
  const spec = weapon.tankClass.weapon;

  if (spec.kind === 'charge') {
    return { fire: !(aligned && (weapon.charge ?? 0) >= 1) };
  }

  return { fire: aligned, reach: range };
}

/** The cost of a step into each closed cell, per grid and class, worked out as needed and anew with each revision. */
const priceCache = new WeakMap<NavGrid, Map<string, { revision: number; prices: Float32Array }>>();

function pricesFor(grid: NavGrid, tankClass: string) {
  const byClass = priceCache.get(grid) ?? new Map<string, { revision: number; prices: Float32Array }>();
  let entry = byClass.get(tankClass);
  priceCache.set(grid, byClass);

  if (!entry || entry.revision !== grid.revision) {
    entry = { revision: grid.revision, prices: new Float32Array(grid.cols * grid.rows).fill(Number.NaN) };
    byClass.set(tankClass, entry);
  }

  return entry.prices;
}

/** Length of the rest of `route` from `position`: to the route's point nearest to it, then along the route. */
function remaining(route: readonly Point[], position: Point) {
  let nearest = 0;

  route.forEach((point, index) => {
    if (distance(point, position) < distance(route[nearest], position)) {
      nearest = index;
    }
  });

  return distance(position, route[nearest]) + pathLength(route.slice(nearest));
}

/** Pixels from the wall's near face along the crossing to the point that counts as through it. */
function along(current: Plan, position: Point) {
  return (position.x - current.face.x) * current.dir.x + (position.y - current.face.y) * current.dir.y;
}

const STOP = { x: 0, y: 0 };
/** Seconds between thoughts about breaking through, and the least distance to a destination worth one. */
const CONSIDER_INTERVAL = 1;
const MIN_TRIP = 250;
/** The driver's route counts as the way to the destination when it ends this close to it. */
const ROUTE_MATCH = 40;
/** A breach must save at least this many seconds, and this share of the drive around. */
const MIN_SAVING = 2;
const MIN_SHARE = 0.25;
/** Share of a tank's top speed it keeps along a way, as the bots' travel estimates take it. */
const PACE_SHARE = 0.85;
/** Seconds of getting into place to shoot, and the share of the breaking time added for the risk of standing still. */
const SETUP = 1;
const STAND_RISK = 0.25;
/** No breaking with known enemies this close, or within `UNDER_FIRE` s of being shot at. */
const VETO_RANGE = 420;
const UNDER_FIRE = 1.5;
/** A breach is given up once the bot's destination moved this far, and its spot is avoided for `REFUSE_TIME` s within `REFUSED_RADIUS` px. */
const MOVED_ON = 200;
const REFUSE_TIME = 20;
const REFUSED_RADIUS = 40;
/** A breach is given up after twice its planned time and this many seconds more. */
const DEADLINE_SLACK = 6;
/**
 * Spots: the bot shoots from `STAND_GAP` px before the face, its muzzle 20 px from it, and rams
 * from a run-up `RUNUP_GAP` px before it. Within `ARRIVED` px of a spot it is there.
 */
const STAND_GAP = 50;
const RUNUP_GAP = 100;
const ARRIVED = 14;
/** Pixels before and after the middle of a crossing searched for the wall's face. */
const FACE_SEARCH = 80;
/**
 * Shots go along lines at these offsets across the crossing in turn, at the first material found
 * stepping `AIM_DEPTH` px at a time from the face up to `AIM_REACH` px into the wall.
 */
const AIM_DEPTH = 2;
const AIM_REACH = 70;
const AIM_OFFSETS = [0, 12, -12, 22, -22, 30, -30];
const AIM_TOLERANCE = 3;
/** A charge counts as done once the tank moved less than `STALL_DISTANCE` px in `STALL_CHECK` s after `CHARGE_MIN` s, or after `CHARGE_MAX` s. */
const STALL_CHECK = 0.1;
const STALL_DISTANCE = 2;
const CHARGE_MIN = 0.3;
const CHARGE_MAX = 1.6;
/** Seconds between checks whether the way is open, and how much longer than straight a way through may be to count. */
const OPEN_CHECK = 0.2;
const OPEN_DETOUR = 1.6;
/** Once open, the bot has `THROUGH_TIME` s to get `PASSED` px past the face. */
const THROUGH_TIME = 8;
const PASSED = 25;
/** Thickness of a wreck across which a crossing's cost is spread, a medium tank's hull's width. */
const WRECK_THICKNESS = 25;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

/** Signed angle from `from` to `to`, in (-π, π]. */
function angleBetween(from: number, to: number) {
  let delta = (to - from) % (Math.PI * 2);

  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  } else if (delta <= -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
