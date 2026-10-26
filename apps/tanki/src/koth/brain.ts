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
 * rear, supports cover allies, anchors hold the point and snipers watch it from a perch.
 */
export type Role = 'assault' | 'flank' | 'support' | 'anchor' | 'sniper';

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
 * - `coreOpen`, `armorLow`, `underFire`, `inCover`, `safe`, `atBase`, `repaired`: the bot's health
 *   and exposure.
 * - `allyNeedsHelp`: the team asked this bot to help an ally under fire; `attackerInRange` and
 *   `allyCovered` follow from helping.
 * - `regroupCalled`, `regrouped`: the team is too weak to fight and gathers to wait for respawns.
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
  | 'allyNeedsHelp'
  | 'attackerInRange'
  | 'allyCovered'
  | 'regroupCalled'
  | 'regrouped'
  | 'atPerch'
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
  | 'pickUpKit'
  | 'regroup'
  | 'goToPerch'
  | 'overwatch';

/** Everything a bot plans from. */
export type Situation = {
  role: Role;
  facts: Partial<Record<BotFact, boolean>>;
  /**
   * Seconds of driving to each place the bot's actions lead to, `Infinity` where there is no
   * such place or no way there: the bot's spot on the point, its staging spot for a push, a
   * firing position on its target, a spot behind the target, a spot beside the ally it helps,
   * the nearest cover, its base, the team's rally point, the repair kit most worth taking, a
   * small kit counting a little longer than it is for mending less, and a sniper's perch.
   */
  travel: Record<'point' | 'stage' | 'approach' | 'flank' | 'support' | 'cover' | 'base' | 'rally' | 'kit', number> & { perch?: number };
  /** Seconds the bot expects to need to destroy its target from where it is and from behind. */
  kill: { front: number; rear: number };
  /** Seconds a capture would take with the bot's team on the point. */
  capture: number;
  /** How close the enemy is to winning, 0-1, which makes taking the point more urgent. */
  enemyClock: number;
  /** Destroying the target leaves no enemy on the point. */
  targetClearsPoint: boolean;
  /** Priority the bot's class adds to taking the point, on top of its role's (see `ClassTactics.point`); defaults to 0. */
  eagerness?: number;
  /** The goal the bot pursues now; it gets a bonus so that close calls do not flip plans. */
  current?: BotGoal;
};

/**
 * The goals a bot could pursue now, with priorities from its situation. Goals that do not apply
 * are left out: a healthy bot has no reason to repair. Roles weigh them differently: a flanker
 * rushes a point nobody holds, as a Scout takes it twice as fast; an anchor holds the point;
 * a sniper watches it from its perch rather than standing on it, unless all is at stake.
 */
export function botGoals(situation: Situation): GoapGoal<BotGoal>[] {
  const { facts, role } = situation;
  const desperate = situation.enemyClock > 0.85 && !facts.pointOurs;
  const goals: GoapGoal<BotGoal>[] = [];

  // An open core means the next hit is fatal, so the bot gets out of fire and off to mend it.
  // Armor merely chipped away is worth mending only when nothing more pressing goes on, since the
  // base is a long drive away, or when a repair kit lies nearer than the base and close by.
  const kitNear = situation.travel.kit < Math.min(situation.travel.base, KIT_DETOUR);

  if (facts.coreOpen && facts.underFire && !facts.inCover) {
    goals.push({ name: 'survive', wants: { safe: true }, priority: desperate ? 50 : 90 });
  }

  if (facts.coreOpen) {
    goals.push({ name: 'repair', wants: { repaired: true }, priority: desperate ? 40 : 75 });
  } else if (facts.armorLow) {
    goals.push({ name: 'repair', wants: { repaired: true }, priority: desperate ? 30 : kitNear ? 58 : 46 });
  }

  if (!facts.pointOurs) {
    // A locked point cannot be taken yet, so enemies in the way are worth more until it opens.
    const rush = role === 'flank' && !facts.enemyOnPoint && !facts.pointLocked ? RUSH : 0;
    const wait = facts.pointLocked ? LOCKED_WAIT : 0;
    const eager = CAPTURE_BONUS[role] + (situation.eagerness ?? 0);
    goals.push({
      name: 'capture',
      wants: { pointOurs: true },
      priority: 50 + 35 * situation.enemyClock + eager + rush - wait
    });
  } else {
    goals.push({ name: 'defend', wants: { guarding: true }, priority: (facts.enemyOnPoint ? 68 : 45) + (role === 'anchor' ? ANCHOR_HOLD : 0) });
  }

  if (role === 'sniper' && !facts.pointOurs) {
    goals.push({ name: 'defend', wants: { guarding: true }, priority: OVERWATCH });
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
      cost: travel.flank * FLANK_COST[role] + 1
    },
    { name: 'attackRear', requires: { behindTarget: true, inFireZone: true }, effects: killed, cost: situation.kill.rear },
    { name: 'moveToSupport', requires: { allyNeedsHelp: true }, effects: { attackerInRange: true }, cost: travel.support },
    { name: 'suppress', requires: { attackerInRange: true }, effects: { allyCovered: true }, cost: role === 'support' ? 0.5 : 1.5 },
    { name: 'takeCover', requires: {}, effects: { inCover: true, safe: true, underFire: false }, cost: travel.cover + 0.5 },
    { name: 'retreat', requires: { atBase: false }, effects: { atBase: true, safe: true }, cost: travel.base },
    { name: 'repair', requires: { atBase: true }, effects: { repaired: true }, cost: REPAIR_TIME },
    { name: 'regroup', requires: {}, effects: { regrouped: true }, cost: travel.rally + 1 },
    // A kit mends on the spot, with no wait as at the base, for every class alike.
    { name: 'pickUpKit', requires: {}, effects: { repaired: true, coreOpen: false, armorLow: false }, cost: travel.kit },
    // A sniper guards the point from its perch instead of on it.
    { name: 'goToPerch', requires: {}, effects: { atPerch: true, inCover: false }, cost: role === 'sniper' ? (travel.perch ?? Infinity) + 0.5 : Infinity },
    { name: 'overwatch', requires: { atPerch: true }, effects: { guarding: true }, cost: role === 'sniper' ? 1 : Infinity }
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
const CAPTURE_BONUS: Record<Role, number> = { assault: 5, flank: 0, support: 0, anchor: 6, sniper: -20 };
const RUSH = 8;
/** Priority taking the point loses while it is locked. */
const LOCKED_WAIT = 15;
/** Priority an anchor adds to holding the point, and a sniper gives to watching it while others take it. */
const ANCHOR_HOLD = 12;
const OVERWATCH = 56;
/** How a role prices working round to an enemy's rear: cheap for flankers, dear for the slow and the far. */
const FLANK_COST: Record<Role, number> = { assault: 1.4, flank: 0.55, support: 1.4, anchor: 2.5, sniper: 3 };
/** Priority bonus of the goal being pursued. */
const COMMITMENT = 6;
/** Seconds a bot expects to wait at its staging spot for the rest of the team. */
const STAGING_WAIT = 2;
/** Seconds of mending at the base. */
const REPAIR_TIME = 4;
/** Seconds of driving to a repair kit that a bot with armor merely chipped makes a detour for. */
const KIT_DETOUR = 4;
