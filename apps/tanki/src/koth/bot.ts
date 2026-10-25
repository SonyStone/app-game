import type { Tank } from '../arena/bodies';
import type { Combat } from '../damage/combat';
import { reachFor } from '../damage/weapons/lob';
import { createBreacher } from './breach';
import { planBot, type BotAction, type BotFact, type BotGoal, type Situation } from './brain';
import { findBankShot } from './classes/bank';
import { angleBetween, inArc, turnInPlace } from './classes/casemate';
import { TACTICS, TOUGHNESS } from './classes/tactics';
import { chargedShell, type Trigger } from './classes/weapon';
import { createDriver, type Obstacle } from './driver';
import type { Kit } from './kits';
import { inBase, onPoint, type KothMap } from './map';
import { cellAt, floodCosts, isOpenAt, searchNearest, cellCenter, sightClear, type NavGrid } from './navigation';
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
  /** Sets how the member works its trigger this step; the match fires what the weapon gives. */
  trigger: (member: Member, trigger: Trigger) => void;
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
 *    shot is likely to hit. Each class works its weapon its own way: a grenade is lobbed onto
 *    groups, over crates and banked off walls, and a casemate gun turns its whole hull to aim,
 *    holds still and charges its shot. On its way somewhere, it breaks through a wall when that
 *    beats driving around, by its class's weapon or a ram (see `./breach`), and the breach takes
 *    over its driving and gun meanwhile.
 *
 * A bot knows only what a player would: it sees as far as a player's screen reaches and not
 * through walls, takes a moment to react to a new target, and misjudges a moving target's lead.
 * A sniper sees farther along its gun, as through a scope.
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
  let gun: Aim = { target: undefined, since: 0, reaction: 0, offset: undefined, shots: 0, seenAt: -Infinity, settledFrom: 0, lag: undefined };
  let dodge: { until: number; direction: Point } | undefined;
  /** The drive direction the driver planned last step, where an idle turret looks. */
  let lastMove: Point = { x: 0, y: 0 };
  const judged = new Set<number>();
  /** Charged shots of enemy snipers whose laser the bot has judged, by sniper and shot. */
  const lasers = new Set<string>();
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
      gun = { target: undefined, since: 0, reaction: 0, offset: undefined, shots: 0, seenAt: -Infinity, settledFrom: 0, lag: undefined };
      dodge = undefined;
      lastMove = { x: 0, y: 0 };
      judged.clear();
      lasers.clear();
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
      // The gun may want the hull still or turning on the spot; the driver then waits, so it does not take the stop for being stuck.
      // A breach that shoots works the gun itself, and one under way drives the tank.
      const stance = breach?.aim !== undefined ? {} : aim(tank, dt, now, lastMove);
      const steady = !breach && (stance.hold || stance.turnTo !== undefined);
      const planned =
        breach?.move ??
        driver.steer(now, position, breach ? breach.destination : steady ? undefined : travel, obstacles(tank), {
          arrive: breach ? breach.arrive : task?.arrive,
          cost,
          heading: tank.hull.rotation(),
          nose: member.tankClass.hull.halfLength + NOSE_MARGIN
        });
      let move = (breach ? undefined : sidestep(position, now)) ?? planned;
      const mount = member.tankClass.mount;

      if (breach?.aim !== undefined) {
        turnTurret(tank, breach.aim, dt, member.tankClass.turretSpeed);
      }

      // A casemate gun turns its whole hull to aim, on the spot, at a wall to break too; a charging one holds still.
      const turnTo = breach?.aim !== undefined ? (mount.kind === 'casemate' && !inArc(tank, breach.aim, mount.arc - ARC_MARGIN) ? breach.aim : undefined) : stance.turnTo;

      if (turnTo !== undefined && mount.kind === 'casemate' && !dodge) {
        member.pivot ??= { x: position.x, y: position.y };
        move = turnInPlace(tank, member.pivot, turnTo, mount.traverse, tank.pullSpeed);
      } else {
        member.pivot = undefined;
      }

      lastMove = planned;
      combat.drive(tank, move);
    }
  };

  /**
   * The drive direction of a sidestep away from an enemy shell about to hit the tank, or
   * `undefined` when there is none. The bot judges each shell once: if it would pass close and
   * arrives late enough to react to, the bot dodges it at its class's chance, sideways off its line.
   * The laser of an enemy sniper charging at it is judged the same way, once per shot.
   */
  function sidestep(position: Point, now: number) {
    if (dodge && now < dodge.until) {
      return dodge.direction;
    }

    dodge = undefined;

    for (const rival of context.rivals) {
      const charge = rival.weapon?.charge;
      const key = `${rival.id}:${rival.weapon?.shots}`;

      if (!rival.tank || charge === undefined || charge < LASER_FEAR || !visible.has(rival.tank) || lasers.has(key)) {
        continue;
      }

      const from = rival.tank.hull.translation();
      const beam = { x: Math.cos(rival.tank.turretAngle), y: Math.sin(rival.tank.turretAngle) };
      const offset = { x: position.x - from.x, y: position.y - from.y };
      const across = offset.x * beam.y - offset.y * beam.x;

      if (offset.x * beam.x + offset.y * beam.y <= 0 || Math.abs(across) > LASER_MISS) {
        continue;
      }

      lasers.add(key);

      if (context.random() < TACTICS[member.tankClass.id].dodge) {
        const side = across === 0 ? 1 : Math.sign(across);
        const away = { x: beam.y * side, y: -beam.x * side };
        const direction = [away, { x: -away.x, y: -away.y }].find((option) => isOpenAt(grid, { x: position.x + option.x * DODGE_CHECK, y: position.y + option.y * DODGE_CHECK }));

        if (direction) {
          dodge = { until: now + LASER_DODGE_TIME, direction };
          return direction;
        }
      }
    }
    // A grenade's arc is too hard to judge to dodge; a bot only sidesteps shells flying straight.
    const shells = combat.shells.filter((shell) => shell.team !== member.team && !shell.lobbed);

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

      if (arrival < DODGE_REACTION || context.random() >= TACTICS[member.tankClass.id].dodge) {
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

  /**
   * Which enemies the tank can see now: within range and not behind walls or crates. A sniper
   * sees farther along its gun, as through a scope.
   */
  function perceive(tank: Tank) {
    const position = tank.hull.translation();
    const scoped = member.tankClass.id === 'sniper';
    visible.clear();

    for (const rival of context.rivals) {
      const enemy = rival.tank;

      if (!enemy) {
        continue;
      }

      const at = enemy.hull.translation();
      const range = distance(position, at);
      const inScope = scoped && range < SCOPE_RANGE && Math.abs(angleBetween(tank.turretAngle, Math.atan2(at.y - position.y, at.x - position.x))) < SCOPE_ARC;

      if ((range < VISION || inScope) && combat.lineOfSight(position, at)) {
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

    const reach = TACTICS[member.tankClass.id].reach;

    return {
      onPoint: onPoint(map, position),
      pointLocked: capture.locked > 0,
      atPerch: member.role === 'sniper' && distance(position, board.perchSpot(member)) < PERCHED,
      pointOurs: capture.owner === member.team,
      enemyOnPoint: rivalsOnPoint() > 0,
      mustStage: board.phase === 'gather',
      staged: board.phase === 'go',
      hasTarget: target !== undefined,
      targetNearPoint: targetAt !== undefined && distance(targetAt, map.point) < NEAR_POINT,
      targetVisible: target !== undefined && visible.has(target),
      inFireZone: target !== undefined && visible.has(target) && distance(position, targetAt!) < reach,
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
      attackerInRange: help !== undefined && visible.has(help.attacker) && distance(position, help.attacker.hull.translation()) < reach,
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

    const sight = Math.max(VISION, TACTICS[member.tankClass.id].reach);

    if (focus && board.sightingOf(focus) && distance(position, whereIs(focus)) < sight) {
      return focus;
    }

    const nearest = (tanks: Tank[]) => tanks.sort((a, b) => distance(position, whereIs(a)) - distance(position, whereIs(b)))[0];

    return nearest([...visible]) ?? nearest(board.known().map((sighting) => sighting.tank).filter((enemy) => distance(position, whereIs(enemy)) < sight));
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
    const travel = (point: Point | undefined) => (point ? costs[cellAt(grid, point)] / (member.tankClass.speed * TRAVEL_SHARE) : Infinity);
    const reach = TACTICS[member.tankClass.id].reach;
    const target = chooseTarget(tank);
    const help = board.helpFor(member);
    const capture = context.capture();
    const rival = rivalOf(member.team);
    const alliesOn = context.allies
      .filter((ally) => ally !== member && ally.tank && onPoint(map, ally.tank.hull.translation()))
      .reduce((total, ally) => total + ally.tankClass.capture, 0);
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
        approach: targetAt ? travel(targetAt) * Math.max(1 - (reach * 0.8) / Math.max(distance(position, targetAt), 1), 0) : Infinity,
        flank: target ? travel(flankSpot(target, sideToward(target, position))) : Infinity,
        support: help ? travel(supportSpot(help.ally)) : Infinity,
        cover: cover ? travel(cover) : Infinity,
        base: travel(board.baseSpot(member)),
        rally: travel(board.rally()),
        kit: choice?.travel ?? Infinity,
        perch: member.role === 'sniper' ? travel(board.perchSpot(member)) : Infinity
      },
      kill: { front: killTime(position, target, false), rear: killTime(position, target, true) },
      capture: ((1 - progress) * context.rules.captureTime) / captureRate(alliesOn + member.tankClass.capture),
      enemyClock: (capture.held[rival] / context.rules.holdTime) * (capture.owner === rival ? 1 : 0.6),
      targetClearsPoint: target !== undefined && onPoint(map, whereIs(target)) && rivalsOnPoint() <= 1,
      current: plan?.goal
    };
  }

  /**
   * Seconds the bot expects to need to destroy `target`, from where it is or from behind: the
   * shots its class takes against the target's class, at the accuracy the range allows within its
   * reach, fired one interval apart, plus each charged shot's charging, and some time exposed to
   * the target's gun.
   */
  function killTime(position: Point, target: Tank | undefined, fromRear: boolean) {
    if (!target) {
      return Infinity;
    }

    const tankClass = member.tankClass;
    const tactics = TACTICS[tankClass.id];
    const at = whereIs(target);
    const range = distance(position, at);
    const accuracy = Math.min(Math.max(1.1 - range / (tactics.reach * 1.15), 0.2), 0.9);
    const heading = target.hull.rotation();
    const facing = range > 1 ? ((position.x - at.x) * Math.cos(heading) + (position.y - at.y) * Math.sin(heading)) / range : 0;
    const toughness = TOUGHNESS[classOf(target)];
    let hits = (fromRear ? tactics.hits.rear : facing > 0.5 ? tactics.hits.front : facing > -0.4 ? tactics.hits.side : tactics.hits.rear) * toughness;
    let exposure = fromRear ? 0.5 : facing > 0.3 ? 2.5 : 1;

    if (combat.isCoreOpen(target)) {
      hits = 1;
      exposure = 0;
    }

    const weapon = tankClass.weapon;
    const shots = hits / accuracy;
    const charging = weapon.kind === 'charge' ? shots * weapon.time : 0;
    return shots * tankClass.interval + charging + exposure;
  }

  /** The class of an enemy tank. */
  function classOf(enemy: Tank) {
    return context.rivals.find((rival) => rival.tank === enemy)?.tankClass.id ?? 'soldier';
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
      const travel = costs[cellAt(grid, candidate)] / (member.tankClass.speed * TRAVEL_SHARE);
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
        return visible.has(task.target) && distance(position, task.target.hull.translation()) < TACTICS[member.tankClass.id].reach * 0.85 ? 'done' : 'running';
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
        const there = isBehind(position, task.target) && visible.has(task.target) && distance(position, task.target.hull.translation()) < TACTICS[member.tankClass.id].reach;
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
        return visible.has(help.attacker) && distance(position, help.attacker.hull.translation()) < TACTICS[member.tankClass.id].reach ? 'done' : 'running';
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

      case 'goToPerch': {
        task.destination = board.perchSpot(member);
        task.route = 'safe';
        task.arrive = 20;
        return distance(position, task.destination) < PERCHED ? 'done' : 'running';
      }

      case 'overwatch': {
        // On its perch a sniper holds still and watches the point; a perch the enemy sees is given up for another.
        task.destination = board.perchSpot(member);
        task.arrive = 20;
        task.hold = distance(position, task.destination) < PERCHED;
        return distance(position, task.destination) < PERCHED * 2.5 ? 'running' : 'failed';
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
    const duel = TACTICS[member.tankClass.id].duel;
    const range = Math.min(Math.max(Math.hypot(offset.x, offset.y), duel.min), duel.max);
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
   * Swings the turret toward the enemy most worth shooting and works the trigger when the shot is
   * worth it. The bot aims where its shell will meet the target's core, from the target's speed and
   * the shell's flight time, but misjudges that spot: the error grows with range, with the target's
   * speed and while the bot drives, and it is drawn anew for every shot. It holds fire for its
   * reaction time after picking a target, and while the shell would likely miss. Without a target
   * the turret watches the latest known threat or looks where the tank drives. A rail hits at
   * once, so there is no lead to misjudge; a hand aiming it is human anyway (see `railSpot`).
   *
   * Each weapon is worked its own way: a grenade is thrown to land on its target, onto two enemies
   * at once when it can, and banked off a wall at an enemy round a corner; a casemate gun turns its
   * hull toward a target outside its arc and charges its shot standing still, letting go once
   * charged and on target.
   *
   * @returns How the gun wants the hull to move: turned on the spot toward `turnTo`, or held still.
   */
  function aim(tank: Tank, dt: number, now: number, move: Point): { turnTo?: number; hold?: boolean } {
    const position = tank.hull.translation();
    const weapon = member.weapon;
    const tankClass = member.tankClass;
    const tactics = TACTICS[tankClass.id];
    const preferred = task?.target && visible.has(task.target) ? task.target : undefined;
    const focus = board.focus && visible.has(board.focus) ? board.focus : undefined;
    const target = preferred ?? focus ?? nearestVisible(position);
    const lobbing = tankClass.weapon.kind === 'lob';

    // Every shot draws a new misjudgement, and the gun settles on its target anew after the kick.
    if (weapon && weapon.shots !== gun.shots) {
      gun = { ...gun, shots: weapon.shots, offset: undefined, lag: undefined, settledFrom: now };
    }

    if (target !== gun.target) {
      gun = { ...gun, target, since: now, reaction: REACTION_MIN + context.random() * (REACTION_MAX - REACTION_MIN), offset: undefined, lag: undefined, settledFrom: now };
    }

    if (!target) {
      return lobbing ? lobUnseen(tank, dt) : idle(tank, dt, move);
    }

    gun.seenAt = now;
    const velocity = target.hull.linvel();
    const core = combat.coreOf(target) ?? target.hull.translation();
    const course = intercept(position, core, velocity, shellSpeed(), tactics.reach);
    const range = distance(position, course.point);
    const own = tank.hull.linvel();
    const rail = tankClass.shell.rail !== undefined;
    const settling = rail ? 1 + UNSETTLED * Math.exp(-(now - gun.settledFrom) / SETTLE_TIME) : 1;
    const error = aimError(range, Math.hypot(velocity.x, velocity.y) * course.time, Math.hypot(own.x, own.y) / tankClass.speed) * tactics.steadiness * settling;
    // A rail's misjudgement is drawn in units of the error, which shrinks as the bot settles.
    gun.offset ??= rail ? { x: gaussian(context.random), y: gaussian(context.random) } : { x: gaussian(context.random) * error, y: gaussian(context.random) * error };
    const spot = lobbing
      ? groupSpot(target, { x: course.point.x + gun.offset.x, y: course.point.y + gun.offset.y })
      : rail
        ? railSpot(core, velocity, gun.offset, error)
        : { x: course.point.x + gun.offset.x, y: course.point.y + gun.offset.y };
    // From where the gun turns, so its line passes through the spot.
    const pivot = combat.gunPivotOf(tank);
    const goal = Math.atan2(spot.y - pivot.y, spot.x - pivot.x);
    turnTurret(tank, goal, dt, tankClass.turretSpeed);
    const aligned = Math.abs(angleBetween(tank.turretAngle, goal)) < Math.max(Math.atan2(AIM_TOLERANCE * tactics.aimError, range), 0.01);
    const worth = error < MAX_AIM_ERROR * tactics.aimError;
    const reacted = now - gun.since >= gun.reaction;
    const clear = combat.lineOfSight(position, spot) && combat.lineOfSight(position, target.hull.translation());
    const inReach = range < tactics.reach;
    const ready = weapon?.ready ?? false;
    const weaponSpec = tankClass.weapon;

    switch (weaponSpec.kind) {
      case 'lob': {
        // A grenade flies over crates, so only walls must not stand between.
        const throwable = sightClear(grid, position, spot) && distance(position, spot) < tankClass.shell.range;
        context.trigger(member, { fire: ready && reacted && aligned && worth && throwable, reach: distance(position, spot) });
        return {};
      }

      case 'charge':
        return charge(tank, goal, { reacted, aligned, clear, inReach, worth, range });

      default:
        // Held while the shot is worth it: the gun fires as its cadence allows, and a gatling keeps spinning.
        context.trigger(member, { fire: reacted && aligned && worth && inReach && clear });
        return {};
    }
  }

  /**
   * The turret without a target: it watches the latest known threat, or where the tank drives, or
   * the point. A casemate gun watches only threats close enough to shoot at soon.
   */
  function idle(tank: Tank, dt: number, move: Point): { turnTo?: number; hold?: boolean } {
    const position = tank.hull.translation();
    const watch = member.tankClass.mount.kind === 'casemate' ? WATCH_RANGE : Infinity;
    const threat = board
      .known()
      .filter((sighting) => distance(position, sighting.position) < watch)
      .sort((a, b) => distance(position, a.position) - distance(position, b.position))[0];
    let goal: number;

    if (threat) {
      goal = Math.atan2(threat.position.y - position.y, threat.position.x - position.x);
    } else if (Math.hypot(move.x, move.y) > 0.2) {
      goal = Math.atan2(move.y, move.x);
    } else {
      goal = Math.atan2(map.point.y - position.y, map.point.x - position.x);
    }

    turnTurret(tank, goal, dt * IDLE_TURN, member.tankClass.turretSpeed);
    // A charge is held a moment for a target that slipped out of sight, then dropped unfired.
    const holding = member.weapon?.charge !== undefined && context.clock() - gun.seenAt < KEEP_CHARGE;
    context.trigger(member, { fire: holding, cancel: !holding });
    const mount = member.tankClass.mount;

    // A casemate gun on watch turns its hull toward what it watches, once it looks well away; on the move its hull leads the way.
    if (mount.kind === 'casemate' && Math.hypot(move.x, move.y) < 0.2 && !inArc(tank, goal, mount.arc + (member.pivot ? 0 : WATCH_SLACK))) {
      return { turnTo: goal };
    }

    return { hold: holding };
  }

  /**
   * A Demoman without an enemy in sight lobs at one the team knows of nearby: over the crates it
   * hides behind, or banked off a wall when walls stand in the way.
   */
  function lobUnseen(tank: Tank, dt: number): { turnTo?: number; hold?: boolean } {
    const position = tank.hull.translation();
    const shell = member.tankClass.shell;
    const known = board
      .known()
      .filter((sighting) => context.clock() - sighting.seenAt < LOB_MEMORY && distance(position, sighting.position) < shell.range)
      .sort((a, b) => distance(position, a.position) - distance(position, b.position))[0];

    if (!known) {
      return idle(tank, dt, STOP);
    }

    const spot = known.position;
    const standing = (point: Point) => combat.obstacleDistance(point, BANK_FACE) < BANK_FACE;
    const bank = sightClear(grid, position, spot) ? undefined : findBankShot(grid, map.walls ?? [], position, spot, shell.range, shell.lob!.rebound, standing);
    const throwable = bank !== undefined || sightClear(grid, position, spot);
    const goal = bank?.angle ?? Math.atan2(spot.y - position.y, spot.x - position.x);
    turnTurret(tank, goal, dt, member.tankClass.turretSpeed);
    const aligned = Math.abs(angleBetween(tank.turretAngle, goal)) < 0.03;
    const reach = bank?.reach ?? reachFor(shell.lob!, shell.speed, distance(position, spot), shell.range);
    context.trigger(member, { fire: throwable && aligned && (member.weapon?.ready ?? false), reach });
    return {};
  }

  /**
   * Where to lob a grenade aimed at `target`, at `spot`: between it and another enemy close
   * enough that one blast catches both, else the spot itself.
   */
  function groupSpot(target: Tank, spot: Point) {
    const radius = member.tankClass.shell.blast?.radius ?? 0;
    const at = target.hull.translation();
    const other = [...visible].find((enemy) => enemy !== target && distance(enemy.hull.translation(), at) < radius * GROUP_REACH);

    if (!other) {
      return spot;
    }

    const there = other.hull.translation();
    return { x: (spot.x + there.x) / 2, y: (spot.y + there.y) / 2 };
  }

  /**
   * Works a charged shot: turns the hull toward a target outside the gun's arc, then charges
   * standing still, fully unless the target is close or the bot is under fire, and lets go once
   * charged and on target. A charge for a target it can no longer shoot at is dropped.
   */
  function charge(tank: Tank, goal: number, shot: { reacted: boolean; aligned: boolean; clear: boolean; inReach: boolean; worth: boolean; range: number }) {
    const mount = member.tankClass.mount;
    const charging = member.weapon?.charge;
    const outside = mount.kind === 'casemate' && !inArc(tank, goal, mount.arc - ARC_MARGIN);
    const wanted = shot.range < CLOSE_SHOT || context.clock() - member.shotAt < UNDER_FIRE ? HASTY_CHARGE : 1;
    const shootable = shot.reacted && shot.clear && shot.inReach && shot.worth;

    if (!shootable) {
      context.trigger(member, { fire: charging !== undefined, cancel: true });
      return outside ? { turnTo: goal } : { hold: charging !== undefined };
    }

    const release = charging !== undefined && charging >= wanted && shot.aligned && !outside;
    context.trigger(member, { fire: !release && (member.weapon?.ready ?? false) });
    return outside ? { turnTo: goal } : { hold: true };
  }

  /**
   * Where a bot aims a rail, which hits at once, at a target whose core is at `core` moving at
   * `velocity`: a human hand trails a moving target, so it aims where the core was `gun.lag`
   * seconds ago, drawn anew for every shot, and misses by `error` times its draw `wobble`, an
   * error that starts `UNSETTLED` times larger as it picks a target or fires and shrinks as it
   * settles over `SETTLE_TIME` s. A still target held for a full charge is hit well; one crossing
   * the line, as a tank dodging off a laser does, is trailed and mostly missed.
   */
  function railSpot(core: Point, velocity: Point, wobble: Point, error: number) {
    gun.lag ??= LAG_MIN + context.random() * (LAG_MAX - LAG_MIN);
    return { x: core.x - velocity.x * gun.lag + wobble.x * error, y: core.y - velocity.y * gun.lag + wobble.y * error };
  }

  /** Speed of the bot's next shell: its class's, at the charge it is likely to fire with; infinite for a rail. */
  function shellSpeed() {
    const tankClass = member.tankClass;
    const weapon = tankClass.weapon;
    return weapon.kind === 'charge' ? chargedShell(tankClass.shell, weapon.full, member.weapon?.charge ?? 0.5).speed : tankClass.shell.speed;
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

const STOP = { x: 0, y: 0 };
/** Pixels past the hull's front at which the driver checks for a wall ahead. */
const NOSE_MARGIN = 2;

/**
 * The gun's hold on a target: since when the bot has it, how long it takes to react, and how far
 * it misjudges where to aim for the next shot.
 */
type Aim = {
  target: Tank | undefined;
  since: number;
  reaction: number;
  /** How far off the aim is, in pixels; for a rail, in units of its aim error at the moment. */
  offset: Point | undefined;
  /** The weapon's shot count when the offset was drawn, to draw anew after each shot. */
  shots: number;
  /** When a target was last in the gun's sights. */
  seenAt: number;
  /** When the gun began to settle on its target, at picking it or after the last shot, for a rail's aim. */
  settledFrom: number;
  /** Seconds a rail's aim trails a moving target this shot; drawn when first needed. */
  lag: number | undefined;
};

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
 * How far a bot sees, as far as a player sees on a laptop screen at the default zoom; how far a
 * sniper sees within `SCOPE_ARC` of its gun, as a sniper's player sees with the camera thrown
 * forward; and how close a sniper must be to its perch to be on it.
 */
const VISION = 480;
const SCOPE_RANGE = 900;
const SCOPE_ARC = 0.45;
const PERCHED = 30;
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
/** How far around the target the bot shifts every `ORBIT_INTERVAL` s in a head-on duel, at its class's range. */
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
/** Seconds a Demoman keeps lobbing at where an enemy out of sight was last seen. */
const LOB_MEMORY = 1.5;
/** A wall's face counts as standing for a bank shot where a wall lies within this many pixels of it now. */
const BANK_FACE = 4;
/** A second enemy this many blast radii from the target makes a Demoman throw between them. */
const GROUP_REACH = 1.2;
/**
 * A sniper turns its hull once the target is this close to the edge of its arc; it fires a shot
 * of `HASTY_CHARGE` at a target closer than `CLOSE_SHOT` px or under fire, and holds a charge for
 * a target out of sight for `KEEP_CHARGE` s.
 */
const ARC_MARGIN = 0.03;
/** A casemate gun on watch turns toward threats within `WATCH_RANGE` px, once its view is `WATCH_SLACK` rad past its arc. */
const WATCH_RANGE = 650;
const WATCH_SLACK = 0.25;
const HASTY_CHARGE = 0.45;
const CLOSE_SHOT = 300;
const KEEP_CHARGE = 1.5;
/**
 * A shell flying at the tank is dodged if it would pass within `DODGE_MISS` px and arrives
 * within `DODGE_LOOKAHEAD` s but no sooner than `DODGE_REACTION` s, at its class's chance to
 * dodge: the bot drives sideways for `DODGE_TIME` s, checking `DODGE_CHECK` px ahead for room.
 */
const DODGE_MISS = 32;
const DODGE_LOOKAHEAD = 0.8;
const DODGE_REACTION = 0.2;
const DODGE_TIME = 0.45;
const DODGE_CHECK = 40;
/**
 * A bot fears a sniper's laser once the shot has charged `LASER_FEAR` and the beam passes within
 * `LASER_MISS` px of it; it then drives off the beam for `LASER_DODGE_TIME` s.
 */
const LASER_FEAR = 0.35;
const LASER_MISS = 30;
const LASER_DODGE_TIME = 0.7;

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
const EITHER_WAY: BotFact[] = ['pointOurs', 'enemyOnPoint', 'mustStage', 'staged', 'regroupCalled', 'pointLocked'];
/** Facts that make a bot plan again when they become true. */
const WHEN_RAISED: BotFact[] = ['hasTarget', 'targetVisible', 'coreOpen', 'armorLow', 'underFire', 'allyNeedsHelp'];

/** Turns the turret toward `goal` by at most `speed` radians per second for `dt` seconds. */
function turnTurret(tank: Tank, goal: number, dt: number, speed: number) {
  const delta = angleBetween(tank.turretAngle, goal);
  const step = speed * dt;
  tank.turretAngle += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
}

/**
 * Where a shell fired from `from` at `speed` meets a target at `at` moving at `velocity`, and its
 * flight time; the shell leaves the muzzle, a barrel's length ahead. The lead is judged for at
 * most the time a shell takes to fly `reach` pixels.
 */
function intercept(from: Point, at: Point, velocity: Point, speed: number, reach: number) {
  let time = 0;
  let point = at;

  for (let iteration = 0; iteration < 3; iteration++) {
    point = { x: at.x + velocity.x * time, y: at.y + velocity.y * time };
    time = Math.min(Math.max(distance(from, point) - BARREL, 0), reach) / speed;
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
/**
 * A rail's aim, which hits at once: it trails a moving target by `LAG_MIN` to `LAG_MAX` s, and its
 * error starts `UNSETTLED` times larger than settled and settles with a time constant of
 * `SETTLE_TIME` s, half the extra gone in about 0.5 s.
 */
const LAG_MIN = 0.05;
const LAG_MAX = 0.15;
const UNSETTLED = 2;
const SETTLE_TIME = 0.8;


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
