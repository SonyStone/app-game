import { beforeAll, describe, it } from 'vitest';
import type { createRangeRenderer } from '../../damage/renderer';
import type { Rapier } from '../../physics/Rapier2D';
import type { KothMap } from '../map';
import { createKothMatch } from '../match';
import { CAPTURE_RULES } from '../rules';
import { MEDIUM_TANK, TANK_CLASS_IDS, type TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';

/**
 * Balance metrics of the tank classes, printed as tables: a matrix of bot duels, class against
 * class, from several starting ranges and seeds, and per-class results of full eight-bot matches
 * on the king of the hill map, with the repair kits each class took and the walls each match broke.
 * Slow, so it runs only with `TANKI_BALANCE=1 pnpm exec vitest run src/koth/classes/balance.harness.test.ts`.
 * `TANKI_MEDIUM_SPEED` sets the medium tank's speed the classes' speeds are shares of; defaults to 250.
 * `TANKI_SEEDS` replaces the matches' twelve seeds with a comma-separated list: a class's kills
 * against deaths moves by 0.2-0.5 from one set of twelve to another, so a change is worth checking
 * on a second set.
 */
describe.skipIf(!import.meta.env.TANKI_BALANCE)('class balance', () => {
  let rapier: Rapier;

  beforeAll(async () => {
    rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
    const medium = Number(import.meta.env.TANKI_MEDIUM_SPEED ?? 250);
    const shares = TANK_CLASS_IDS.map((id) => [id, TANK_CLASSES[id].speed / MEDIUM_TANK.speed] as const);

    for (const [id, share] of shares) {
      TANK_CLASSES[id].speed = share * medium;
    }
  });

  it('duels every class against every class', () => {
    const ranges = [220, 450, 700];
    const seeds = [1, 2, 3, 4, 5, 6];
    const wins = new Map<string, { won: number; lost: number; draw: number; time: number }>();

    for (const red of TANK_CLASS_IDS) {
      for (const blue of TANK_CLASS_IDS) {
        for (const range of ranges) {
          for (const seed of seeds) {
            const result = duel(rapier, red, blue, range, seed * 7919 + range);
            const key = `${red}|${blue}|${range}`;
            const entry = wins.get(key) ?? { won: 0, lost: 0, draw: 0, time: 0 };
            entry[result.winner === 'red' ? 'won' : result.winner === 'blue' ? 'lost' : 'draw']++;
            entry.time += result.time;
            wins.set(key, entry);
          }
        }
      }
    }

    for (const range of ranges) {
      const lines = [`Duels from ${range} px: share of duels the row class won (draws count half), ${seeds.length} seeds each way`];
      lines.push(['', ...TANK_CLASS_IDS].map((cell) => cell.padStart(8)).join(''));

      for (const red of TANK_CLASS_IDS) {
        const cells = TANK_CLASS_IDS.map((blue) => {
          const asRed = wins.get(`${red}|${blue}|${range}`)!;
          const asBlue = wins.get(`${blue}|${red}|${range}`)!;
          const total = asRed.won + asRed.lost + asRed.draw + asBlue.won + asBlue.lost + asBlue.draw;
          const score = asRed.won + asBlue.lost + (asRed.draw + asBlue.draw) / 2;
          return `${Math.round((score / total) * 100)}%`.padStart(8);
        });
        lines.push(red.padStart(8) + cells.join(''));
      }

      const times = TANK_CLASS_IDS.map((red) => {
        const all = TANK_CLASS_IDS.map((blue) => wins.get(`${red}|${blue}|${range}`)!);
        return `${red} ${(all.reduce((sum, entry) => sum + entry.time, 0) / (all.length * seeds.length)).toFixed(1)} s`;
      });
      lines.push(`mean duel time: ${times.join(', ')}`);
      console.log(lines.join('\n'));
    }
  }, 900_000);

  it('plays eight-bot matches and sums up every class', () => {
    const totals = new Map<TankClassId, { seats: number; kills: number; deaths: number; life: number; lives: number; damage: number; point: number; kits: number }>();
    const matches: string[] = [];
    let stalls = 0;
    let longest = 0;

    const seeds = import.meta.env.TANKI_SEEDS?.split(',').map(Number) ?? [11, 23, 37, 41, 53, 67, 71, 89, 97, 101, 113, 127];

    for (const seed of seeds) {
      const match = createMatch(rapier, seed);
      const step = match.kits.step;
      match.kits.step = (time, tanks) => {
        const takers = step(time, tanks);

        for (const taker of takers) {
          const member = match.members.find((candidate) => candidate.tank === taker);
          const stats = member && totals.get(member.tankClass.id);

          if (stats) {
            stats.kits++;
          }
        }

        return takers;
      };
      const born = new Map<number, number>();
      const armor = new Map<object, number>();
      let firstCapture: number | undefined;

      while (match.time < 300 && !match.capture.winner) {
        match.step(1 / 60);
        match.update(1 / 60);
        firstCapture ??= match.capture.owner ? match.time : undefined;

        for (const member of match.members) {
          const stats = totals.get(member.tankClass.id) ?? { seats: 0, kills: 0, deaths: 0, life: 0, lives: 0, damage: 0, point: 0, kits: 0 };
          totals.set(member.tankClass.id, stats);

          if (member.tank && !born.has(member.id)) {
            born.set(member.id, match.time);
          } else if (!member.tank && born.has(member.id)) {
            stats.life += match.time - born.get(member.id)!;
            stats.lives++;
            born.delete(member.id);
          }

          if (member.tank) {
            const left = match.combat.armorLeft(member.tank);
            const before = armor.get(member.tank) ?? 1;
            // Armor lost goes to the enemy that hit the tank last.
            const shooter = member.attacker && match.members.find((other) => other.team !== member.team && other.tank === member.attacker);

            if (left < before && shooter) {
              totals.get(shooter.tankClass.id)!.damage += before - left;
            }

            armor.set(member.tank, left);

            if (Math.hypot(member.tank.hull.translation().x - match.map.point.x, member.tank.hull.translation().y - match.map.point.y) <= match.map.point.radius) {
              stats.point += 1 / 60;
            }
          }
        }
      }

      for (const member of match.members) {
        const stats = totals.get(member.tankClass.id)!;
        stats.seats++;
        stats.kills += member.kills;
        stats.deaths += member.deaths;
      }

      for (const bot of match.bots.values()) {
        stalls += bot.driver.stalls;
        longest = Math.max(longest, bot.driver.longestStall);
      }

      const roster = (team: 'red' | 'blue') => match.members.filter((member) => member.team === team).map((member) => member.tankClass.id[0].toUpperCase() + member.tankClass.id.slice(1, 3));
      matches.push(
        `seed ${seed}: ${roster('red').join(' ')} vs ${roster('blue').join(' ')} -> ${match.capture.winner ?? 'none'} at ${match.time.toFixed(0)} s, first capture ${firstCapture?.toFixed(0) ?? '-'} s, kills ${match.members.reduce((sum, member) => sum + member.kills, 0)}, wall hits ${match.combat.walls.damage.hits}, tiles fallen ${match.combat.walls.damage.collapsed}`
      );
    }

    const lines = ['Eight-bot matches, hold time 120 s:', ...matches, '', 'class      seats  K/D    kills/seat  life s  damage/seat  on point s/seat  kits/seat'];

    for (const [id, stats] of totals) {
      lines.push(
        `${id.padEnd(10)} ${String(stats.seats).padStart(5)}  ${(stats.kills / Math.max(stats.deaths, 1)).toFixed(2).padStart(4)}   ${(stats.kills / stats.seats).toFixed(2).padStart(9)}  ${(stats.life / Math.max(stats.lives, 1)).toFixed(0).padStart(6)}  ${(stats.damage / stats.seats).toFixed(2).padStart(11)}  ${(stats.point / stats.seats).toFixed(0).padStart(14)}  ${(stats.kits / stats.seats).toFixed(1).padStart(9)}`
      );
    }

    lines.push(`driver stalls ${stalls}, longest ${longest.toFixed(2)} s`);
    console.log(lines.join('\n'));
  }, 900_000);
});

/** One duel of two bots on an open field with a little cover, starting `range` apart; it ends when one is destroyed, or after 40 s. */
function duel(rapier: Rapier, red: TankClassId, blue: TankClassId, range: number, seed: number) {
  const map = duelMap(range);
  const match = createMatch(rapier, seed, { map, roster: { red: [red], blue: [blue] }, rules: { ...CAPTURE_RULES, unlockTime: 1e9 } });

  while (match.time < 40) {
    match.step(1 / 60);
    match.update(1 / 60);
    const [first, second] = match.members;

    if (first.deaths > 0 || second.deaths > 0) {
      return { winner: first.deaths > 0 ? (second.deaths > 0 ? undefined : 'blue') : 'red', time: match.time };
    }
  }

  return { winner: undefined, time: match.time };
}

/** An open field 1800 x 900 px with two walls and two crates off the line between the spawns, which lie `range` apart; the bases' zones are far in the corners, so nobody mends. */
function duelMap(range: number): KothMap {
  return {
    halfWidth: 900,
    halfHeight: 450,
    walls: [
      { x: -range / 4, y: -140, halfWidth: 60, halfHeight: 14 },
      { x: range / 4, y: 140, halfWidth: 60, halfHeight: 14 }
    ],
    crates: [
      { x: -range / 4, y: 150, rotation: 0 },
      { x: range / 4, y: -150, rotation: 0 }
    ],
    point: { x: 0, y: 0, radius: 90 },
    bases: {
      red: { zone: { x: -880, y: -430, halfWidth: 10, halfHeight: 10 }, spawns: [{ x: -range / 2, y: 0, rotation: 0 }] },
      blue: { zone: { x: 880, y: 430, halfWidth: 10, halfHeight: 10 }, spawns: [{ x: range / 2, y: 0, rotation: Math.PI }] }
    },
    lanes: {
      red: { center: { x: -range / 2, y: 0 }, north: { x: -range / 2, y: -200 }, south: { x: -range / 2, y: 200 } },
      blue: { center: { x: range / 2, y: 0 }, north: { x: range / 2, y: -200 }, south: { x: range / 2, y: 200 } }
    },
    kits: []
  };
}

/** A seeded match of bots only on a renderer that only hands out field slots. */
function createMatch(rapier: Rapier, seed: number, options: Partial<Parameters<typeof createKothMatch>[3]> = {}) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
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
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  return createKothMatch(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, {
    human: false,
    random,
    rules: { ...CAPTURE_RULES, holdTime: 120 },
    ...options
  });
}
