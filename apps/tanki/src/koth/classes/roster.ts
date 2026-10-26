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
 * - An enemy Sniper keeps picking the team off (`COUNTER_DEATHS` of the team's recent deaths, the
 *   bot's own last one among them) and the team has no Scout: a Scout, which hunts Snipers.
 * - An enemy Heavy keeps grinding the team down the same way and the team has no Sniper: a
 *   Sniper, whose rail goes through the Heavy's plates from afar.
 * - The bot destroyed nothing in its last `STRUGGLE_LIVES` lives: the class the team lacks most,
 *   a Heavy to lead its pushes, then a Demoman, then a Soldier.
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
  const lastKiller = lives[lives.length - 1]?.killer;
  const pickedOff = (by: TankClassId) => lastKiller === by && teamDeaths.filter((killer) => killer === by).length >= COUNTER_DEATHS;

  if (situation.switchedAgo < SWITCH_COOLDOWN) {
    return undefined;
  }

  if (pickedOff('sniper') && !team.includes('scout') && fits('scout')) {
    return 'scout';
  }

  if (pickedOff('heavy') && !team.includes('sniper') && fits('sniper')) {
    return 'sniper';
  }

  const struggling = lives.length >= STRUGGLE_LIVES && lives.slice(-STRUGGLE_LIVES).every((life) => life.kills === 0);
  return struggling ? (['heavy', 'demoman', 'soldier'] as const).find((id) => !team.includes(id) && fits(id)) : undefined;
}

/** Recent deaths of a team to one enemy class that make a bot it destroyed switch to counter it. */
const COUNTER_DEATHS = 3;
/** Lives in a row without destroying anything after which a bot tries a class its team lacks. */
const STRUGGLE_LIVES = 2;
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
