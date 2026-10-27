import type { Chronicle } from './chronicle';
import { inBase, KOTH_MAP, onPoint, type KothMap } from './map';
import type { Recording } from './recording';

/**
 * What a recorded match came to, read from its chronicle alone, so it reads recordings of any
 * game version: the winner, every member's score, lives and where and doing what it spent them,
 * the kills in order and the radio's lines. Shares are of the member's time alive; `goals` and
 * `actions` count a bot's time from each thought to its next one or its death.
 *
 * The bands of `where` are by distance from the point, as the scenarios measure positions: on the
 * point, near it (to 300 px), the middle (to 540 px), a Sniper's perch (540-680 px), far, and
 * in the member's own base, which counts first.
 */
export function reportOf(recording: Recording, map: KothMap = KOTH_MAP) {
  const chronicle = recording.chronicle;
  const seconds = (steps: number) => round(steps / 60, 1);
  const lastStep = recording.steps;
  const winner = chronicle.capture.findLast((entry) => entry.winner)?.winner;
  const firstCapture = chronicle.capture.find((entry) => entry.owner);

  return {
    seed: recording.setup.seed,
    build: recording.build,
    duration: seconds(lastStep),
    winner,
    wonAt: winner ? seconds(chronicle.capture.find((entry) => entry.winner)!.step) : undefined,
    firstCapture: firstCapture && { team: firstCapture.owner, at: seconds(firstCapture.step) },
    members: chronicle.members.map((member, index) => memberReport(chronicle, member, index, map, lastStep)),
    kills: chronicle.kills.map((kill) => ({
      at: seconds(kill.step),
      killer: kill.killer === undefined ? undefined : nameOf(chronicle, kill.killer),
      killerClass: kill.killerClass,
      victim: nameOf(chronicle, kill.victim),
      victimClass: kill.victimClass,
      x: Math.round(kill.x),
      y: Math.round(kill.y)
    })),
    radio: countBy(chronicle.radio.map((callout) => `${chronicle.members[callout.member].team} ${callout.line}`))
  };
}

/** A report of `reportOf`. */
export type ReplayReport = ReturnType<typeof reportOf>;

/** `report` as plain text, a table of the members and the kills in order, for a terminal. */
export function formatReport(report: ReplayReport) {
  const lines = [
    `seed ${report.seed}, ${report.duration} s, build ${report.build.commit}${report.build.dirty ? ` + ${report.build.diff}` : ''}`,
    `winner ${report.winner ?? 'none'}${report.wonAt === undefined ? '' : ` at ${report.wonAt} s`}; first capture ${report.firstCapture ? `${report.firstCapture.team} at ${report.firstCapture.at} s` : 'none'}`,
    '',
    'member       classes                 K   D  alive s  life s  point  near  mid  perch  far  base  moved px/s'
  ];

  for (const member of report.members) {
    const where = member.where;
    lines.push(
      [
        member.name.padEnd(12),
        member.classes.join(',').padEnd(22),
        String(member.kills).padStart(2),
        String(member.deaths).padStart(3),
        String(member.alive).padStart(8),
        String(member.meanLife).padStart(7),
        ...(['point', 'near', 'middle', 'perch', 'far', 'base'] as const).map((band, column) => percent(where[band]).padStart([6, 5, 4, 6, 4, 5][column])),
        String(member.speed).padStart(11)
      ].join(' ')
    );
  }

  lines.push('', 'what the bots did, by share of their time alive');

  for (const member of report.members.filter((entry) => Object.keys(entry.goals).length > 0)) {
    lines.push(`  ${member.name}: ${shares(member.goals)}`, `    ${shares(member.actions)}`);
  }

  lines.push('', 'kills');

  for (const kill of report.kills) {
    lines.push(`  ${String(kill.at).padStart(6)} s  ${kill.killer ?? '—'} (${kill.killerClass ?? '—'}) → ${kill.victim} (${kill.victimClass}) at ${kill.x}, ${kill.y}`);
  }

  lines.push('', `radio: ${Object.entries(report.radio).map(([line, count]) => `${line} ${count}`).join(', ')}`);
  return lines.join('\n');
}

/** What one member did over the match. */
function memberReport(chronicle: Chronicle, member: Chronicle['members'][number], index: number, map: KothMap, lastStep: number) {
  const where = { point: 0, near: 0, middle: 0, perch: 0, far: 0, base: 0 };
  let alive = 0;
  let moved = 0;
  let previous: [number, number] | undefined;

  for (const row of chronicle.samples) {
    const pose = row[index];

    if (!pose) {
      previous = undefined;
      continue;
    }

    alive++;
    const at = { x: pose[0], y: pose[1] };
    where[bandOf(map, member.team, at)]++;

    if (previous) {
      moved += Math.hypot(at.x - previous[0], at.y - previous[1]);
    }

    previous = [at.x, at.y];
  }

  const aliveSeconds = (alive * chronicle.every) / 60;
  const lives = chronicle.spawns.filter((spawn) => spawn.member === member.id);
  const deaths = chronicle.kills.filter((kill) => kill.victim === member.id).length;
  const { goals, actions } = timeShares(chronicle, member.id, lastStep, alive * chronicle.every);

  return {
    name: member.name,
    team: member.team,
    classes: [...new Set(lives.map((life) => life.tankClass))],
    kills: chronicle.kills.filter((kill) => kill.killer === member.id).length,
    deaths,
    alive: round(aliveSeconds, 0),
    meanLife: round(aliveSeconds / Math.max(lives.length, 1), 0),
    where: Object.fromEntries(Object.entries(where).map(([band, count]) => [band, round(count / Math.max(alive, 1), 2)])) as typeof where,
    speed: round(moved / Math.max(aliveSeconds, 1e-9), 0),
    goals,
    actions
  };
}

/** Where `at` is, as the bands of `reportOf`. */
function bandOf(map: KothMap, team: Chronicle['members'][number]['team'], at: { x: number; y: number }) {
  if (inBase(map.bases[team], at)) {
    return 'base';
  }

  if (onPoint(map, at)) {
    return 'point';
  }

  const distance = Math.hypot(at.x - map.point.x, at.y - map.point.y);
  return distance < 300 ? 'near' : distance < 540 ? 'middle' : distance <= 680 ? 'perch' : 'far';
}

/** Shares of a bot's time alive in each goal and action, from each of its thoughts to its next one or its death. */
function timeShares(chronicle: Chronicle, member: number, lastStep: number, aliveSteps: number) {
  const thoughts = chronicle.thoughts.filter((thought) => thought.member === member);
  const deaths = chronicle.kills.filter((kill) => kill.victim === member).map((kill) => kill.step);
  const goals: Record<string, number> = {};
  const actions: Record<string, number> = {};

  thoughts.forEach((thought, index) => {
    const next = thoughts[index + 1]?.step ?? lastStep;
    const end = Math.min(next, deaths.find((death) => death > thought.step) ?? Infinity);
    const length = Math.max(end - thought.step, 0);
    goals[thought.goal ?? '—'] = (goals[thought.goal ?? '—'] ?? 0) + length;
    actions[thought.action ?? '—'] = (actions[thought.action ?? '—'] ?? 0) + length;
  });

  const shareOf = (counts: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .map(([key, steps]) => [key, round(steps / Math.max(aliveSteps, 1), 2)])
    );

  return { goals: shareOf(goals), actions: shareOf(actions) };
}

function nameOf(chronicle: Chronicle, id: number) {
  return chronicle.members.find((member) => member.id === id)?.name ?? `#${id}`;
}

function countBy(keys: string[]) {
  const counts: Record<string, number> = {};

  for (const key of keys) {
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function shares(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([key, share]) => `${key} ${percent(share)}`)
    .join(', ');
}

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
