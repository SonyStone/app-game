import type { Chronicle } from './chronicle';
import { KOTH_MAP, onPoint, type KothMap } from './map';

/**
 * The best kills of a match, from its chronicle, best first, at most `count` and none within
 * `APART` s of a better one, as a run of kills is one moment. A kill scores for its range, a
 * point for every `RANGE_POINT` px, for the kills its killer made just before it (`streak`, within
 * `STREAK` s), for a killer with little armor left (`hurt`), for a victim on the point (`point`)
 * and for the player's own part in it, as killer or victim. Kills of a tank by its own side or by
 * nobody do not count.
 */
export function bestKills(chronicle: Chronicle, count = 3, map: KothMap = KOTH_MAP) {
  const scored = chronicle.kills.flatMap((kill) => {
    const killer = chronicle.members.findIndex((member) => member.id === kill.killer);
    const victim = chronicle.members.findIndex((member) => member.id === kill.victim);

    if (killer < 0 || victim < 0) {
      return [];
    }

    // The killer as last sampled at or before the kill.
    const pose = chronicle.samples[Math.min(Math.floor(kill.step / chronicle.every), chronicle.samples.length - 1)]?.[killer] ?? undefined;
    const range = pose ? Math.round(Math.hypot(pose[0] - kill.x, pose[1] - kill.y)) : 0;
    const streak = chronicle.kills.filter((other) => other.killer === kill.killer && other.step <= kill.step && other.step > kill.step - STREAK * 60).length;
    const hurt = pose !== undefined && pose[4] < HURT;
    const point = onPoint(map, kill);
    const player = chronicle.members[killer].human || chronicle.members[victim].human;
    const score = range / RANGE_POINT + (streak - 1) * 3 + (hurt ? 2 : 0) + (point ? 2 : 0) + (player ? 2.5 : 0);

    return [
      {
        step: kill.step,
        killer: kill.killer!,
        killerClass: kill.killerClass,
        victim: kill.victim,
        victimClass: kill.victimClass,
        range,
        streak,
        hurt,
        point,
        score
      }
    ];
  });
  const best: typeof scored = [];

  for (const kill of scored.sort((a, b) => b.score - a.score)) {
    if (best.length < count && best.every((other) => Math.abs(other.step - kill.step) > APART * 60)) {
      best.push(kill);
    }
  }

  return best;
}

/** A kill of `bestKills`. */
export type Highlight = ReturnType<typeof bestKills>[number];

/** Pixels of range worth a point, and the range from which a kill is a long shot. */
const RANGE_POINT = 150;
export const LONG_SHOT = 450;
/** Seconds within which a killer's kills make a streak. */
const STREAK = 6;
/** Armor left, 0-1, below which a killer is hurt. */
const HURT = 0.3;
/** Seconds two best kills lie apart at least. */
const APART = 4;
