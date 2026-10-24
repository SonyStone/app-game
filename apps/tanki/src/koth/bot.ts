import type { Tank } from '../arena/bodies';
import type { Combat } from '../damage/combat';
import { HULL_CORE } from '../damage/shapes';
import { planBot, type BotAction, type BotFact, type BotGoal, type Situation } from './brain';
import { createDriver, type Obstacle } from './driver';
import { inBase, onPoint, type KothMap } from './map';
import { cellAt, floodCosts, isOpenAt, searchNearest, cellCenter, type NavGrid } from './navigation';
import { captureRate, rivalOf, type CaptureRules, type CaptureState } from './rules';
import { DANGER_RANGE, type Member, type TeamBoard } from './team';

type Point = { x: number; y: number };

/** What a bot needs from the match around it. */
export type BotContext = {
  combat: Combat;
  grid: NavGrid;
  map: KothMap;
  /** The board of the bot's team. */
  board: TeamBoard;
  /** Members of the bot's team, its own seat included, and of the other team. */
  allies: readonly Member[];
  rivals: readonly Member[];
  /** The control point now. */
  capture: () => CaptureState;
  rules: CaptureRules;
  /** Match time in seconds. */
  clock: () => number;
  /** Source of randomness in [0, 1). */
  random: () => number;
  /** Fires the member's gun if it has reloaded; returns whether it fired. */
  fire: (member: Member) => boolean;
};

/**
 * A bot that drives one team member's tank. Every step it:
 *
 * 1. Perceives, ten times a second: which enemies it can see past walls and crates, shared with
 *    its team's board.
 * 2. Describes its situation as GOAP facts and estimates (see `./brain`) and plans when something
 *    important changed, such as a target coming into view, a hit, an open core or the point
 *    changing hands, when an action finished or failed, and otherwise every few seconds. A new
 *    plan that starts with the action under way keeps it going, so plans do not stutter.
 * 3. Carries out the current action: each action is a behavior that picks where to drive, which
 *    enemy to prefer and when it is done.
 * 4. Drives there with its driver and works the gun: the turret swings toward the preferred enemy,
 *    or the team's focus, at the core under its rear armor, leading it by its speed, and fires
 *    with some spread when on target and nothing is in the way.
 */
export function createBot(member: Member, context: BotContext) {
  const { combat, grid, map, board } = context;
  const driver = createDriver(grid);
  const visible = new Set<Tank>();
  let facts: Partial<Record<BotFact, boolean>> = {};
  let plan: { goal: BotGoal; steps: BotAction[]; index: number } | undefined;
  let task: Task | undefined;
  let nextPerceive = context.random() * PERCEIVE_INTERVAL;
  let nextReplan = 0;
  let lastPlan = -Infinity;
  let cover: Point | undefined;
  let gun: { target: Tank | undefined; since: number } = { target: undefined, since: 0 };
  const stats = {
    plans: 0,
    goalChanges: 0,
    actions: {} as Partial<Record<BotAction, { started: number; done: number; failed: number }>>
  };

  return {
    member,

    /** The driver, for its path and stall statistics. */
    driver,

    /** How often the bot planned and changed its goal, and how each action it started ended. */
    stats,

    /** What the bot is thinking, for the debug overlay. */
    thought() {
      return {
        goal: plan?.goal,
        action: task?.action,
        steps: plan?.steps ?? [],
        step: plan?.index ?? 0,
        path: driver.path,
        destination: task?.destination,
        target: task?.target ?? gun.target,
        covering: board.coverOf(member)
      };
    },

    /** Forgets the old tank's plan, for a respawned tank. */
    reset() {
      driver.reset();
      visible.clear();
      plan = undefined;
      task = undefined;
      facts = {};
      nextReplan = 0;
      gun = { target: undefined, since: 0 };
    },

    /** Thinks, drives and shoots for one physics step of `dt` seconds. */
    step(dt: number) {
      const tank = member.tank;

      if (!tank) {
        return;
      }

      const now = context.clock();

      // Enemies destroyed since the last look are gone, and so are their bodies.
      for (const enemy of visible) {
        if (!alive(enemy)) {
          visible.delete(enemy);
        }
      }

      if (now >= nextPerceive) {
        nextPerceive = now + PERCEIVE_INTERVAL;
        perceive(tank);
        const before = facts;
        facts = observe(tank);

        if ((worthReplanning(before, facts) && now - lastPlan > MIN_REPLAN) || now >= nextReplan) {
          replan(tank, now);
        }
      }

      if (!task) {
        replan(tank, now);
      }

      const status = task ? runTask(task, tank, now) : 'running';

      if (task && status !== 'running') {
        tally(task.action)[status]++;
        advancePlan(tank, now, status);
      }

      const position = tank.hull.translation();
      const move = driver.steer(now, position, task?.hold ? undefined : task?.destination, obstacles(tank), {
        arrive: task?.arrive,
        cost: costFor(task?.route ?? 'normal')
      });
      combat.drive(tank, move);
      aim(tank, dt, now, move);
    }
  };

  /** Which enemies the tank can see now: within range and not behind walls or crates. */
  function perceive(tank: Tank) {
    const position = tank.hull.translation();
    visible.clear();

    for (const rival of context.rivals) {
      const enemy = rival.tank;

      if (!enemy) {
        continue;
      }

      const at = enemy.hull.translation();

      if (distance(position, at) < VISION && combat.lineOfSight(position, at)) {
        visible.add(enemy);
        board.see(enemy);
      }
    }
  }

  /** The bot's facts about the world, from what it and its team know. */
  function observe(tank: Tank): Partial<Record<BotFact, boolean>> {
    const position = tank.hull.translation();
    const capture = context.capture();
    const target = chooseTarget(tank);
    const targetAt = target && whereIs(target);
    const help = board.helpFor(member);
    const coreOpen = combat.isCoreOpen(tank);
    const armor = combat.armorLeft(tank);
    const underFire = context.clock() - member.shotAt < UNDER_FIRE;
    const inCover = board
      .known()
      .every((sighting) => distance(sighting.position, position) > DANGER_RANGE || !combat.lineOfSight(sighting.position, position));

    return {
      onPoint: onPoint(map, position),
      pointOurs: capture.owner === member.team,
      enemyOnPoint: rivalsOnPoint() > 0,
      mustStage: board.phase === 'gather',
      staged: board.phase === 'go',
      hasTarget: target !== undefined,
      targetNearPoint: targetAt !== undefined && distance(targetAt, map.point) < NEAR_POINT,
      targetVisible: target !== undefined && visible.has(target),
      inFireZone: target !== undefined && visible.has(target) && distance(position, targetAt!) < FIRE_RANGE,
      behindTarget: target !== undefined && isBehind(position, target),
      targetCoreOpen: target !== undefined && combat.isCoreOpen(target),
      coreOpen,
      armorLow: armor < ARMOR_LOW,
      underFire,
      inCover,
      safe: inCover && !underFire,
      atBase: inBase(map.bases[member.team], position),
      repaired: !coreOpen && armor > REPAIRED,
      allyNeedsHelp: help !== undefined,
      attackerInRange: help !== undefined && visible.has(help.attacker) && distance(position, help.attacker.hull.translation()) < FIRE_RANGE,
      regroupCalled: board.intent === 'regroup'
    };
  }

  /**
   * The enemy to fight: the team's focus if the team knows where it is, else the nearest enemy
   * the bot sees, else the nearest one the team knows of.
   */
  function chooseTarget(tank: Tank) {
    const position = tank.hull.translation();
    const focus = board.focus;

    if (focus && board.sightingOf(focus) && distance(position, whereIs(focus)) < VISION) {
      return focus;
    }

    const nearest = (tanks: Tank[]) => tanks.sort((a, b) => distance(position, whereIs(a)) - distance(position, whereIs(b)))[0];

    return nearest([...visible]) ?? nearest(board.known().map((sighting) => sighting.tank).filter((enemy) => distance(position, whereIs(enemy)) < VISION));
  }

  /**
   * Where the bot believes `enemy` is: where it is when seen, else where the team last saw it.
   * Only call it for a live enemy.
   */
  function whereIs(enemy: Tank): Point {
    return visible.has(enemy) ? enemy.hull.translation() : (board.sightingOf(enemy)?.position ?? enemy.hull.translation());
  }

  function rivalsOnPoint() {
    return context.rivals.filter((rival) => rival.tank && onPoint(map, rival.tank.hull.translation())).length;
  }

  /** Plans afresh, keeping the action under way when the new plan starts with it. */
  function replan(tank: Tank, now: number) {
    lastPlan = now;
    nextReplan = now + REPLAN_INTERVAL + context.random() * REPLAN_JITTER;
    const situation = describe(tank);
    const choice = planBot(situation);

    if (!choice || choice.steps.length === 0) {
      plan = undefined;
      task = startTask(tank, idleAction());
      return;
    }

    const steps = choice.steps.map((step) => step.name);
    stats.plans++;

    if (choice.goal.name !== plan?.goal) {
      stats.goalChanges++;
    }

    if (task && plan && steps[0] === task.action && choice.goal.name === plan.goal) {
      plan = { goal: choice.goal.name, steps, index: 0 };
      return;
    }

    plan = { goal: choice.goal.name, steps, index: 0 };
    task = startTask(tank, steps[0]);
  }

  function advancePlan(tank: Tank, now: number, status: 'done' | 'failed') {
    if (status === 'done' && plan && plan.index + 1 < plan.steps.length) {
      plan.index++;
      task = startTask(tank, plan.steps[plan.index]);
      return;
    }

    task = undefined;
    facts = observe(tank);
    replan(tank, now);
  }

  function tally(action: BotAction) {
    return (stats.actions[action] ??= { started: 0, done: 0, failed: 0 });
  }

  /** What the bot does without a plan: guard the point if it is ours, else head for it. */
  function idleAction(): BotAction {
    return facts.pointOurs ? 'guardPoint' : 'goToPoint';
  }

  /** The bot's situation for the planner: its facts plus travel, kill and capture estimates. */
  function describe(tank: Tank): Situation {
    const position = tank.hull.translation();
    const costs = floodCosts(grid, position, { cost: (cell) => board.crateCost(cell) });
    const travel = (point: Point | undefined) => (point ? costs[cellAt(grid, point)] / SPEED : Infinity);
    const target = chooseTarget(tank);
    const help = board.helpFor(member);
    const capture = context.capture();
    const rival = rivalOf(member.team);
    const alliesOn = context.allies.filter((ally) => ally !== member && ally.tank && onPoint(map, ally.tank.hull.translation())).length;
    const progress = capture.capturer === member.team ? capture.progress : 0;
    const targetAt = target && whereIs(target);
    cover = findCover(position);

    return {
      role: member.role,
      facts,
      travel: {
        point: travel(board.pointSpot(member)),
        stage: travel(board.stagingSpot(member)),
        approach: targetAt ? travel(targetAt) * Math.max(1 - (FIRE_RANGE * 0.8) / Math.max(distance(position, targetAt), 1), 0) : Infinity,
        flank: target ? travel(flankSpot(target, sideToward(target, position))) : Infinity,
        support: help ? travel(supportSpot(help.ally)) : Infinity,
        cover: cover ? travel(cover) : Infinity,
        base: travel(board.baseSpot(member)),
        rally: travel(board.rally())
      },
      kill: { front: killTime(position, target, false), rear: killTime(position, target, true) },
      capture: ((1 - progress) * context.rules.captureTime) / captureRate(alliesOn + 1),
      enemyClock: (capture.held[rival] / context.rules.holdTime) * (capture.owner === rival ? 1 : 0.6),
      targetClearsPoint: target !== undefined && onPoint(map, whereIs(target)) && rivalsOnPoint() <= 1,
      current: plan?.goal
    };
  }

  /** Seconds the bot expects to need to destroy `target`, from where it is or from behind. */
  function killTime(position: Point, target: Tank | undefined, fromRear: boolean) {
    if (!target) {
      return Infinity;
    }

    const at = whereIs(target);
    const range = distance(position, at);
    const accuracy = Math.min(Math.max(1.1 - range / 700, 0.25), 0.95);
    const heading = target.hull.rotation();
    const facing = range > 1 ? ((position.x - at.x) * Math.cos(heading) + (position.y - at.y) * Math.sin(heading)) / range : 0;
    let hits = fromRear ? 2 : facing > 0.5 ? 9 : facing > -0.4 ? 4 : 2;
    let exposure = fromRear ? 0.3 : facing > 0.3 ? 1.5 : 0.5;

    if (combat.isCoreOpen(target)) {
      hits = 1;
      exposure = 0;
    }

    return (hits * RELOAD) / accuracy + exposure;
  }

  /** The nearest spot out of every known enemy's sight, close to something to hide behind. */
  function findCover(position: Point) {
    if (board.known().length === 0) {
      return undefined;
    }

    const cell = searchNearest(
      grid,
      position,
      COVER_SEARCH,
      (candidate) => board.sightField[candidate] < COVER_HUG && board.isHidden(candidate),
      { cost: (candidate) => board.crateCost(candidate) + board.danger(candidate) }
    );

    return cell === undefined ? undefined : cellCenter(grid, cell);
  }

  /** Starts the behavior of `action`. */
  function startTask(tank: Tank, action: BotAction): Task {
    const position = tank.hull.translation();
    const target = chooseTarget(tank);
    const task: Task = { action, startedAt: context.clock(), route: 'normal', lostAt: undefined };
    tally(action).started++;

    if (action === 'flank' || action === 'attackRear' || action === 'attackFront' || action === 'approach') {
      task.target = target;
      task.side = target ? sideToward(target, position) : 1;
    }

    if (action === 'takeCover') {
      task.destination = cover ?? findCover(position);
    }

    if (action === 'moveToSupport' || action === 'suppress') {
      const help = board.helpFor(member);
      task.ally = help?.ally;
      task.target = help?.attacker;
    }

    return task;
  }

  /** Runs one step of the current behavior; it sets where to drive and which enemy to prefer. */
  function runTask(task: Task, tank: Tank, now: number): 'running' | 'done' | 'failed' {
    const position = tank.hull.translation();
    task.hold = false;
    task.arrive = undefined;

    switch (task.action) {
      case 'goToPoint': {
        task.destination = escortSpot(position) ?? board.pointSpot(member);
        task.route = 'normal';
        return distance(position, map.point) < map.point.radius - 20 ? 'done' : 'running';
      }

      case 'stage': {
        task.destination = board.stagingSpot(member);
        task.route = 'safe';
        task.arrive = 30;
        board.stage(member, distance(position, task.destination) < STAGED_RADIUS);

        if (board.phase === 'go') {
          return 'done';
        }

        return board.phase === 'none' ? 'failed' : 'running';
      }

      case 'capture': {
        task.destination = wander(task, board.pointSpot(member), now);
        task.arrive = 20;

        if (context.capture().owner === member.team) {
          return 'done';
        }

        return rivalsOnPoint() > 0 ? 'failed' : 'running';
      }

      case 'guardPoint': {
        task.destination = wander(task, board.pointSpot(member), now);
        task.arrive = 20;
        return context.capture().owner === member.team ? 'running' : 'failed';
      }

      case 'approach': {
        if (!task.target || !alive(task.target)) {
          return 'failed';
        }

        task.destination = whereIs(task.target);
        task.arrive = 60;
        return visible.has(task.target) && distance(position, task.target.hull.translation()) < FIRE_RANGE * 0.85 ? 'done' : 'running';
      }

      case 'attackFront': {
        if (!task.target || !alive(task.target)) {
          return 'done';
        }

        if (lost(task, task.target, now, LOSE_SIGHT)) {
          return 'failed';
        }

        task.destination = circleAround(task, position, task.target, now);
        task.arrive = 25;
        return 'running';
      }

      case 'flank': {
        if (!task.target || !alive(task.target) || now - task.startedAt > FLANK_TIMEOUT) {
          return 'failed';
        }

        task.destination = flankSpot(task.target, task.side ?? 1);
        task.route = 'sneaky';
        task.arrive = 30;
        const there = isBehind(position, task.target) && visible.has(task.target) && distance(position, task.target.hull.translation()) < FIRE_RANGE;
        return there ? 'done' : 'running';
      }

      case 'attackRear': {
        if (!task.target || !alive(task.target)) {
          return 'done';
        }

        if (isBehind(position, task.target)) {
          task.lostAt = undefined;
        } else {
          task.lostAt ??= now;
        }

        if (task.lostAt !== undefined && now - task.lostAt > LOSE_REAR) {
          return 'failed';
        }

        task.destination = flankSpot(task.target, task.side ?? 1);
        task.route = 'sneaky';
        task.arrive = 35;
        return 'running';
      }

      case 'moveToSupport': {
        const help = board.helpFor(member);

        if (!help) {
          return 'failed';
        }

        task.ally = help.ally;
        task.target = help.attacker;
        task.destination = supportSpot(help.ally);
        task.arrive = 40;
        return visible.has(help.attacker) && distance(position, help.attacker.hull.translation()) < FIRE_RANGE ? 'done' : 'running';
      }

      case 'suppress': {
        const help = board.helpFor(member);

        if (!help) {
          return 'done';
        }

        task.target = help.attacker;

        if (lost(task, help.attacker, now, LOSE_SIGHT)) {
          return 'failed';
        }

        task.hold = visible.has(help.attacker);
        task.destination = supportSpot(help.ally);
        return 'running';
      }

      case 'takeCover': {
        if (!task.destination) {
          return 'failed';
        }

        task.route = 'safe';
        task.arrive = 20;

        if (distance(position, task.destination) > 30) {
          task.arrivedAt = undefined;
          return 'running';
        }

        // In cover the bot waits for the fire to stop; if the enemy still sees it there, it needs other cover.
        task.hold = true;
        task.arrivedAt ??= now;

        if (!facts.inCover && now - task.arrivedAt > SETTLE_IN_COVER) {
          return 'failed';
        }

        return facts.safe || now - task.startedAt > HIDE_TIME ? 'done' : 'running';
      }

      case 'retreat': {
        task.destination = board.baseSpot(member);
        task.route = 'safe';
        return inBase(map.bases[member.team], position) ? 'done' : 'running';
      }

      case 'repair': {
        task.destination = board.baseSpot(member);
        task.arrive = 40;
        return !combat.isCoreOpen(tank) && combat.armorLeft(tank) > REPAIRED ? 'done' : 'running';
      }

      case 'regroup': {
        const rally = board.rally();
        task.destination = { x: rally.x, y: rally.y + (member.index - 1.5) * 45 };
        task.route = 'safe';
        task.arrive = 30;
        const gathered = context.allies.filter((ally) => ally.tank && distance(ally.tank.hull.translation(), rally) < 180).length;
        const waited = now - task.startedAt > REGROUP_TIME;
        return board.intent !== 'regroup' || waited || gathered >= 3 ? 'done' : 'running';
      }
    }
  }

  /**
   * A spot near `center` that changes every few seconds, so a bot holding the point shifts about
   * instead of parking.
   */
  function wander(task: Task, center: Point, now: number) {
    if (!task.wander || now >= task.wander.until) {
      const angle = context.random() * Math.PI * 2;
      const radius = context.random() * WANDER;
      const spot = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
      task.wander = { spot: isOpenAt(grid, spot) ? spot : center, until: now + 2.5 + context.random() * 2 };
    }

    return task.wander.spot;
  }

  /**
   * Where to stand while fighting `target` head on: at a fair range, circling toward its rear a
   * little at a time, so a duel drifts toward the weak armor.
   */
  function circleAround(task: Task, position: Point, target: Tank, now: number) {
    if (task.orbit && now < task.orbit.until) {
      return task.orbit.spot;
    }

    const at = target.hull.translation();
    const offset = { x: position.x - at.x, y: position.y - at.y };
    const range = Math.min(Math.max(Math.hypot(offset.x, offset.y), DUEL_MIN), DUEL_MAX);
    const angle = Math.atan2(offset.y, offset.x) + (task.side ?? 1) * ORBIT_STEP;
    let spot = { x: at.x + Math.cos(angle) * range, y: at.y + Math.sin(angle) * range };

    if (!isOpenAt(grid, spot) || !board.canSee(spot, at)) {
      spot = position;
      task.side = -(task.side ?? 1);
    }

    task.orbit = { spot, until: now + ORBIT_INTERVAL };
    return spot;
  }

  /** A spot in `target`'s rear arc, on the given side of its tail, out where the bot can shoot. */
  function flankSpot(target: Tank, side: number) {
    const at = whereIs(target);
    const heading = target.hull.rotation();

    for (const [angle, radius] of FLANK_OFFSETS) {
      const direction = heading + Math.PI + side * angle;
      const spot = { x: at.x + Math.cos(direction) * radius, y: at.y + Math.sin(direction) * radius };

      if (isOpenAt(grid, spot) && board.canSee(spot, at)) {
        return spot;
      }
    }

    return at;
  }

  /** Which side of `target`'s tail is nearer: 1 to the left of its heading, -1 to the right. */
  function sideToward(target: Tank, position: Point) {
    const at = whereIs(target);
    const heading = target.hull.rotation();
    const cross = Math.cos(heading) * (position.y - at.y) - Math.sin(heading) * (position.x - at.x);
    return cross >= 0 ? 1 : -1;
  }

  /** Beside an ally in trouble, a little toward the team's own base. */
  /**
   * While a support heads for the point behind the ally it covers, it keeps a little behind and
   * beside that ally instead of overtaking it; `undefined` when there is no ally to trail.
   */
  function escortSpot(position: Point) {
    const ally = member.role === 'support' ? board.coverOf(member) : undefined;
    const at = ally?.tank?.hull.translation();

    if (!ally || !at || onPoint(map, at) || distance(position, map.point) - distance(at, map.point) < ESCORT_LEAD) {
      return undefined;
    }

    return supportSpot(ally);
  }

  function supportSpot(ally: Member) {
    const at = ally.tank?.hull.translation() ?? board.rally();
    const base = map.bases[member.team].zone;
    const back = normalize({ x: base.x - at.x, y: base.y - at.y });
    const spot = { x: at.x + back.x * SUPPORT_OFFSET, y: at.y + back.y * SUPPORT_OFFSET + (member.index % 2 === 0 ? 40 : -40) };
    return isOpenAt(grid, spot) ? spot : at;
  }

  function isBehind(position: Point, target: Tank) {
    const at = whereIs(target);
    const range = distance(position, at);
    const heading = target.hull.rotation();
    return range > 1 && ((position.x - at.x) * Math.cos(heading) + (position.y - at.y) * Math.sin(heading)) / range < -REAR_ARC;
  }

  /** Whether `target` has been out of sight for longer than `patience` seconds. */
  function lost(task: Task, target: Tank, now: number, patience: number) {
    if (visible.has(target)) {
      task.lostAt = undefined;
      return false;
    }

    task.lostAt ??= now;
    return now - task.lostAt > patience;
  }

  function alive(tank: Tank) {
    return combat.armorOf(tank) !== undefined;
  }

  /** Other tanks and crates near this tank, as circles; a crate is three circles along its length. */
  function obstacles(tank: Tank): Obstacle[] {
    const position = tank.hull.translation();
    const near: Obstacle[] = [];

    for (const other of combat.tanks) {
      if (other !== tank) {
        const at = other.hull.translation();

        if (distance(position, at) < NEARBY) {
          near.push({ x: at.x, y: at.y, radius: 20 });
        }
      }
    }

    for (const crate of combat.crates) {
      if (distance(position, crate) < NEARBY + 50) {
        for (const along of [-30, 0, 30]) {
          near.push({ x: crate.x - Math.sin(crate.rotation) * along, y: crate.y + Math.cos(crate.rotation) * along, radius: 22 });
        }
      }
    }

    return near;
  }

  function costFor(route: Route) {
    const weight = route === 'sneaky' ? 4 : route === 'safe' ? 2.5 : 0.4;
    return (cell: number) => board.crateCost(cell) + board.danger(cell) * weight;
  }

  /**
   * Swings the turret toward the enemy most worth shooting, leading it by its speed, and fires
   * when on target with a clear line. Without a target the turret watches the latest known threat
   * or looks where the tank drives.
   */
  function aim(tank: Tank, dt: number, now: number, move: Point) {
    const position = tank.hull.translation();
    const preferred = task?.target && visible.has(task.target) ? task.target : undefined;
    const focus = board.focus && visible.has(board.focus) ? board.focus : undefined;
    const target = preferred ?? focus ?? nearestVisible(position);

    if (target !== gun.target) {
      gun = { target, since: now };
    }

    let goal: number;

    if (target) {
      const core = coreOf(target);
      const velocity = target.hull.linvel();
      const lead = { x: core.x + velocity.x * LEAD_TIME, y: core.y + velocity.y * LEAD_TIME };
      goal = Math.atan2(lead.y - position.y, lead.x - position.x);
      const range = distance(position, lead);
      turnTurret(tank, goal, dt);
      const error = Math.abs(angleBetween(tank.turretAngle, goal));
      const tolerance = Math.max(Math.atan2(task?.action === 'suppress' ? 14 : 8, range), 0.03);

      if (range < FIRE_RANGE && error < tolerance && tank.reload === 0 && combat.lineOfSight(position, lead)) {
        const speed = Math.hypot(tank.hull.linvel().x, tank.hull.linvel().y);
        const settle = Math.exp(-(now - gun.since) / SETTLE_TIME);
        const spread = BASE_SPREAD + MOVING_SPREAD * Math.min(speed / 150, 1) + SETTLE_SPREAD * settle;
        const steady = tank.turretAngle;
        tank.turretAngle += gaussian(context.random) * spread;
        context.fire(member);
        tank.turretAngle = steady;
      }

      return;
    }

    const threat = board.known().sort((a, b) => distance(position, a.position) - distance(position, b.position))[0];

    if (threat) {
      goal = Math.atan2(threat.position.y - position.y, threat.position.x - position.x);
    } else if (Math.hypot(move.x, move.y) > 0.2) {
      goal = Math.atan2(move.y, move.x);
    } else {
      goal = Math.atan2(map.point.y - position.y, map.point.x - position.x);
    }

    turnTurret(tank, goal, dt * IDLE_TURN);
  }

  function nearestVisible(position: Point) {
    return [...visible].sort((a, b) => distance(position, a.hull.translation()) - distance(position, b.hull.translation()))[0];
  }
}

/** A bot as returned by `createBot`. */
export type Bot = ReturnType<typeof createBot>;

/** How a route weighs the danger of being seen by known enemies. */
type Route = 'normal' | 'sneaky' | 'safe';

/** The running behavior of a plan action and its memory. */
type Task = {
  action: BotAction;
  startedAt: number;
  /** Where to drive; `hold` keeps the tank in place this step. */
  destination?: Point;
  hold?: boolean;
  arrive?: number;
  route: Route;
  /** The enemy the behavior is about, which the gun prefers. */
  target?: Tank;
  ally?: Member;
  /** Side of the target's tail to work around, 1 or -1. */
  side?: number;
  /** When the target was last seen or last had the bot behind it, for giving up. */
  lostAt: number | undefined;
  /** When the bot reached its cover. */
  arrivedAt?: number;
  orbit?: { spot: Point; until: number };
  wander?: { spot: Point; until: number };
};

const PERCEIVE_INTERVAL = 0.1;
/** Plans no more often than this after a change, and at least this often with jitter. */
const MIN_REPLAN = 0.3;
const REPLAN_INTERVAL = 2.5;
const REPLAN_JITTER = 1;
/** How far a bot sees, and how far it shoots. */
const VISION = 800;
const FIRE_RANGE = 560;
/** Enemies this close to the point are a threat to it. */
const NEAR_POINT = 320;
/** Seconds after a hit or near miss that the bot still feels under fire. */
const UNDER_FIRE = 1.5;
/** Armor shares below which a bot counts as badly damaged, and above which as mended. */
const ARMOR_LOW = 0.72;
const REPAIRED = 0.96;
/** Hull speed at full drive in pixels per second, for travel estimates. */
const SPEED = 150;
/** Seconds between shots, as for the player. */
const RELOAD = 0.1;
/** How far the cover search looks, in path pixels, and how close to a wall or crate cover must be. */
const COVER_SEARCH = 700;
const COVER_HUG = 55;
const STAGED_RADIUS = 60;
const WANDER = 30;
const LOSE_SIGHT = 2.5;
/** Longest wait in cover for the fire to stop, and how long the bot looks around before it trusts its cover. */
const HIDE_TIME = 5;
const SETTLE_IN_COVER = 0.4;
const LOSE_REAR = 2.5;
const FLANK_TIMEOUT = 12;
const REGROUP_TIME = 8;
/** Range kept in a head-on duel, and how far around the target the bot shifts every `ORBIT_INTERVAL` s. */
const DUEL_MIN = 220;
const DUEL_MAX = 420;
const ORBIT_STEP = 0.35;
const ORBIT_INTERVAL = 0.8;
/** Angles off the target's tail and distances tried for a flanking spot. */
const FLANK_OFFSETS: [angle: number, radius: number][] = [
  [0.55, 190],
  [0.3, 170],
  [0.9, 200],
  [0.55, 120],
  [1.2, 160]
];
/** Cosine of the half-angle of a tank's rear arc: behind is more than about 115 degrees off its nose. */
const REAR_ARC = 0.42;
const SUPPORT_OFFSET = 110;
/** A support trails only an ally at least this many pixels nearer the point, so it never waits for one lagging behind. */
const ESCORT_LEAD = 40;
const NEARBY = 120;
/** Turret speed in radians per second, and the share of it used while just looking around. */
const TURRET_SPEED = 5;
const IDLE_TURN = 0.6;
/** Seconds of the target's motion the aim leads by, covering the bot's reaction time. */
const LEAD_TIME = 0.12;
/** Standard deviation of the aim in radians: always, at full speed, and just after picking a target. */
const BASE_SPREAD = 0.012;
const MOVING_SPREAD = 0.025;
const SETTLE_SPREAD = 0.06;
const SETTLE_TIME = 0.5;

/**
 * Whether the bot's facts changed enough to plan again: the fight for the point or the team's
 * plan changed, or something new happened, such as an enemy coming into view or a hit. Things
 * calming down, such as a target slipping out of view, are left to the running action.
 */
function worthReplanning(before: Partial<Record<BotFact, boolean>>, after: Partial<Record<BotFact, boolean>>) {
  return (
    EITHER_WAY.some((name) => (before[name] ?? false) !== (after[name] ?? false)) ||
    WHEN_RAISED.some((name) => !before[name] && after[name])
  );
}

/** Facts whose every change makes a bot plan again. */
const EITHER_WAY: BotFact[] = ['pointOurs', 'enemyOnPoint', 'mustStage', 'staged', 'regroupCalled'];
/** Facts that make a bot plan again when they become true. */
const WHEN_RAISED: BotFact[] = ['hasTarget', 'targetVisible', 'coreOpen', 'armorLow', 'underFire', 'allyNeedsHelp'];

/** World position of a tank's core, under the rear armor. */
function coreOf(tank: Tank) {
  const center = tank.hull.translation();
  const angle = tank.hull.rotation();
  return {
    x: center.x + HULL_CORE.x * Math.cos(angle) - HULL_CORE.y * Math.sin(angle),
    y: center.y + HULL_CORE.x * Math.sin(angle) + HULL_CORE.y * Math.cos(angle)
  };
}

/** Turns the turret toward `goal` by at most `TURRET_SPEED * dt`. */
function turnTurret(tank: Tank, goal: number, dt: number) {
  const delta = angleBetween(tank.turretAngle, goal);
  const step = TURRET_SPEED * dt;
  tank.turretAngle += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
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

/** A standard normal sample by the Box-Muller transform. */
function gaussian(random: () => number) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(Math.PI * 2 * random());
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}
