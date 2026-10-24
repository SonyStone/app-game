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

/** A bot's job in its team: assaults go for the point, flankers for the enemy's rear, supports cover allies. */
export type Role = 'assault' | 'flank' | 'support';

/**
 * Facts a bot plans with; missing ones are false.
 *
 * - `onPoint`, `pointOurs`, `enemyOnPoint`: where the bot and the fight for the point stand.
 * - `mustStage`: the team is gathering for a coordinated push, so nobody goes in alone;
 *   `staged` means the push has begun.
 * - `hasTarget`: an enemy to fight is known; `targetNearPoint`, `targetVisible`, `inFireZone`
 *   (visible and in range), `behindTarget` (in its rear arc, where the core is) and
 *   `targetCoreOpen` describe it.
 * - `coreOpen`, `armorLow`, `underFire`, `inCover`, `safe`, `atBase`, `repaired`: the bot's health
 *   and exposure.
 * - `allyNeedsHelp`: the team asked this bot to help an ally under fire; `attackerInRange` and
 *   `allyCovered` follow from helping.
 * - `regroupCalled`, `regrouped`: the team is too weak to fight and gathers to wait for respawns.
 * - Goal results that never hold in the world: `targetDown`, `guarding`.
 */
export type BotFact =
  | 'onPoint'
  | 'pointOurs'
  | 'enemyOnPoint'
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
  | 'allyNeedsHelp'
  | 'attackerInRange'
  | 'allyCovered'
  | 'regroupCalled'
  | 'regrouped'
  | 'guarding';

/** Names of the bot's goals. */
export type BotGoal = 'survive' | 'repair' | 'capture' | 'defend' | 'kill' | 'support' | 'regroup';

/** Names of the bot's actions; the bot has a behavior for each. */
export type BotAction =
  | 'goToPoint'
  | 'stage'
  | 'capture'
  | 'guardPoint'
  | 'approach'
  | 'attackFront'
  | 'flank'
  | 'attackRear'
  | 'moveToSupport'
  | 'suppress'
  | 'takeCover'
  | 'retreat'
  | 'repair'
  | 'regroup';

/** Everything a bot plans from. */
export type Situation = {
  role: Role;
  facts: Partial<Record<BotFact, boolean>>;
  /**
   * Seconds of driving to each place the bot's actions lead to, `Infinity` where there is no
   * such place or no way there: the bot's spot on the point, its staging spot for a push, a
   * firing position on its target, a spot behind the target, a spot beside the ally it helps,
   * the nearest cover, its base and the team's rally point.
   */
  travel: Record<'point' | 'stage' | 'approach' | 'flank' | 'support' | 'cover' | 'base' | 'rally', number>;
  /** Seconds the bot expects to need to destroy its target from where it is and from behind. */
  kill: { front: number; rear: number };
  /** Seconds a capture would take with the bot's team on the point. */
  capture: number;
  /** How close the enemy is to winning, 0-1, which makes taking the point more urgent. */
  enemyClock: number;
  /** Destroying the target leaves no enemy on the point. */
  targetClearsPoint: boolean;
  /** The goal the bot pursues now; it gets a bonus so that close calls do not flip plans. */
  current?: BotGoal;
};

/**
 * The goals a bot could pursue now, with priorities from its situation. Goals that do not apply
 * are left out: a healthy bot has no reason to repair.
 */
export function botGoals(situation: Situation): GoapGoal<BotGoal>[] {
  const { facts, role } = situation;
  const desperate = situation.enemyClock > 0.85 && !facts.pointOurs;
  const goals: GoapGoal<BotGoal>[] = [];

  // An open core means the next hit is fatal, so the bot gets out of fire and home to mend it.
  // Armor merely chipped away is worth mending only when nothing more pressing goes on, since the
  // base is a long drive away.
  if (facts.coreOpen && facts.underFire && !facts.inCover) {
    goals.push({ name: 'survive', wants: { safe: true }, priority: desperate ? 50 : 90 });
  }

  if (facts.coreOpen) {
    goals.push({ name: 'repair', wants: { repaired: true }, priority: desperate ? 40 : 75 });
  } else if (facts.armorLow) {
    goals.push({ name: 'repair', wants: { repaired: true }, priority: desperate ? 30 : 46 });
  }

  if (!facts.pointOurs) {
    goals.push({ name: 'capture', wants: { pointOurs: true }, priority: 50 + 35 * situation.enemyClock + (role === 'assault' ? 5 : 0) });
  } else {
    goals.push({ name: 'defend', wants: { guarding: true }, priority: facts.enemyOnPoint ? 68 : 45 });
  }

  if (facts.hasTarget) {
    // Holding the point, a bot fights what comes near it rather than chasing enemies across the map.
    const holding = facts.pointOurs && !facts.targetNearPoint && role !== 'flank';
    // A target with its core open dies to the next hit, which is worth more than most else.
    const finishing = facts.targetCoreOpen && facts.targetVisible ? 25 : 0;
    const priority =
      (holding ? 40 : (facts.targetVisible ? 55 : 42) + (role === 'flank' ? 8 : 0) + (facts.pointOurs && facts.enemyOnPoint ? 10 : 0)) + finishing;
    goals.push({ name: 'kill', wants: { targetDown: true }, priority });
  }

  if (facts.allyNeedsHelp) {
    goals.push({ name: 'support', wants: { allyCovered: true }, priority: role === 'support' ? 72 : 52 });
  }

  if (facts.regroupCalled && !desperate) {
    goals.push({ name: 'regroup', wants: { regrouped: true }, priority: 66 });
  }

  return goals.map((goal) => (goal.name === situation.current ? { ...goal, priority: goal.priority + COMMITMENT } : goal));
}

/**
 * The actions a bot can take, priced in seconds from its situation. Each `requires` and
 * `effects` is what the planner assumes, not a promise: the bot checks the world as it acts.
 */
export function botActions(situation: Situation): GoapAction<BotAction>[] {
  const { travel, role, facts } = situation;
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
    { name: 'guardPoint', requires: { pointOurs: true }, effects: { guarding: true, onPoint: true }, cost: travel.point + 1 },
    { name: 'approach', requires: { hasTarget: true }, effects: { targetVisible: true, inFireZone: true }, cost: travel.approach + 0.5 },
    { name: 'attackFront', requires: { inFireZone: true }, effects: killed, cost: situation.kill.front },
    {
      name: 'flank',
      requires: { hasTarget: true },
      effects: { behindTarget: true, targetVisible: true, inFireZone: true },
      cost: travel.flank * (role === 'flank' ? 0.55 : 1.4) + 1
    },
    { name: 'attackRear', requires: { behindTarget: true, inFireZone: true }, effects: killed, cost: situation.kill.rear },
    { name: 'moveToSupport', requires: { allyNeedsHelp: true }, effects: { attackerInRange: true }, cost: travel.support },
    { name: 'suppress', requires: { attackerInRange: true }, effects: { allyCovered: true }, cost: role === 'support' ? 0.5 : 1.5 },
    { name: 'takeCover', requires: {}, effects: { inCover: true, safe: true, underFire: false }, cost: travel.cover + 0.5 },
    { name: 'retreat', requires: { atBase: false }, effects: { atBase: true, safe: true }, cost: travel.base },
    { name: 'repair', requires: { atBase: true }, effects: { repaired: true }, cost: REPAIR_TIME },
    { name: 'regroup', requires: {}, effects: { regrouped: true }, cost: travel.rally + 1 }
  ];

  // Every action takes some effort, so of two equally quick plans the shorter one wins.
  return actions.map((action) => ({ ...action, cost: action.cost + ACTION_EFFORT }));
}

/** Seconds added to every action. */
const ACTION_EFFORT = 0.25;
/** Priority bonus of the goal being pursued. */
const COMMITMENT = 6;
/** Seconds a bot expects to wait at its staging spot for the rest of the team. */
const STAGING_WAIT = 2;
/** Seconds of mending at the base. */
const REPAIR_TIME = 4;
