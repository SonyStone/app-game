import { beforeAll, describe, it } from 'vitest';
import { carve } from '../damage/field';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import type { Kit } from './kits';
import { inBase } from './map';
import { createKothMatch, type KothMatch } from './match';
import { PACE_DEFAULTS } from './pace';
import { CAPTURE_RULES, type TeamId } from './rules';
import type { TankClassId } from './tanks';
import type { Member } from './team';

/**
 * Short staged situations that show whether the bots handle the moments a player notices, each
 * with the behavior expected and a measure of it, played on `SEEDS` seeds: a Sniper rushed by a
 * Scout, Scouts raiding a Sniper in its base, a badly hit team facing a fresh one, the Sniper's place in an ordinary match, a push
 * against a perched Sniper, a Sniper covering its team beyond a held point, a lone bot back while
 * the enemy holds the point, an empty point, a push behind the Heavy, a gathering with hurt
 * teammates, two hurt tanks and one repair kit, a repair kit under the enemy's eyes and the fence
 * a team should break open. It prints, per scenario, how
 * often the bots did what was expected and what they did instead; it asserts nothing, as it
 * measures the bots for tuning their behavior before their balance.
 *
 * Slow, so it runs only with
 * `TANKI_SCENARIOS=1 pnpm exec vitest run src/koth/scenarios.harness.test.ts --reporter=verbose`;
 * `-t sniper` and the like run some of them, and `TANKI_SEEDS=11,23` on other seeds.
 */
describe.skipIf(!import.meta.env.TANKI_SCENARIOS)('bot scenarios', () => {
  let rapier: Rapier;

  beforeAll(async () => {
    rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
  });

  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      const seeds: number[] = import.meta.env.TANKI_SEEDS?.split(',').map(Number) ?? SEEDS;
      const outcomes = seeds.map((seed) => ({ seed, ...scenario.play(stage(rapier, seed, scenario.roster)) }));
      const passed = outcomes.filter((outcome) => outcome.pass).length;
      const notes = new Map<string, number[]>();

      for (const outcome of outcomes) {
        notes.set(outcome.note, [...(notes.get(outcome.note) ?? []), outcome.seed]);
      }

      console.log(
        [
          `${scenario.name}: ${passed}/${outcomes.length} as expected`,
          `  expected: ${scenario.expected}`,
          ...[...notes].sort(([, a], [, b]) => b.length - a.length).map(([note, seeds]) => `  ${seeds.length}× ${note} (seed ${seeds.join(', ')})`)
        ].join('\n')
      );
    }, 600_000);
  }
});

/** What a scenario's run came to: whether the bots did what was expected, and in a few words what they did. */
type Outcome = { pass: boolean; note: string };

type Scenario = {
  name: string;
  expected: string;
  roster: Record<TeamId, TankClassId[]>;
  play: (stage: Stage) => Outcome;
};

const SEEDS = [11, 23, 37, 41, 53, 67, 71, 89];

const SCENARIOS: Scenario[] = [
  {
    name: 'sniper rushed by a scout',
    // The Scout is the Sniper's counter, as in Team Fortress 2: a Sniper rushed alone may lose, but not for nothing.
    expected: 'the Sniper on its middle perch lives, by killing the Scout or falling back, or at least takes the Scout with it',
    roster: { red: ['sniper'], blue: ['scout'] },
    play(stage) {
      const sniper = stage.seat('red', 'sniper');
      const scout = stage.seat('blue', 'scout');
      stage.place(sniper, { x: -550, y: -90 }, 0);
      stage.place(scout, { x: 110, y: -50 }, Math.PI);
      let fellBack = false;
      stage.run(20, () => {
        fellBack ||= sniper.tank !== undefined && inBase(stage.match.map.bases.red, sniper.tank.hull.translation());

      });
      const lived = sniper.deaths === 0;
      const killed = scout.deaths > 0;
      return { pass: lived || killed, note: lived ? (killed ? 'killed the scout' : fellBack ? 'fell back and lived' : 'lived') : killed ? 'traded with the scout' : 'died to the scout' };
    }
  },
  {
    name: 'scouts raiding a sniper in its base',
    expected: 'two Scouts that hunt a Sniper staying in its spawn room pay for it: the base turret destroys one of them or the Sniper lives through 25 s',
    roster: { red: ['sniper'], blue: ['scout', 'scout'] },
    play(stage) {
      const sniper = stage.seat('red', 'sniper');
      const scouts = stage.team('blue');
      // The Sniper stays in its room, as a player mending there does.
      stage.place(sniper, stage.match.map.bases.red.spawns[1], 0);
      stage.freeze(sniper);
      scouts.forEach((scout, index) => stage.place(scout, { x: -1040 + index * 50, y: 0 }, Math.PI));
      stage.holdPointFor('blue');
      let inside = 0;
      let steps = 0;
      stage.run(25, () => {
        steps += 1;
        inside += scouts.some((scout) => scout.tank && inBase(stage.match.map.bases.red, scout.tank.hull.translation())) ? 1 : 0;
      });
      const lost = scouts.reduce((sum, scout) => sum + scout.deaths, 0);
      return {
        pass: lost > 0 || sniper.deaths === 0,
        note: `${lost} Scouts lost, the Sniper died ${sniper.deaths}×, a Scout in the room ${Math.round((inside / steps) * 100)}% of the time`
      };
    }
  },
  {
    name: 'battered team against a fresh one',
    expected: 'the battered team falls back to mend instead of dying in cover, losing at most one tank',
    roster: { red: ['soldier', 'heavy', 'demoman', 'scout'], blue: ['soldier', 'heavy', 'demoman', 'soldier'] },
    play(stage) {
      const red = stage.team('red');
      red.forEach((member, index) => {
        stage.place(member, { x: -260 + (index % 2) * 90, y: index < 2 ? -110 : 110 }, 0);
        stage.wear(member, 0.45);
      });
      stage.unlock();
      const reached = new Set<Member>();
      let called = false;
      stage.run(25, () => {
        called ||= stage.match.callouts().some((callout) => callout.team === 'red' && callout.line === 'fallBackTeam');
        red.filter((member) => member.tank && inBase(stage.match.map.bases.red, member.tank.hull.translation())).forEach((member) => reached.add(member));
      });
      const deaths = red.reduce((sum, member) => sum + member.deaths, 0);
      return { pass: called && deaths <= 1, note: `${called ? 'fell back' : 'stayed'}, ${reached.size} reached base, ${deaths} lost` };
    }
  },
  {
    name: 'sniper takes the middle',
    expected: 'in an ordinary match the Sniper spends most of its life on a perch in the hall, 540-680 px from the point, or safe in its base, and drives at most a third of it',
    roster: { red: ['sniper', 'soldier', 'heavy', 'demoman'], blue: ['soldier', 'soldier', 'heavy', 'demoman'] },
    play(stage) {
      const sniper = stage.seat('red', 'sniper');
      const where = { middle: 0, base: 0, elsewhere: 0 };
      let driving = 0;
      let seeing = 0;
      let last: { x: number; y: number } | undefined;
      stage.run(70, () => {
        const at = sniper.tank?.hull.translation();
        const before = last;
        last = at && { x: at.x, y: at.y };

        if (!at || stage.match.time < 20) {
          return;
        }

        seeing += stage.sees(sniper, 900) ? 1 : 0;
        const inBaseNow = inBase(stage.match.map.bases.red, at);
        where[inBaseNow ? 'base' : at.x > -720 && at.x < -460 && Math.abs(at.y) < 170 ? 'middle' : 'elsewhere'] += 1;

        if (before && !inBaseNow && Math.hypot(at.x - before.x, at.y - before.y) * 60 > 15) {
          driving += 1;
        }
      });
      const total = Math.max(where.middle + where.base + where.elsewhere, 1);
      const share = (count: number) => Math.round((count / total) * 100);
      return {
        pass: where.middle / total >= 0.4 && where.elsewhere / total <= 0.35 && driving / total <= 0.34,
        note: `middle ${share(where.middle)}%, base ${share(where.base)}%, elsewhere ${share(where.elsewhere)}%, driving ${share(driving)}%, seeing ${share(seeing)}%, kills ${sniper.kills}, deaths ${sniper.deaths}`
      };
    }
  },
  {
    name: 'sniper against a push',
    expected: 'a team pushing a point an enemy Sniper watches from its perch loses at most two tanks to it in 40 s',
    roster: { red: ['heavy', 'soldier', 'demoman', 'scout'], blue: ['sniper', 'soldier', 'heavy', 'demoman'] },
    play(stage) {
      const sniper = stage.seat('blue', 'sniper');
      stage.team('red').forEach((member, index) => stage.place(member, { x: -660, y: (index - 1.5) * 70 }, 0));
      stage.place(sniper, { x: 550, y: -90 }, Math.PI);
      stage.holdPointFor('blue');
      let sniperDied: number | undefined;
      stage.run(40, () => {
        sniperDied ??= sniper.deaths > 0 ? stage.match.time : undefined;
      });
      const lost = stage.team('red').reduce((sum, member) => sum + member.deaths, 0);
      return {
        pass: sniper.kills <= 2,
        note: `the Sniper destroyed ${sniper.kills} of ${lost} lost${sniperDied === undefined ? '' : `, died at ${roundTo(sniperDied)} s`}`
      };
    }
  },
  {
    name: 'sniper covers a held point',
    expected: 'with the point taken and its team fighting on beyond it, out of its perch\'s view, the Sniper moves up behind its team and sees the enemy within 10 s, from 560 px or more',
    roster: { red: ['sniper', 'soldier', 'heavy', 'demoman'], blue: ['soldier', 'scout', 'heavy', 'demoman'] },
    play(stage) {
      const sniper = stage.seat('red', 'sniper');
      const [, ...others] = stage.team('red');
      // The enemy stands where the fight was, so the fight stays out of the perch's view.
      stage.place(sniper, { x: -550, y: -90 }, 0);
      others.forEach((member, index) => stage.place(member, { x: 300 + index * 50, y: -40 - index * 20 }, 0));
      stage.team('blue').forEach((member, index) => stage.place(member, { x: 600 + (index % 2) * 60, y: index < 2 ? -80 : -150 }, Math.PI));
      stage.team('blue').forEach((member) => stage.freeze(member));
      stage.holdPointFor('red');
      let seen: number | undefined;
      let closest = Infinity;
      let ahead = false;
      stage.run(12, () => {
        const at = sniper.tank?.hull.translation();

        if (!at) {
          return;
        }

        seen ??= stage.sees(sniper, 900) ? stage.match.time : undefined;
        ahead ||= others.every((member) => !member.tank || member.tank.hull.translation().x < at.x);
        stage.team('blue').forEach((member) => {
          const there = member.tank?.hull.translation();
          closest = there ? Math.min(closest, Math.hypot(there.x - at.x, there.y - at.y)) : closest;
        });
      });
      const where = seen === undefined ? 'never saw the enemy' : `saw the enemy at ${roundTo(seen)} s`;
      return {
        pass: seen !== undefined && seen < 10 && closest >= 560 && !ahead && sniper.deaths === 0,
        note: `${where}, came within ${Math.round(closest)} px of it${ahead ? ', ahead of its whole team' : ''}`
      };
    }
  },
  {
    name: 'lone bot back while the enemy holds the point',
    expected: 'the one bot alive waits for the three coming back in 7 s instead of going in alone',
    roster: { red: ['soldier', 'heavy', 'demoman', 'scout'], blue: ['soldier', 'heavy', 'demoman', 'soldier'] },
    play(stage) {
      const [lone, ...others] = stage.team('red');
      others.forEach((member) => stage.match.bench(member, 7));
      stage.place(lone, stage.match.map.bases.red.spawns[1], 0);
      stage.holdPointFor('blue');
      let contact: number | undefined;
      stage.run(12, () => {
        contact ??= stage.sees(lone, 450) ? stage.match.time : undefined;

      });
      const alone = contact !== undefined && contact < 6.5;
      return { pass: !alone && lone.deaths === 0, note: contact === undefined ? 'never met the enemy' : alone ? `went in alone at ${roundTo(contact)} s` : `met the enemy with the others at ${roundTo(contact)} s` };
    }
  },
  {
    name: 'empty point',
    expected: 'with every enemy gone for 15 s the team takes the free point within 12 s, without gathering first',
    roster: { red: ['scout', 'soldier', 'heavy', 'demoman'], blue: ['soldier', 'soldier', 'heavy', 'demoman'] },
    play(stage) {
      stage.team('blue').forEach((member) => stage.match.bench(member, 15));
      stage.team('red').forEach((member, index) => stage.place(member, { x: -660, y: (index - 1.5) * 60 }, 0));
      stage.unlock();
      let taken: number | undefined;
      stage.run(15, () => {
        taken ??= stage.match.capture.owner === 'red' ? stage.match.time : undefined;
      });
      return { pass: taken !== undefined && taken < 12, note: taken === undefined ? 'not taken' : `taken at ${roundTo(taken)} s` };
    }
  },
  {
    name: 'push behind the heavy',
    expected: 'attacking a held point the team meets the enemy together: at most one tank first meets it with no ally within 300 px',
    roster: { red: ['heavy', 'soldier', 'soldier', 'demoman'], blue: ['soldier', 'heavy', 'demoman', 'soldier'] },
    play(stage) {
      const red = stage.team('red');
      red.forEach((member, index) => stage.place(member, { x: -660, y: (index - 1.5) * 70 }, 0));
      stage.holdPointFor('blue');
      const first = new Map<Member, boolean>();
      stage.run(30, () => {
        for (const member of red) {
          if (!first.has(member) && member.tank && stage.sees(member, 450)) {
            first.set(member, stage.allyNear(member, 300));
          }
        }
      });
      const alone = [...first.values()].filter((together) => !together).length;
      const heavyFirst = [...first.keys()][0]?.tankClass.id === 'heavy';
      return { pass: alone <= 1, note: `${alone} of ${first.size} met the enemy alone${heavyFirst ? ', the Heavy first' : ''}` };
    }
  },
  {
    name: 'gathering with hurt teammates',
    expected: 'with two teammates mending, the Heavy waits at the gathering spot instead of going in alone',
    roster: { red: ['heavy', 'soldier', 'demoman', 'soldier'], blue: ['soldier', 'heavy', 'demoman', 'soldier'] },
    play(stage) {
      const red = stage.team('red');
      const heavy = stage.seat('red', 'heavy');
      red.forEach((member, index) => stage.place(member, { x: -660, y: (index - 1.5) * 70 }, 0));
      stage.wear(stage.seat('red', 'soldier'), 0.5);
      stage.wear(stage.seat('red', 'demoman'), 0.5);
      stage.holdPointFor('blue');
      let met: { at: number; together: boolean } | undefined;
      stage.run(30, () => {
        met ??= heavy.tank && stage.sees(heavy, 450) ? { at: stage.match.time, together: stage.allyNear(heavy, 300) } : undefined;
      });
      return {
        pass: met === undefined || met.together,
        note: met === undefined ? 'never met the enemy' : `met the enemy ${met.together ? 'with' : 'without'} the others at ${roundTo(met.at)} s${heavy.deaths > 0 ? ', died' : ''}`
      };
    }
  },
  {
    name: 'two hurt tanks, one kit',
    expected: 'of two hurt tanks beside one repair kit only one drives for it',
    roster: { red: ['soldier', 'demoman'], blue: ['soldier'] },
    play(stage) {
      const [one, other] = stage.team('red');
      stage.match.bench(stage.seat('blue', 'soldier'), 20);
      stage.place(one, { x: -760, y: 300 }, 0);
      stage.place(other, { x: -760, y: 360 }, 0);
      stage.wear(one, 0.5);
      stage.wear(other, 0.5);
      let both = 0;
      stage.run(10, () => {
        const [a, b] = [one, other].map((member) => stage.match.bots.get(member)?.thought());

        if (a?.action === 'pickUpKit' && b?.action === 'pickUpKit' && a.destination === b.destination) {
          both += 1 / 60;
        }
      });
      return { pass: both < 0.3, note: `both drove for one kit ${roundTo(both)} s` };
    }
  },
  {
    name: 'repair kit under the enemy eyes',
    expected: 'a hurt Soldier does not wait beside a taken kit an enemy Heavy watches',
    roster: { red: ['soldier'], blue: ['heavy'] },
    play(stage) {
      const soldier = stage.seat('red', 'soldier');
      const heavy = stage.seat('blue', 'heavy');
      const kit = stage.match.kits.kits.find((candidate) => candidate.x === -260 && candidate.y === -215)! as Kit;
      kit.readyAt = 6;
      stage.place(soldier, { x: -300, y: -180 }, 0);
      stage.place(heavy, { x: -20, y: -215 }, Math.PI);
      stage.freeze(heavy);
      stage.wear(soldier, 0.6);
      let waited = 0;
      stage.run(8, () => {
        const at = soldier.tank?.hull.translation();

        if (at && kit.readyAt > stage.match.time && Math.hypot(at.x - kit.x, at.y - kit.y) < 60) {
          waited += 1 / 60;
        }
      });
      return { pass: waited < 1, note: `waited ${roundTo(waited)} s at the kit` };
    }
  },
  {
    name: 'breaking the fence open',
    expected: 'pushing from the start, the team breaks open the fence across the north alley within 45 s',
    roster: { red: ['demoman', 'soldier', 'soldier', 'heavy'], blue: ['soldier', 'soldier', 'heavy', 'demoman'] },
    play(stage) {
      let opened: number | undefined;
      stage.run(45, () => {
        opened ??= stage.match.callouts().some((callout) => callout.team === 'red' && callout.line === 'wayOpen') ? stage.match.time : undefined;
      });
      return { pass: opened !== undefined, note: opened === undefined ? 'not opened' : `opened at ${roundTo(opened)} s` };
    }
  }
];

/** A match staged for a scenario, with tools to set it up and watch it. */
type Stage = ReturnType<typeof stage>;

function stage(rapier: Rapier, seed: number, roster: Record<TeamId, TankClassId[]>) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const match: KothMatch = createKothMatch(rapier, world, fakeRenderer(), { human: false, random, pace: () => PACE_DEFAULTS, rules: CAPTURE_RULES, roster });

  return {
    match,

    /** The team's seats. */
    team(team: TeamId) {
      return match.members.filter((member) => member.team === team);
    },

    /** The team's `nth` seat of class `id`. */
    seat(team: TeamId, id: TankClassId, nth = 0) {
      return match.members.filter((member) => member.team === team && member.tankClass.id === id)[nth];
    },

    /** Puts the member's tank and its tow point at `at`, facing `heading`, at rest. */
    place(member: Member, at: { x: number; y: number }, heading: number) {
      const tank = member.tank!;
      tank.hull.setTranslation({ x: at.x, y: at.y }, true);
      tank.hull.setRotation(heading, true);
      tank.hull.setLinvel({ x: 0, y: 0 }, true);
      tank.pull.setTranslation({ x: at.x + Math.cos(heading) * 15, y: at.y + Math.sin(heading) * 15 }, true);
      tank.pull.setLinvel({ x: 0, y: 0 }, true);
    },

    /** Chips holes round the member's hull, clear of its core, until it keeps about `share` of its armor. */
    wear(member: Member, share: number) {
      const tank = member.tank!;
      const field = match.combat.armorOf(tank)!;
      const hull = member.tankClass.hull;

      for (let hole = 0; hole < 200 && match.combat.armorLeft(tank) > share; hole++) {
        const x = (random() * 2 - 1) * hull.halfLength;
        const y = (random() * 2 - 1) * hull.halfWidth;

        if (Math.hypot(x - hull.core.x, y - hull.core.y) > hull.core.radius + 6) {
          carve(field, { x, y }, 4, 0.2, hole);
        }

        // Mending by a hair makes the battle measure the armor anew with its next step.
        match.combat.repair(tank, 1e-9);
        match.combat.step(1 / 60);
      }
    },

    /** Leaves the member's tank standing where it is: its bot no longer drives or shoots it. */
    freeze(member: Member) {
      match.bots.delete(member);
    },

    /** Opens the point at once. */
    unlock() {
      match.setCapture({ locked: 0 });
    },

    /** Gives the point to `team`, which has held it for a fifth of the time that wins, and opens it. */
    holdPointFor(team: TeamId) {
      match.setCapture({ locked: 0, owner: team, held: { red: 0, blue: 0, [team]: CAPTURE_RULES.holdTime * 0.2 } });
    },

    /** Whether the member sees an enemy within `range` px. */
    sees(member: Member, range: number) {
      const at = member.tank?.hull.translation();
      return (
        at !== undefined &&
        match.members.some((other) => {
          const there = other.team !== member.team && other.tank?.hull.translation();
          return there && Math.hypot(there.x - at.x, there.y - at.y) < range && match.combat.lineOfSight(at, there);
        })
      );
    },

    /** Whether an ally of the member is within `range` px of it. */
    allyNear(member: Member, range: number) {
      const at = member.tank!.hull.translation();
      return match.members.some((other) => other !== member && other.team === member.team && other.tank && Math.hypot(other.tank.hull.translation().x - at.x, other.tank.hull.translation().y - at.y) < range);
    },

    /** Plays `seconds`, calling `each` after every step. */
    run(seconds: number, each: () => void) {
      const end = match.time + seconds;

      while (match.time < end && !match.capture.winner) {
        match.step(1 / 60);
        match.update(1 / 60);
        each();
      }
    }
  };
}

/** A number to one decimal, for notes. */
function roundTo(value: number) {
  return Math.round(value * 10) / 10;
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
