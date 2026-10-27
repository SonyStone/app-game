import { TANK_CLASS_IDS, type TankClassId } from '../tanks';

/**
 * Picks the classes of a team's bots the way a sensible Team Fortress 2 team fills its slots:
 *
 * - Every team has a blast class, a Soldier or a Demoman, to break Heavies and cover, and a fast
 *   capper, a Scout or a Soldier.
 * - No class is taken more than `rosterLimits` allows for the team's size: one Sniper and one
 *   Heavy in a team of four, so a small team never fields two casemate guns.
 * - The rest is drawn by `ROSTER_WEIGHTS`, so matches differ but Soldiers stay the most common.
 *
 * @param size - Seats in the team.
 * @param taken - Classes of seats the bots do not fill, such as the player's.
 * @param random - Source of randomness in [0, 1).
 * @returns The classes of the `size - taken.length` bot seats.
 */
export function pickRoster(size: number, taken: readonly TankClassId[], random: () => number) {
  const team = [...taken];
  const picked: TankClassId[] = [];

  while (team.length < size) {
    const next = neededClass(team, size, random);
    team.push(next);
    picked.push(next);
  }

  return picked;
}

/**
 * The class a bot should switch to at its next respawn so that the team, `team` with the bot's
 * seat left out, keeps within `rosterLimits` and has its must-have classes; `current` when it
 * already fits, so bots only switch when the team needs it, such as after the player took the
 * class a bot had.
 */
export function rebalance(team: readonly TankClassId[], current: TankClassId, size: number, random: () => number) {
  const limit = rosterLimits(size);
  const count = team.filter((id) => id === current).length;
  const missing = mustHave(team);

  if (count < limit[current] && (missing.length === 0 || missing.some((group) => group.includes(current)))) {
    return current;
  }

  return neededClass(team, size, random);
}

/**
 * The class a bot switches to at its next respawn when its class is not working out, as a Team
 * Fortress 2 player does, or `undefined` to keep it. In order:
 *
 * - One enemy class keeps destroying the bot, its last two tanks, or the team, `COUNTER_DEATHS`
 *   of its recent deaths with the bot's last among them: the class that counters it (see
 *   `COUNTERS`), a Scout to hunt a Sniper and a Sniper to break a Heavy from afar, even when a
 *   teammate already has it.
 * - The bot destroyed at most one tank in its last `STRUGGLE_LIVES` lives: the class the team
 *   lacks most, a Heavy to lead its pushes, then a Demoman, then a Soldier, else the counter to
 *   what destroyed it most, else any other class the team has room for.
 *
 * The switch keeps within `rosterLimits`, and a bot switches at most once in `SWITCH_COOLDOWN` s,
 * so it gives a new class a fair try.
 *
 * @param team - Classes of the bot's teammates, its own seat left out.
 * @param lives - The bot's lives, oldest first: what it destroyed and what destroyed it.
 * @param teamDeaths - What destroyed each member of the team lately.
 * @param switchedAgo - Seconds since the bot last switched class this way.
 */
export function adaptClass(
  current: TankClassId,
  situation: {
    team: readonly TankClassId[];
    size: number;
    lives: readonly { kills: number; killer: TankClassId | undefined }[];
    teamDeaths: readonly (TankClassId | undefined)[];
    switchedAgo: number;
  }
): TankClassId | undefined {
  const { team, lives, teamDeaths } = situation;
  const limit = rosterLimits(situation.size);
  const fits = (id: TankClassId) => id !== current && team.filter((other) => other === id).length < limit[id];
  const killers = lives.map((life) => life.killer);
  const lastKiller = killers[killers.length - 1];

  if (situation.switchedAgo < SWITCH_COOLDOWN) {
    return undefined;
  }

  const hunted = lastKiller !== undefined && (killers.slice(-2).filter((killer) => killer === lastKiller).length === 2 || teamDeaths.filter((killer) => killer === lastKiller).length >= COUNTER_DEATHS);
  const counter = lastKiller && COUNTERS[lastKiller];

  if (hunted && counter && fits(counter)) {
    return counter;
  }

  const recent = lives.slice(-STRUGGLE_LIVES);
  const struggling = recent.length >= STRUGGLE_LIVES && recent.reduce((sum, life) => sum + life.kills, 0) <= 1;

  if (!struggling) {
    return undefined;
  }

  const lacking = (['heavy', 'demoman', 'soldier'] as const).find((id) => !team.includes(id) && fits(id));
  const worst = mostCommon(killers.filter((killer): killer is TankClassId => killer !== undefined));
  const answer = worst && COUNTERS[worst];
  return lacking ?? (answer && fits(answer) ? answer : TANK_CLASS_IDS.find((id) => fits(id) && !team.includes(id)));
}

/**
 * The class that answers an enemy class that keeps destroying a team: a Scout gets round to a
 * Sniper and kills it up close, a Sniper's rail goes through a Heavy's plates from beyond its
 * reach. Other classes have no clear answer.
 */
const COUNTERS: Partial<Record<TankClassId, TankClassId>> = { sniper: 'scout', heavy: 'sniper' };

/** The value `values` has most often, the latest among equals; `undefined` for none. */
function mostCommon<T>(values: readonly T[]) {
  let best: T | undefined;
  let most = 0;

  for (const value of values) {
    const count = values.filter((other) => other === value).length;

    if (count >= most) {
      best = value;
      most = count;
    }
  }

  return best;
}

/** Recent deaths of a team to one enemy class that make a bot it destroyed switch to counter it. */
const COUNTER_DEATHS = 3;
/** Lives in which a bot destroying at most one tank tries another class. */
const STRUGGLE_LIVES = 3;
/** Seconds a bot keeps a class it switched to before it may switch again. */
export const SWITCH_COOLDOWN = 60;

/** The next class a team of `team` needs: a missing must-have first, then a weighted draw within the limits. */
function neededClass(team: readonly TankClassId[], size: number, random: () => number): TankClassId {
  const limit = rosterLimits(size);
  const open = TANK_CLASS_IDS.filter((id) => team.filter((member) => member === id).length < limit[id]);
  const missing = mustHave(team)[0];
  const choices = missing ? open.filter((id) => missing.includes(id)) : open;
  const pool = choices.length > 0 ? choices : open.length > 0 ? open : ['soldier' as const];
  const total = pool.reduce((sum, id) => sum + ROSTER_WEIGHTS[id], 0);
  let draw = random() * total;

  for (const id of pool) {
    draw -= ROSTER_WEIGHTS[id];

    if (draw <= 0) {
      return id;
    }
  }

  return pool[pool.length - 1];
}

/** Groups of classes of which a team needs at least one each, that `team` has none of yet. */
function mustHave(team: readonly TankClassId[]) {
  return MUST_HAVE.filter((group) => !group.some((id) => team.includes(id)));
}

/** A team needs something to break Heavies and cover with, and something quick on the point. */
const MUST_HAVE: readonly (readonly TankClassId[])[] = [
  ['soldier', 'demoman'],
  ['scout', 'soldier']
];

/** How likely each class is drawn for an open seat. */
const ROSTER_WEIGHTS: Record<TankClassId, number> = { scout: 2, soldier: 3, heavy: 2, demoman: 2, sniper: 1.5 };

/** Most tanks of each class a team of `size` takes: one Sniper and one Heavy per four seats, two of the others. */
function rosterLimits(size: number): Record<TankClassId, number> {
  const quarter = Math.max(Math.floor(size / 4), 1);
  return { scout: 2 * quarter, soldier: 2 * quarter, heavy: quarter, demoman: 2 * quarter, sniper: quarter };
}
