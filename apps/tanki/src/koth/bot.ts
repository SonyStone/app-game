import type { Tank } from '../arena/bodies';
import type { Combat } from '../damage/combat';
import { HULL_CORE } from '../damage/shapes';
import { createBreacher } from './breach';
import { planBot, type BotAction, type BotFact, type BotGoal, type Situation } from './brain';
import { createDriver, type Obstacle } from './driver';
import type { Kit } from './kits';
import { inBase, onPoint, type KothMap } from './map';
import { cellAt, floodCosts, isOpenAt, searchNearest, cellCenter, type NavGrid } from './navigation';
import { captureRate, rivalOf, type CaptureRules, type CaptureState } from './rules';
import { MEDIUM_TANK } from './tanks';
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
  /** The repair kits on the map, live. */
  kits: readonly Readonly<Kit>[];
};

/**
 * A bot that drives one team member's tank. Every step it:
 *
 * 1. Perceives, ten times a second: which enemies it can see past walls and crates, shared with
 *    its team's board.
 * 2. Describes its situation as GOAP facts and estimates (see `./brain`) and plans when something
 *    important changed, such as a target coming into view, a hit, an open core or the point
 *    changing hands, when an action finished or failed, and otherwise every few seconds. A change
 *    soon after a plan waits a moment before it is planned for, so plans do not churn. A new plan
 *    that starts with the action under way keeps it going, so plans do not stutter.
 * 3. Carries out the current action: each action is a behavior that picks where to drive, which
 *    enemy to prefer and when it is done.
 * 4. Drives there with its driver, unless it sidesteps a shell flying at it, and works the gun:
 *    the turret swings toward the preferred enemy, or the team's focus, at where the shell would
 *    meet the core under its rear armor, and fires when on target, nothing is in the way and the
 *    shot is likely to hit. On its way somewhere, it breaks through a wall when that beats
 *    driving around (see `./breach`), and the breach takes over its driving and gun meanwhile.
 *
 * A bot knows only what a player would: it sees as far as a player's screen reaches and not
 * through walls, takes a moment to react to a new target, and misjudges a moving target's lead.
 */
export function createBot(member: Member, context: BotContext) {
  const { combat, grid, map, board } = context;
  const driver = createDriver(grid);
  const breacher = createBreacher(member, context);
  const visible = new Set<Tank>();
  let facts: Partial<Record<BotFact, boolean>> = {};
  let plan: { goal: BotGoal; steps: BotAction[]; index: number } | undefined;
  let task: Task | undefined;
  let nextPerceive = context.random() * PERCEIVE_INTERVAL;
  let nextReplan = 0;
  let lastPlan = -Infinity;
  // Something worth planning for happened too soon after the last plan; plan once allowed.
  let replanDue = false;
  let cover: Point | undefined;
  let kit: Readonly<Kit> | undefined;
  let gun: Aim = { target: undefined, since: 0, reaction: 0, offset: undefined };
  let dodge: { until: number; direction: Point } | undefined;
  const judged = new Set<number>();
  const stats = {
    plans: 0,
    goalChanges: 0,
    actions: {} as Partial<Record<BotAction, { started: number; done: number; failed: number }>>
  };

  return {
    member,

    /** The driver, for its path and stall statistics. */
    driver,

    /** The bot's sense for breaking through walls, for its breach under way and its statistics. */
    breach: breacher,

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
        covering: board.coverOf(member),
        breach: breacher.plan
      };
    },

    /**
     * Forgets the old tank's plan and every timer, for a respawned tank or a new match. A restart
     * turns the match clock back to 0, so no timer may keep a time from the match before.
     */
    reset() {
      driver.reset();
      breacher.reset();
      visible.clear();
      plan = undefined;
      task = undefined;
      facts = {};
      nextPerceive = 0;
      nextReplan = 0;
      lastPlan = -Infinity;
      replanDue = false;
      cover = undefined;
      kit = undefined;
      gun = { target: undefined, since: 0, reaction: 0, offset: undefined };
      dodge = undefined;
      judged.clear();
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
        replanDue ||= worthReplanning(before, facts);

        if ((replanDue && now - lastPlan > MIN_REPLAN) || now >= nextReplan) {
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
      const travel = task?.hold ? undefined : task?.destination;
      const cost = costFor(task?.route ?? 'normal');
      const breach = breacher.step(now, tank, { destination: travel, allowed: task !== undefined && BREACH_ACTIONS.has(task.action), cost, route: driver.path });
      const planned =
        breach?.move ??
        driver.steer(now, position, breach ? breach.destination : travel, obstacles(tank), {
          arrive: breach ? breach.arrive : task?.arrive,
          cost,
          heading: tank.hull.rotation()
        });
      const move = (breach ? undefined : sidestep(position, now)) ?? planned;
      combat.drive(tank, move);

      if (breach?.aim !== undefined) {
        turnTurret(tank, breach.aim, dt);
      } else {
        aim(tank, dt, now, move);
      }
    }
  };

  /**
   * The drive direction of a sidestep away from an enemy shell about to hit the tank, or
   * `undefined` when there is none. The bot judges each shell once: if it would pass close and
   * arrives late enough to react to, the bot dodges it at `DODGE_CHANCE`, sideways off its line.
   */
  function sidestep(position: Point, now: number) {
    if (dodge && now < dodge.until) {
      return dodge.direction;
    }

    dodge = undefined;
    const shells = combat.shells.filter((shell) => shell.team !== member.team);

    for (const shell of shells) {
      if (judged.has(shell.id)) {
        continue;
      }

      const offset = { x: position.x - shell.x, y: position.y - shell.y };
      const ahead = offset.x * shell.direction.x + offset.y * shell.direction.y;
      const across = offset.x * shell.direction.y - offset.y * shell.direction.x;
      const arrival = ahead / shell.speed;

      if (ahead <= 0 || Math.abs(across) > DODGE_MISS || arrival > DODGE_LOOKAHEAD) {
        continue;
      }

      judged.add(shell.id);

      if (arrival < DODGE_REACTION || context.random() >= DODGE_CHANCE) {
        continue;
      }

      // Off the shell's line on the side the tank already is, or the other way if that is blocked;
      // pressed against walls on both sides, the tank cannot dodge and keeps to its way.
      const side = across === 0 ? (context.random() < 0.5 ? 1 : -1) : Math.sign(across);
      const away = { x: shell.direction.y * side, y: -shell.direction.x * side };
      const direction = [away, { x: -away.x, y: -away.y }].find((option) =>
        isOpenAt(grid, { x: position.x + option.x * DODGE_CHECK, y: position.y + option.y * DODGE_CHECK })
      );

      if (direction) {
        dodge = { until: now + DODGE_TIME, direction };
        break;
      }
    }

    if (judged.size > 64) {
      const flying = new Set(shells.map((shell) => shell.id));
      [...judged].filter((id) => !flying.has(id)).forEach((id) => judged.delete(id));
    }

    return dodge?.direction;
  }

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
    replanDue = false;
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
    const travel = (point: Point | undefined) => (point ? costs[cellAt(grid, point)] / (MEDIUM_TANK.speed * TRAVEL_SHARE) : Infinity);
    const target = chooseTarget(tank);
    const help = board.helpFor(member);
    const capture = context.capture();
    const rival = rivalOf(member.team);
    const alliesOn = context.allies.filter((ally) => ally !== member && ally.tank && onPoint(map, ally.tank.hull.translation())).length;
    const progress = capture.capturer === member.team ? capture.progress : 0;
    const targetAt = target && whereIs(target);
    cover = findCover(position);
    const choice = chooseKit(costs);
    kit = choice?.kit;

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
        rally: travel(board.rally()),
        kit: choice?.travel ?? Infinity
      },
      kill: { front: killTime(position, target, false), rear: killTime(position, target, true) },
      capture: ((1 - progress) * context.rules.captureTime) / captureRate(alliesOn + 1),
      enemyClock: (capture.held[rival] / context.rules.holdTime) * (capture.owner === rival ? 1 : 0.6),
      targetClearsPoint: target !== undefined && onPoint(map, whereIs(target)) && rivalsOnPoint() <= 1,
      current: plan?.goal
    };
  }

  /**
   * Seconds the bot expects to need to destroy `target`, from where it is or from behind: the
   * shots it takes at the accuracy the range allows, fired one interval apart, with a reload after
   * every clip, and some time exposed to the target's gun.
   */
  function killTime(position: Point, target: Tank | undefined, fromRear: boolean) {
    if (!target) {
      return Infinity;
    }

    const at = whereIs(target);
    const range = distance(position, at);
    const accuracy = Math.min(Math.max(1.1 - range / 550, 0.2), 0.9);
    const heading = target.hull.rotation();
    const facing = range > 1 ? ((position.x - at.x) * Math.cos(heading) + (position.y - at.y) * Math.sin(heading)) / range : 0;
    let hits = fromRear ? HITS_TO_KILL.rear : facing > 0.5 ? HITS_TO_KILL.front : facing > -0.4 ? HITS_TO_KILL.side : HITS_TO_KILL.rear;
    let exposure = fromRear ? 0.5 : facing > 0.3 ? 2.5 : 1;

    if (combat.isCoreOpen(target)) {
      hits = 1;
      exposure = 0;
    }

    const { interval, clip, firstReload, reload } = MEDIUM_TANK.gun;
    const shots = hits / accuracy;
    const reloads = Math.max(Math.ceil(shots / clip) - 1, 0);
    return shots * interval + reloads * (firstReload + (clip - 1) * reload) + exposure;
  }

  /**
   * The repair kit most worth driving to, with the seconds that take: of the kits that lie there
   * or will be back by the time the bot arrives, the nearest, a small kit counting
   * `SMALL_KIT_PENALTY` seconds longer for mending less.
   *
   * @param costs - Driving costs from the bot to every cell, from `floodCosts`.
   */
  function chooseKit(costs: Float32Array) {
    const now = context.clock();
    let best: { kit: Readonly<Kit>; travel: number; score: number } | undefined;

    for (const candidate of context.kits) {
      const travel = costs[cellAt(grid, candidate)] / (MEDIUM_TANK.speed * TRAVEL_SHARE);
      const score = Math.max(travel, candidate.readyAt - now) + (candidate.size === 'small' ? SMALL_KIT_PENALTY : 0);

      if (Number.isFinite(travel) && candidate.readyAt - now < travel + KIT_WAIT && (!best || score < best.score)) {
        best = { kit: candidate, travel: score, score };
      }
    }

    return best;
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

    if (action === 'pickUpKit') {
      task.kit = kit && { kit, readyAt: kit.readyAt, armor: combat.armorLeft(tank) };
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

      case 'pickUpKit': {
        if (!task.kit) {
          return 'failed';
        }

        // Taken since the bot set out: by the bot, if its armor is better, or else by someone else.
        if (task.kit.kit.readyAt !== task.kit.readyAt && task.kit.kit.readyAt > now) {
          return combat.armorLeft(tank) > task.kit.armor + 0.005 ? 'done' : 'failed';
        }

        task.destination = task.kit.kit;
        task.route = 'safe';
        task.arrive = 4;
        return now - task.startedAt > KIT_TIMEOUT ? 'failed' : 'running';
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
   * Swings the turret toward the enemy most worth shooting and fires when the shot is worth it.
   * The bot aims where the shell will meet the target's core, from the target's speed and the
   * shell's flight time, but misjudges that spot: the error grows with range, with the target's
   * speed and while the bot drives, and it is drawn anew for every shot. It holds fire for its
   * reaction time after picking a target, and while the shell would likely miss. Without a target
   * the turret watches the latest known threat or looks where the tank drives.
   */
  function aim(tank: Tank, dt: number, now: number, move: Point) {
    const position = tank.hull.translation();
    const preferred = task?.target && visible.has(task.target) ? task.target : undefined;
    const focus = board.focus && visible.has(board.focus) ? board.focus : undefined;
    const target = preferred ?? focus ?? nearestVisible(position);

    if (target !== gun.target) {
      gun = { target, since: now, reaction: REACTION_MIN + context.random() * (REACTION_MAX - REACTION_MIN), offset: undefined };
    }

    let goal: number;

    if (target) {
      const velocity = target.hull.linvel();
      const course = intercept(position, coreOf(target), velocity, MEDIUM_TANK.shell.speed);
      const range = distance(position, course.point);
      const own = tank.hull.linvel();
      const error = aimError(range, Math.hypot(velocity.x, velocity.y) * course.time, Math.hypot(own.x, own.y) / MEDIUM_TANK.speed);
      gun.offset ??= { x: gaussian(context.random) * error, y: gaussian(context.random) * error };
      const spot = { x: course.point.x + gun.offset.x, y: course.point.y + gun.offset.y };
      goal = Math.atan2(spot.y - position.y, spot.x - position.x);
      turnTurret(tank, goal, dt);
      const aligned = Math.abs(angleBetween(tank.turretAngle, goal)) < Math.max(Math.atan2(AIM_TOLERANCE, range), 0.01);
      const worth = error < MAX_AIM_ERROR || (member.gun?.rounds === MEDIUM_TANK.gun.clip && error < MAX_AIM_ERROR * 1.5);
      const reacted = now - gun.since >= gun.reaction;

      const clear = combat.lineOfSight(position, spot) && combat.lineOfSight(position, target.hull.translation());

      if (member.gun?.ready && reacted && aligned && worth && range < VISION && clear && context.fire(member)) {
        gun.offset = undefined;
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

/** Actions on the way somewhere, during which a bot may break through a wall that is in the way. */
const BREACH_ACTIONS = new Set<BotAction>(['goToPoint', 'stage', 'flank', 'retreat', 'repair', 'pickUpKit', 'regroup', 'moveToSupport']);

/**
 * The gun's hold on a target: since when the bot has it, how long it takes to react, and how far
 * it misjudges where to aim for the next shot.
 */
type Aim = { target: Tank | undefined; since: number; reaction: number; offset: Point | undefined };

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
  /** The repair kit driven to, when it was due back as the bot set out, and the bot's armor then. */
  kit?: { kit: Readonly<Kit>; readyAt: number; armor: number };
};

const PERCEIVE_INTERVAL = 0.1;
/** Plans no more often than this after a change, and at least this often with jitter. */
const MIN_REPLAN = 0.3;
const REPLAN_INTERVAL = 2.5;
const REPLAN_JITTER = 1;
/**
 * How far a bot sees, as far as a player sees on a laptop screen at the default zoom, and the
 * range it likes to fight at; it shoots at anything it sees.
 */
const VISION = 480;
const FIRE_RANGE = 440;
/** Enemies this close to the point are a threat to it. */
const NEAR_POINT = 320;
/** Seconds after a hit or near miss that the bot still feels under fire. */
const UNDER_FIRE = 1.5;
/** Armor shares below which a bot counts as badly damaged, and above which as mended. */
const ARMOR_LOW = 0.72;
const REPAIRED = 0.96;
/**
 * Seconds a small repair kit counts as farther than it is, for mending less than a large one;
 * seconds a bot would wait at a kit that is not back yet; and how long it tries to reach one.
 */
const SMALL_KIT_PENALTY = 1.5;
const KIT_WAIT = 2;
const KIT_TIMEOUT = 12;
/** Share of its top speed a tank keeps on average along a path, slowing for turns, for travel estimates. */
const TRAVEL_SHARE = 0.85;
/** Hits a bot expects to need to reach a core from behind, from the side and from the front. */
const HITS_TO_KILL = { rear: 3, side: 4, front: 10 };
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
const DUEL_MIN = 200;
const DUEL_MAX = 380;
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
/** Share of the turret's speed used while just looking around. */
const IDLE_TURN = 0.6;
/** Seconds a bot takes to fire at a target it just picked, drawn between these. */
const REACTION_MIN = 0.25;
const REACTION_MAX = 0.5;
/** Pixels off its aim point at the target's range within which the turret counts as on target. */
const AIM_TOLERANCE = 4;
/** Standard deviation of the aim error, in pixels at the target, beyond which a bot holds fire. */
const MAX_AIM_ERROR = 32;
/**
 * A shell flying at the tank is dodged if it would pass within `DODGE_MISS` px and arrives
 * within `DODGE_LOOKAHEAD` s but no sooner than `DODGE_REACTION` s, at `DODGE_CHANCE`: the bot
 * drives sideways for `DODGE_TIME` s, checking `DODGE_CHECK` px ahead for room.
 */
const DODGE_MISS = 32;
const DODGE_LOOKAHEAD = 0.8;
const DODGE_REACTION = 0.2;
const DODGE_CHANCE = 0.5;
const DODGE_TIME = 0.45;
const DODGE_CHECK = 40;

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

/** Turns the turret toward `goal` by at most the tank class's turret speed times `dt`. */
function turnTurret(tank: Tank, goal: number, dt: number) {
  const delta = angleBetween(tank.turretAngle, goal);
  const step = MEDIUM_TANK.turretSpeed * dt;
  tank.turretAngle += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
}

/**
 * Where a shell fired from `from` at `speed` meets a target at `at` moving at `velocity`, and its
 * flight time; the shell leaves the muzzle, a barrel's length ahead.
 */
function intercept(from: Point, at: Point, velocity: Point, speed: number) {
  let time = 0;
  let point = at;

  for (let iteration = 0; iteration < 3; iteration++) {
    point = { x: at.x + velocity.x * time, y: at.y + velocity.y * time };
    time = Math.max(distance(from, point) - BARREL, 0) / speed;
  }

  return { point, time };
}

/**
 * Standard deviation of a bot's aim, in pixels at the target: a little always, more with range,
 * a share of the lead it has to judge, and more while the bot itself drives.
 *
 * @param lead - Pixels the target moves while the shell flies.
 * @param driving - The bot's own speed as a share of its top speed.
 */
function aimError(range: number, lead: number, driving: number) {
  return AIM_BASE + range * AIM_PER_PIXEL + lead * LEAD_ERROR + range * DRIVING_ERROR * Math.min(driving, 1);
}

/** Pixels from a hull's center to its muzzle. */
const BARREL = 30;
const AIM_BASE = 3;
const AIM_PER_PIXEL = 0.01;
const LEAD_ERROR = 0.3;
const DRIVING_ERROR = 0.02;

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
