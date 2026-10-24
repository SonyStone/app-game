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
