import { beforeAll, describe, it } from 'vitest';
import type { Tank } from '../arena/bodies';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import { onPoint } from './map';
import { createKothMatch, type KothMatch } from './match';
import { PACE_DEFAULTS, type Pace } from './pace';
import { CAPTURE_RULES, rivalOf } from './rules';
import { TANK_CLASS_IDS, type TankClassId } from './tanks';
import type { Member } from './team';
import { harnessTuning } from './tuning';

/**
 * How the bots play king of the hill, by class, from full eight-bot matches: whether each class
 * keeps to its job and the team fights together. Per class, as shares of the time its tanks live:
 *
 * - `point`: on the point; `sit`: on a point the team holds with no enemy near it, where a tank
 *   only waits to be sniped; `ahead`: while the team holds the point, past it toward the enemy's
 *   base, holding the ground in front of the point.
 * - `range`: the mean distance to the nearest enemy in sight, while one is.
 * - `alone`: of the time an enemy is in sight, the share with no ally within `ALLY_NEAR` px.
 * - `still`: standing still (under `STILL_SPEED` px/s) outside the base.
 * - `kit wait`: seconds per life spent waiting beside a repair kit that is not back yet.
 * - Kills against deaths, deaths per minute alive, and the actions each class spends most time in.
 *
 * For the matches: the winner, when the point was first taken, how often it changed hands, and
 * lines the bots said, if they say any.
 *
 * Slow, so it runs only with
 * `TANKI_TACTICS=1 pnpm exec vitest run src/koth/tactics.harness.test.ts --reporter=verbose`.
 * `TANKI_SEEDS` replaces the seeds with a comma-separated list; `TANKI_TUNING` applies a tuning
 * from the pause menu's class editor (see `harnessTuning`); `TANKI_ROSTER` sets the classes of
 * both teams, as `sniper,soldier,heavy,demoman` for the same four a side, or
 * `sniper,soldier,heavy,demoman/scout,soldier,soldier,demoman` for red, then blue.
 */
describe.skipIf(!import.meta.env.TANKI_TACTICS)('bot tactics', () => {
  let rapier: Rapier;

  beforeAll(async () => {
    rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
    applyClassTuning(TUNED.tuning.classes);
  });

  it('plays eight-bot matches and sums up how every class plays', () => {
    const seeds = import.meta.env.TANKI_SEEDS?.split(',').map(Number) ?? [11, 23, 37, 41, 53, 67, 71, 89];
    const totals = new Map<TankClassId, ClassTally>();
    const said = new Map<string, number>();
    const lines: string[] = [];

    for (const seed of seeds) {
      const match = createMatch(rapier, seed);
      const summary = playMatch(match, totals, said);
      lines.push(`seed ${seed}: ${summary}`);
    }

    lines.push('', 'class      seats   K/D  deaths/min  point   sit  ahead  range  alone  still  kit wait/life');

    for (const id of TANK_CLASS_IDS) {
      const tally = totals.get(id);

      if (!tally || tally.alive === 0) {
        continue;
      }

      const share = (value: number, of: number) => `${Math.round((value / Math.max(of, 1e-9)) * 100)}%`.padStart(5);
      lines.push(
        `${id.padEnd(10)} ${String(tally.seats).padStart(5)}  ${(tally.kills / Math.max(tally.deaths, 1)).toFixed(2).padStart(4)}  ${((tally.deaths / tally.alive) * 60).toFixed(2).padStart(10)}  ${share(tally.point, tally.alive)} ${share(tally.sit, tally.alive)}  ${share(tally.ahead, tally.held)}  ${(tally.range / Math.max(tally.contact, 1e-9)).toFixed(0).padStart(5)}  ${share(tally.alone, tally.contact)}  ${share(tally.still, tally.alive)}  ${(tally.kitWait / Math.max(tally.lives, 1)).toFixed(1).padStart(13)}`
      );
    }

    lines.push('', 'time in each action, share of life:');

    for (const id of TANK_CLASS_IDS) {
      const tally = totals.get(id);

      if (!tally || tally.alive === 0) {
        continue;
      }

      const actions = Object.entries(tally.actions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 7)
        .map(([action, time]) => `${action} ${Math.round((time / tally.alive) * 100)}%`);
      lines.push(`${id.padEnd(10)} ${actions.join(', ')}`);
    }

    lines.push('', 'standing still outside the base, by action, share of life:');

    for (const id of TANK_CLASS_IDS) {
      const tally = totals.get(id);

      if (!tally || tally.alive === 0) {
        continue;
      }

      const actions = Object.entries(tally.stillIn)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([action, time]) => `${action} ${Math.round((time / tally.alive) * 100)}%`);
      lines.push(`${id.padEnd(10)} ${actions.join(', ')}`);
    }

    const spoken = [...said].sort(([, a], [, b]) => b - a).map(([line, count]) => `${line} ${(count / seeds.length).toFixed(1)}`);
    lines.push('', `radio lines per match, both teams: ${spoken.join(', ') || 'none'}`);
    console.log(lines.join('\n'));
  }, 1_800_000);
});

/** What the harness adds up for a class over all matches, in seconds unless said otherwise. */
type ClassTally = {
  seats: number;
  lives: number;
  kills: number;
  deaths: number;
  alive: number;
  point: number;
  sit: number;
  /** Time alive while the team held the point, and of it the time past the point toward the enemy. */
  held: number;
  ahead: number;
  /** Time with an enemy in sight, the sum of the range to the nearest one over it, and of it the time with no ally near. */
  contact: number;
  range: number;
  alone: number;
  still: number;
  /** Time standing still by the action under way. */
  stillIn: Record<string, number>;
  kitWait: number;
  actions: Record<string, number>;
};

/** Plays `match` to its end or 300 s, adding to `totals` and counting the radio lines in `said`; returns a line about the match. */
function playMatch(match: KothMatch, totals: Map<TankClassId, ClassTally>, said: Map<string, number>) {
  const dt = 1 / 60;
  const heard = new Set<string>();
  const last = new Map<Member, { x: number; y: number }>();
  let firstCapture: number | undefined;
  let owner = match.capture.owner;
  let swaps = 0;

  while (match.time < 300 && !match.capture.winner) {
    match.step(dt);
    match.update(dt);
    firstCapture ??= match.capture.owner ? match.time : undefined;

    for (const callout of match.callouts()) {
      const key = `${callout.team}:${callout.id}`;

      if (!heard.has(key)) {
        heard.add(key);
        said.set(callout.line, (said.get(callout.line) ?? 0) + 1);
      }
    }

    if (match.capture.owner !== owner) {
      owner = match.capture.owner;
      swaps++;
    }

    for (const member of match.members) {
      const tally = tallyOf(totals, member.tankClass.id);
      const tank = member.tank;

      if (!tank) {
        last.delete(member);
        continue;
      }

      const at = tank.hull.translation();
      const before = last.get(member);
      last.set(member, { x: at.x, y: at.y });

      // A life is counted where it begins, so one cut short by the time limit counts too.
      if (!before) {
        tally.lives++;
      }

      tally.alive += dt;
      const here = onPoint(match.map, at);
      const held = match.capture.owner === member.team;
      const rivals = match.members.filter((other) => other.team !== member.team && other.tank);
      const threatNear = rivals.some((rival) => distance(rival.tank!.hull.translation(), match.map.point) < THREAT_NEAR);

      if (here) {
        tally.point += dt;

        if (held && !threatNear) {
          tally.sit += dt;
        }
      }

      if (held) {
        tally.held += dt;
        const toward = Math.sign(match.map.bases[rivalOf(member.team)].zone.x - match.map.point.x);

        if ((at.x - match.map.point.x) * toward > AHEAD) {
          tally.ahead += dt;
        }
      }

      const inSight = rivals
        .map((rival) => rival.tank!)
        .filter((enemy) => distance(enemy.hull.translation(), at) < SIGHT && match.combat.lineOfSight(at, enemy.hull.translation()));

      if (inSight.length > 0) {
        tally.contact += dt;
        tally.range += Math.min(...inSight.map((enemy: Tank) => distance(enemy.hull.translation(), at))) * dt;
        const allies = match.members.filter((other) => other !== member && other.team === member.team && other.tank);

        if (!allies.some((ally) => distance(ally.tank!.hull.translation(), at) < ALLY_NEAR)) {
          tally.alone += dt;
        }
      }

      const inBase = Math.abs(at.x - match.map.bases[member.team].zone.x) < match.map.bases[member.team].zone.halfWidth + 40;

      const bot = match.bots.get(member);
      const action = bot?.thought().action;

      if (before && !inBase && distance(before, at) / dt < STILL_SPEED) {
        tally.still += dt;
        tally.stillIn[action ?? 'none'] = (tally.stillIn[action ?? 'none'] ?? 0) + dt;
      }

      if (action === 'pickUpKit' && match.kits.kits.some((kit) => kit.readyAt > match.time && distance(kit, at) < KIT_NEAR)) {
        tally.kitWait += dt;
      }

      if (action) {
        tally.actions[action] = (tally.actions[action] ?? 0) + dt;
      }
    }
  }

  for (const member of match.members) {
    const tally = tallyOf(totals, member.tankClass.id);
    tally.seats++;
    tally.kills += member.kills;
    tally.deaths += member.deaths;
  }

  const roster = (team: 'red' | 'blue') =>
    match.members.filter((member) => member.team === team).map((member) => member.tankClass.id[0].toUpperCase() + member.tankClass.id.slice(1, 3));
  return `${roster('red').join(' ')} vs ${roster('blue').join(' ')} -> ${match.capture.winner ?? 'none'} at ${match.time.toFixed(0)} s, first capture ${firstCapture?.toFixed(0) ?? '-'} s, owner changes ${swaps}, kills ${match.members.reduce((sum, member) => sum + member.kills, 0)}`;
}

function tallyOf(totals: Map<TankClassId, ClassTally>, id: TankClassId) {
  let tally = totals.get(id);

  if (!tally) {
    tally = { seats: 0, lives: 0, kills: 0, deaths: 0, alive: 0, point: 0, sit: 0, held: 0, ahead: 0, contact: 0, range: 0, alone: 0, still: 0, stillIn: {}, kitWait: 0, actions: {} };
    totals.set(id, tally);
  }

  return tally;
}

/** An enemy this close to the point threatens it, so standing on it is no waste. */
const THREAT_NEAR = 350;
/** Pixels past the point's center toward the enemy's base that count as holding ground ahead of it. */
const AHEAD = 150;
/** How far a tank sees an enemy for `range` and `alone`, about a player's screen. */
const SIGHT = 600;
/** An ally this close keeps a tank from fighting alone. */
const ALLY_NEAR = 300;
const STILL_SPEED = 15;
/** A tank this close to a repair kit that is not back waits for it. */
const KIT_NEAR = 60;

/** The classes of both teams from `TANKI_ROSTER`, picked as in a match by default. */
const ROSTER = rosterFrom(import.meta.env.TANKI_ROSTER);

function rosterFrom(text: string | undefined) {
  if (!text) {
    return undefined;
  }

  const [red, blue = red] = text.split('/').map((team) => team.split(',') as TankClassId[]);
  return { red, blue };
}

/** The tuning the matches run with, from `TANKI_TUNING`; none by default. */
const TUNED = harnessTuning(import.meta.env.TANKI_TUNING);
const PACE: Pace = { ...PACE_DEFAULTS, ...TUNED.tuning.pace };

function createMatch(rapier: Rapier, seed: number) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;

  return createKothMatch(rapier, world, fakeRenderer(), {
    human: false,
    random: seeded(seed),
    pace: () => PACE,
    rules: { ...CAPTURE_RULES, holdTime: 120 },
    roster: ROSTER
  });
}

/** A renderer that only hands out field slots. */
function fakeRenderer() {
  const slots = Array.from({ length: 512 }, (_, index) => 511 - index);
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    uploadField() {},
    beginBodies() {},
    addBody() {},
    spawn() {},
    addSmokeBall() {},
    addLight() {},
    render() {}
  };

  return renderer as unknown as ReturnType<typeof createRangeRenderer>;
}

/** A seeded source of randomness in [0, 1). */
function seeded(seed: number) {
  let state = seed;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
