import { chooseGoal, type Facts, type GoapAction, type GoapGoal } from '../ai/goap';

/**
 * What a tank bot wants and can do in king of the hill, in GOAP terms. The bot describes its
 * situation as true/false facts plus a few estimates in seconds: how long the drives to the places
 * it cares about take, how long its target would take to destroy from the front or from behind,
 * how long a capture would take. Goals get priorities and actions get costs from those numbers,
 * and the planner from `../ai/goap` picks the most important goal it can reach and the cheapest
 * way there. The bot then carries out the plan's actions one by one and asks again when its
 * situation changes or every few seconds.
 *
 * Everything here is pure, so plans for typical situations can be tested without physics.
 */
export function planBot(situation: Situation) {
  return chooseGoal(situation.facts, botGoals(situation), botActions(situation));
}

/**
 * A bot's job in its team, from its class: assaults go for the point, flankers for the enemy's
 * rear, supports cover allies, the lead goes first into a push and takes the brunt of the fire,
 * and snipers shoot from a perch, from afar, and never chase.
 */
export type Role = 'assault' | 'flank' | 'support' | 'lead' | 'sniper';

/**
 * Facts a bot plans with; missing ones are false.
 *
 * - `onPoint`, `pointOurs`, `enemyOnPoint`, `pointLocked`: where the bot and the fight for the point
 *   stand, and whether the point is still locked at the start of the match.
 * - `mustStage`: the team is gathering for a coordinated push, so nobody goes in alone;
 *   `staged` means the push has begun.
 * - `hasTarget`: an enemy to fight is known; `targetNearPoint`, `targetVisible`, `inFireZone`
 *   (visible and in range), `behindTarget` (in its rear arc, where the core is) and
 *   `targetCoreOpen` describe it.
 * - `coreOpen`, `armorLow`, `underFire`, `inCover`, `safe`, `atBase`: the bot's health and
 *   exposure; `combatReady`: neither its core open nor its armor low, fit to fight on, and
 *   `repaired`: whole again, as only the base makes it.
 * - `allyNeedsHelp`: the team asked this bot to help an ally under fire; `attackerInRange` and
 *   `allyCovered` follow from helping.
 * - `regroupCalled`, `regrouped`: the team is too weak to fight and gathers to wait for respawns.
 * - `fallBackCalled`: most of the team is badly hit, so it falls back to mend at its base and
 *   goes in again together; `coveringRetreat`: the bot was asked to cover the retreat from a
 *   perch, shooting at the point without going onto it.
 * - `atPerch`: a sniper is at its perch, from where it watches the point.
 * - Goal results that never hold in the world: `targetDown`, `guarding`.
 */
export type BotFact =
  | 'onPoint'
  | 'pointOurs'
  | 'enemyOnPoint'
  | 'pointLocked'
  | 'mustStage'
  | 'staged'
  | 'hasTarget'
  | 'targetNearPoint'
  | 'targetVisible'
  | 'inFireZone'
  | 'behindTarget'
  | 'targetCoreOpen'
  | 'targetDown'
  | 'coreOpen'
  | 'armorLow'
  | 'underFire'
  | 'inCover'
  | 'safe'
  | 'atBase'
  | 'repaired'
  | 'combatReady'
  | 'allyNeedsHelp'
  | 'attackerInRange'
  | 'allyCovered'
  | 'regroupCalled'
  | 'fallBackCalled'
  | 'coveringRetreat'
  | 'regrouped'
  | 'atPerch'
  | 'wayOpened'
  | 'guarding';

/** Names of the bot's goals. */
export type BotGoal = 'survive' | 'patch' | 'repair' | 'capture' | 'defend' | 'kill' | 'support' | 'regroup' | 'breach';

/** Names of the bot's actions; the bot has a behavior for each. */
export type BotAction =
  | 'goToPoint'
  | 'stage'
  | 'capture'
  | 'guardPoint'
  | 'holdPost'
  | 'approach'
  | 'attackFront'
  | 'flank'
  | 'attackRear'
  | 'moveToSupport'
  | 'suppress'
  | 'takeCover'
  | 'retreat'
  | 'repair'
  | 'pickUpKit'
  | 'regroup'
  | 'goToPerch'
  | 'overwatch'
  | 'openWay';

/** Everything a bot plans from. */
export type Situation = {
  role: Role;
  facts: Partial<Record<BotFact, boolean>>;
  /**
   * Seconds of driving to each place the bot's actions lead to, `Infinity` where there is no
   * such place or no way there: the bot's spot on the point, its staging spot for a push, a
   * firing position on its target, a spot behind the target, a spot beside the ally it helps,
   * the nearest cover, its base, the team's rally point, the repair kit most worth taking, a
   * small kit counting a little longer than it is for mending less, a sniper's perch, and the
   * post in front of the point the bot holds while its team holds the point (see `findPosts`),
   * and the wall its team asked it to break open (see `findShortcuts`).
   */
  travel: Record<'point' | 'stage' | 'approach' | 'flank' | 'support' | 'cover' | 'base' | 'rally' | 'kit', number> & {
    perch?: number;
    post?: number;
    breach?: number;
  };
  /** Seconds the bot expects to need to destroy its target from where it is and from behind. */
  kill: { front: number; rear: number };
  /** Seconds a capture would take with the bot's team on the point. */
  capture: number;
  /** How close the enemy is to winning, 0-1, which makes taking the point more urgent. */
  enemyClock: number;
  /** Destroying the target leaves no enemy on the point. */
  targetClearsPoint: boolean;
  /**
   * The repair kit of `travel.kit` mends enough to fight on: its core closed and its armor above
   * its class's retreat share. Every kit closes an open core, but a small one leaves a badly hit
   * tank still badly hit. Defaults to false.
   */
  kitRestores?: boolean;
  /** Priority the bot's class adds to taking the point, on top of its role's (see `ClassTactics.point`); defaults to 0. */
  eagerness?: number;
  /** The goal the bot pursues now; it gets a bonus so that close calls do not flip plans. */
  current?: BotGoal;
};

/**
 * The goals a bot could pursue now, with priorities from its situation. Goals that do not apply
 * are left out: a healthy bot has no reason to repair. Roles weigh them differently: a flanker
 * rushes a point nobody holds, as a Scout takes it twice as fast; the lead keeps to the ground it
 * holds; a sniper watches the point and the ways to it from its perch and takes the point only
 * when all is at stake.
 */
export function botGoals(situation: Situation): GoapGoal<BotGoal>[] {
  const { facts, role } = situation;
  const desperate = situation.enemyClock > 0.85 && !facts.pointOurs;
  const goals: GoapGoal<BotGoal>[] = [];

  // An open core means the next hit is fatal, so the bot gets out of fire and off to mend it: a
  // repair kit close by closes it at once, else the base. Armor merely chipped away is worth
  // mending only when nothing more pressing goes on, since the base is a long drive away, or when
  // a kit close by mends enough to fight on. A kit that mends too little is no reason to stop.
  const kitNear = situation.travel.kit < Math.min(situation.travel.base, KIT_DETOUR);

  if (facts.coreOpen && facts.underFire && !facts.inCover) {
    goals.push({ name: 'survive', wants: { safe: true }, priority: desperate ? 50 : 90 });
  }

  if (facts.coreOpen && kitNear) {
    goals.push({ name: 'patch', wants: { coreOpen: false }, priority: desperate ? 45 : 78 });
  }

  // When the team falls back to mend, every badly hit bot goes, before anything but its life.
  const fallingBack = facts.fallBackCalled && !desperate;

  if (facts.coreOpen) {
    goals.push({ name: 'repair', wants: { combatReady: true }, priority: desperate ? 40 : fallingBack ? FALL_BACK : 75 });
  } else if (facts.armorLow) {
    goals.push({ name: 'repair', wants: { combatReady: true }, priority: desperate ? 30 : fallingBack ? FALL_BACK : kitNear && situation.kitRestores ? 58 : 46 });
  }

  // The bot covering the retreat watches the point from a perch, as a Sniper does.
  if (fallingBack && facts.coveringRetreat) {
    goals.push({ name: 'defend', wants: { guarding: true }, priority: COVER_RETREAT });
  }

  if (!facts.pointOurs && !fallingBack && (role !== 'sniper' || desperate)) {
    // A locked point cannot be taken yet, so enemies in the way are worth more until it opens.
    const rush = role === 'flank' && !facts.enemyOnPoint && !facts.pointLocked ? RUSH : 0;
    const wait = facts.pointLocked ? LOCKED_WAIT : 0;
    const eager = CAPTURE_BONUS[role] + (situation.eagerness ?? 0);
    goals.push({
      name: 'capture',
      wants: { pointOurs: true },
      priority: 50 + 35 * situation.enemyClock + eager + rush - wait
    });
  } else if (facts.pointOurs) {
    goals.push({ name: 'defend', wants: { guarding: true }, priority: (facts.enemyOnPoint ? 68 : 45) + (role === 'lead' ? LEAD_HOLD : 0) });
  }

  if (role === 'sniper' && !facts.pointOurs) {
    goals.push({ name: 'defend', wants: { guarding: true }, priority: OVERWATCH });
  }

  if (facts.hasTarget) {
    // Holding the point, a bot fights what comes near it rather than chasing enemies across the map.
    const holding = facts.pointOurs && !facts.targetNearPoint && role !== 'flank';
    // A target with its core open dies to the next hit, which is worth more than most else.
    const finishing = facts.targetCoreOpen && facts.targetVisible ? 25 : 0;
    // While the team gathers for a push, a bot does not drive off alone after a target it cannot shoot from where it is.
    const restraint = facts.mustStage && !facts.underFire && !facts.inFireZone ? STAGE_RESTRAINT : 0;
    const priority =
      (holding ? 40 : (facts.targetVisible ? 55 : 42) + (role === 'flank' ? 8 : 0) + (facts.pointOurs && facts.enemyOnPoint ? 10 : 0)) + finishing - restraint;
    goals.push({ name: 'kill', wants: { targetDown: true }, priority });
  }

  if (facts.allyNeedsHelp) {
    goals.push({ name: 'support', wants: { allyCovered: true }, priority: role === 'support' ? 72 : 52 });
  }

  // A wall the team asked the bot to open comes before the point, but not before its life or a target in its sights.
  if (Number.isFinite(situation.travel.breach ?? Infinity) && !desperate) {
    goals.push({ name: 'breach', wants: { wayOpened: true }, priority: BREACH });
  }

  if (facts.regroupCalled && !desperate) {
    // A team call to regroup outranks the point and a bot's own commitment to it: going in alone only feeds the enemy.
    goals.push({ name: 'regroup', wants: { regrouped: true }, priority: REGROUP });
  }

  return goals.map((goal) => (goal.name === situation.current ? { ...goal, priority: goal.priority + COMMITMENT } : goal));
}

/**
 * The actions a bot can take, priced in seconds from its situation. Each `requires` and
 * `effects` is what the planner assumes, not a promise: the bot checks the world as it acts.
 */
export function botActions(situation: Situation): GoapAction<BotAction>[] {
  const { travel, role, facts } = situation;
  const hasPost = Number.isFinite(travel.post ?? Infinity);
  // A Sniper works from a perch, and so does a bot covering its team's retreat.
  const perches = role === 'sniper' || (facts.fallBackCalled === true && facts.coveringRetreat === true);
  const killed: Facts = situation.targetClearsPoint ? { targetDown: true, enemyOnPoint: false } : { targetDown: true };
  const actions: GoapAction<BotAction>[] = [
    {
      name: 'goToPoint',
      requires: facts.mustStage ? { staged: true } : {},
      // Driving onto a point the enemy holds brings the bot face to face with them.
      effects: { onPoint: true, inCover: false, ...(facts.enemyOnPoint && facts.hasTarget ? { targetVisible: true, inFireZone: true } : {}) },
      cost: travel.point + 0.5
    },
    { name: 'stage', requires: { mustStage: true }, effects: { staged: true }, cost: travel.stage + STAGING_WAIT },
    { name: 'capture', requires: { onPoint: true, enemyOnPoint: false }, effects: { pointOurs: true }, cost: situation.capture },
    // A bot with a post holds the point from there, and comes onto the point only to fight an enemy on it.
    {
      name: 'guardPoint',
      requires: { pointOurs: true },
      effects: { guarding: true, onPoint: true },
      cost: hasPost && !facts.enemyOnPoint ? Infinity : travel.point + 1
    },
    { name: 'holdPost', requires: { pointOurs: true }, effects: { guarding: true }, cost: hasPost && !facts.enemyOnPoint ? travel.post! + 1 : Infinity },
    // A sniper shoots what comes into its sights and never drives after a target.
    {
      name: 'approach',
      requires: { hasTarget: true },
      effects: { targetVisible: true, inFireZone: true },
      cost: role === 'sniper' ? Infinity : travel.approach + 0.5
    },
    { name: 'attackFront', requires: { inFireZone: true }, effects: killed, cost: situation.kill.front },
    {
      name: 'flank',
      requires: { hasTarget: true },
      effects: { behindTarget: true, targetVisible: true, inFireZone: true },
      cost: travel.flank * FLANK_COST[role] + 1
    },
    { name: 'attackRear', requires: { behindTarget: true, inFireZone: true }, effects: killed, cost: situation.kill.rear },
    { name: 'moveToSupport', requires: { allyNeedsHelp: true }, effects: { attackerInRange: true }, cost: travel.support },
    { name: 'suppress', requires: { attackerInRange: true }, effects: { allyCovered: true }, cost: role === 'support' ? 0.5 : 1.5 },
    { name: 'takeCover', requires: {}, effects: { inCover: true, safe: true, underFire: false }, cost: travel.cover + 0.5 },
    { name: 'retreat', requires: { atBase: false }, effects: { atBase: true, safe: true }, cost: travel.base },
    { name: 'repair', requires: { atBase: true }, effects: { repaired: true, combatReady: true, coreOpen: false, armorLow: false }, cost: REPAIR_TIME },
    { name: 'regroup', requires: {}, effects: { regrouped: true }, cost: travel.rally + 1 },
    // A kit mends on the spot, with no wait as at the base, for every class alike, but only part of the damage.
    {
      name: 'pickUpKit',
      requires: {},
      effects: situation.kitRestores ? { combatReady: true, coreOpen: false, armorLow: false } : { coreOpen: false },
      cost: travel.kit
    },
    // A sniper guards the point from its perch instead of on it.
    { name: 'goToPerch', requires: {}, effects: { atPerch: true, inCover: false }, cost: perches ? (travel.perch ?? Infinity) + 0.5 : Infinity },
    { name: 'overwatch', requires: { atPerch: true }, effects: { guarding: true }, cost: perches ? 1 : Infinity },
    { name: 'openWay', requires: {}, effects: { wayOpened: true }, cost: (travel.breach ?? Infinity) + BREAK_TIME }
  ];

  if (role === 'sniper') {
    const guard = actions.find((action) => action.name === 'guardPoint')!;
    guard.cost = Infinity;
  }

  // Every action takes some effort, so of two equally quick plans the shorter one wins.
  return actions.map((action) => ({ ...action, cost: action.cost + ACTION_EFFORT }));
}

/** Seconds added to every action. */
const ACTION_EFFORT = 0.25;
/** Priority each role adds to taking the point, and a flanker adds to rushing a point no enemy stands on. */
const CAPTURE_BONUS: Record<Role, number> = { assault: 5, flank: 0, support: 0, lead: 6, sniper: -20 };
const RUSH = 8;
/** Priority taking the point loses while it is locked. */
const LOCKED_WAIT = 15;
/** Priority the lead adds to holding its ground, and a sniper gives to watching the point while others take it. */
const LEAD_HOLD = 12;
const OVERWATCH = 56;
/** How a role prices working round to an enemy's rear: cheap for flankers, dear for the slow and the far. */
const FLANK_COST: Record<Role, number> = { assault: 1.4, flank: 0.55, support: 1.4, lead: 2.5, sniper: Infinity };
/** Priority bonus of the goal being pursued. */
const COMMITMENT = 6;
/** Priority of answering the team's call to regroup. */
const REGROUP = 85;
/** Priority of mending for a badly hit bot while its team falls back, and of covering the retreat from a perch. */
const FALL_BACK = 82;
const COVER_RETREAT = 70;
/** Priority of breaking open a wall the team asked for, and the seconds breaking it is reckoned to take. */
const BREACH = 58;
const BREAK_TIME = 4;
/** Priority a target out of the bot's fire zone loses while the team gathers for a push. */
const STAGE_RESTRAINT = 15;
/** Seconds a bot expects to wait at its staging spot for the rest of the team. */
const STAGING_WAIT = 2;
/** Seconds of mending at the base. */
const REPAIR_TIME = 4;
/** Seconds of driving to a repair kit that a bot with armor merely chipped makes a detour for. */
const KIT_DETOUR = 4;
