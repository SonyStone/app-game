import { beforeAll, describe, it } from 'vitest';
import { pullSpeedFor } from '../../arena/bodies';
import { createCombat } from '../../damage/combat';
import type { createRangeRenderer } from '../../damage/renderer';
import type { Rapier } from '../../physics/Rapier2D';
import type { KothMap } from '../map';
import { createKothMatch, type KothMatch } from '../match';
import { PACE_DEFAULTS } from '../pace';
import { CAPTURE_RULES } from '../rules';
import { MEDIUM_TANK, TANK_CLASS_IDS, type TankClassId } from '../tanks';
import type { Member } from '../team';
import { clampGun } from './casemate';
import { TANK_CLASSES } from './classes';
import { pickRoster } from './roster';
import { createWeapon } from './weapon';

/**
 * Balance metrics of the tank classes at the match's default pace (`PACE_DEFAULTS`), printed as
 * tables: how long every class takes to destroy a still tank from behind, the side and the front
 * at several ranges with a perfect aim; each class played from the player's seat as a mouse aims;
 * a matrix of bot duels, class against class, from several starting ranges and seeds; and
 * per-class results of full eight-bot matches on the king of the hill map, with the repair kits
 * each class took and the walls each match broke, and for the matches together: the breaches bots
 * made, by class, material and method, how they ended, the wrecks and scrap left and how often
 * and how long drivers got stuck.
 *
 * Slow, so it runs only with
 * `TANKI_BALANCE=1 pnpm exec vitest run src/koth/classes/balance.harness.test.ts --reporter=verbose`;
 * vitest's default reporter leaves out what passing tests print. `-t kills`, `-t player`,
 * `-t duels` or `-t matches` runs one part. `TANKI_MEDIUM_SPEED` sets the medium tank's speed
 * the classes' speeds are shares of; defaults to 250. `TANKI_SEEDS` replaces the matches' twelve
 * seeds with a comma-separated list: a class's kills against deaths moves by 0.2-0.5 from one set
 * of twelve to another, so a change is worth checking on a second set. `TANKI_VICTIMS` lists the
 * classes the kill times are taken against; defaults to `soldier,heavy,scout`.
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

  it('times the kills of every class against a still tank from behind, the side and the front', () => {
    const sides = ['rear', 'side', 'front'] as const;
    const ranges = [80, 160, 280, 450];
    const victims = (import.meta.env.TANKI_VICTIMS?.split(',') ?? ['soldier', 'heavy', 'scout']) as TankClassId[];

    for (const victim of victims) {
      const lines = [
        `Seconds to destroy a still ${victim} (shots fired), the gun aimed at its core and fired as fast as it goes, the median of ${KILL_SEEDS} seeds; - is none within 20 s`,
        ['', ...sides.flatMap((side) => ranges.map((range) => `${side} ${range}`))].map((cell) => cell.padStart(11)).join('')
      ];

      for (const id of TANK_CLASS_IDS) {
        const cells = sides.flatMap((side) =>
          ranges.map((range) => {
            const results = Array.from({ length: KILL_SEEDS }, (_, seed) => timeToKill(rapier, id, victim, side, range, seed + 1)).sort((a, b) => a.time - b.time);
            const median = results[Math.floor(KILL_SEEDS / 2)];
            return (Number.isFinite(median.time) ? `${median.time.toFixed(1)} (${median.shots})` : '-').padStart(11);
          })
        );
        lines.push(id.padStart(11) + cells.join(''));
      }

      console.log(lines.join('\n'));
    }
  }, 900_000);

  it('plays every class as a player aims, against bots', () => {
    const seeds = import.meta.env.TANKI_SEEDS?.split(',').map(Number).slice(0, 8) ?? [11, 23, 37, 41, 53, 67, 71, 89];
    const lines = [
      `The player's seat in ${seeds.length} matches of 120 s per class: the seat's bot drives and plans, but the gun is aimed as a player aims it (see playAsPlayer)`,
      'class      kills  deaths  K/D   damage/match  shots/match  hits on armor  hits on core'
    ];

    for (const id of TANK_CLASS_IDS) {
      const total = { kills: 0, deaths: 0, damage: 0, shots: 0, armor: 0, core: 0 };

      for (const seed of seeds) {
        const result = playAsPlayer(rapier, id, seed);
        total.kills += result.kills;
        total.deaths += result.deaths;
        total.damage += result.damage;
        total.shots += result.shots;
        total.armor += result.hits.armor;
        total.core += result.hits.core;
      }

      const per = (value: number) => (value / seeds.length).toFixed(1);
      lines.push(
        `${id.padEnd(10)} ${String(total.kills).padStart(5)}  ${String(total.deaths).padStart(6)}  ${(total.kills / Math.max(total.deaths, 1)).toFixed(2).padStart(4)}  ${(total.damage / seeds.length).toFixed(2).padStart(12)}  ${per(total.shots).padStart(11)}  ${per(total.armor).padStart(13)}  ${per(total.core).padStart(12)}`
      );
    }

    console.log(lines.join('\n'));
  }, 900_000);

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
    const breaches = new Map<string, { passed: number; opened: number; abandoned: number; spent: number; reasons: Record<string, number> }>();
    const weighed = new Map<string, { considered: number; exposed: number; short: number; chosen: number }>();
    const debris = { wrecks: 0, pieces: 0, area: 0, chunks: 0, metal: 0 };
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

        for (const entry of bot.breach.stats.log) {
          const key = `${entry.tankClass} ${entry.material} ${entry.method}`;
          const tally = breaches.get(key) ?? { passed: 0, opened: 0, abandoned: 0, spent: 0, reasons: {} };
          tally[entry.outcome]++;
          tally.spent += entry.spent;

          if (entry.reason) {
            tally.reasons[entry.reason] = (tally.reasons[entry.reason] ?? 0) + 1;
          }

          breaches.set(key, tally);
        }

        for (const [key, counts] of bot.breach.stats.weighed) {
          const tally = weighed.get(key) ?? { considered: 0, exposed: 0, short: 0, chosen: 0 };
          tally.considered += counts.considered;
          tally.exposed += counts.exposed;
          tally.short += counts.short;
          tally.chosen += counts.chosen;
          weighed.set(key, tally);
        }
      }

      debris.wrecks += match.combat.wrecks.made;
      debris.pieces += match.combat.scrap.pieces.length;
      debris.chunks += match.combat.scrap.chunks;
      debris.area += match.combat.scrap.pieces.reduce((total, piece) => total + piece.area, 0);
      debris.metal += match.combat.scrap.pieces.filter((piece) => piece.material === 'metal').length;

      const roster = (team: 'red' | 'blue') => match.members.filter((member) => member.team === team).map((member) => member.tankClass.id[0].toUpperCase() + member.tankClass.id.slice(1, 3));
      matches.push(
        `seed ${seed}: ${roster('red').join(' ')} vs ${roster('blue').join(' ')} -> ${match.capture.winner ?? 'none'} at ${match.time.toFixed(0)} s, first capture ${firstCapture?.toFixed(0) ?? '-'} s, kills ${match.members.reduce((sum, member) => sum + member.kills, 0)}, wall hits ${match.combat.walls.damage.hits}, rams ${match.combat.walls.damage.rams}, tiles fallen ${match.combat.walls.damage.collapsed}, wrecks ${match.combat.wrecks.made}`
      );
    }

    const lines = ['Eight-bot matches, hold time 120 s:', ...matches, '', 'class      seats  K/D    kills/seat  life s  damage/seat  on point s/seat  kits/seat'];

    for (const [id, stats] of totals) {
      lines.push(
        `${id.padEnd(10)} ${String(stats.seats).padStart(5)}  ${(stats.kills / Math.max(stats.deaths, 1)).toFixed(2).padStart(4)}   ${(stats.kills / stats.seats).toFixed(2).padStart(9)}  ${(stats.life / Math.max(stats.lives, 1)).toFixed(0).padStart(6)}  ${(stats.damage / stats.seats).toFixed(2).padStart(11)}  ${(stats.point / stats.seats).toFixed(0).padStart(14)}  ${(stats.kits / stats.seats).toFixed(1).padStart(9)}`
      );
    }

    lines.push(`driver stalls ${stalls}, longest ${longest.toFixed(2)} s`);
    lines.push(
      `wrecks left ${debris.wrecks}, scrap lying at the end ${debris.pieces} pieces (${debris.metal} metal) of ${debris.area.toFixed(0)} px² in ${debris.chunks} chunks, per match ${(debris.pieces / seeds.length).toFixed(1)} pieces`
    );
    lines.push('', 'ways through weighed by bots: class material method  weighed seen-by-enemy too-little-saved taken');

    for (const [key, tally] of [...weighed].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${key.padEnd(24)} ${String(tally.considered).padStart(7)} ${String(tally.exposed).padStart(13)} ${String(tally.short).padStart(16)} ${String(tally.chosen).padStart(5)}`);
    }

    lines.push('', 'breaches by bots: class material method  passed opened abandoned  mean s  why abandoned');

    for (const [key, tally] of [...breaches].sort(([a], [b]) => a.localeCompare(b))) {
      const count = tally.passed + tally.opened + tally.abandoned;
      lines.push(
        `${key.padEnd(24)} ${String(tally.passed).padStart(6)} ${String(tally.opened).padStart(6)} ${String(tally.abandoned).padStart(9)}  ${(tally.spent / count).toFixed(1).padStart(6)}  ${JSON.stringify(tally.reasons)}`
      );
    }

    console.log(lines.join('\n'));
  }, 900_000);
});

/** Seeds each kill time is the median of. */
const KILL_SEEDS = 5;

/**
 * Seconds a tank of class `id` takes to destroy a still tank of class `victim`, and the shots it
 * fires, at the match's default pace (`PACE_DEFAULTS`): the victim at the origin facing +x, the shooter standing `range` px behind it, at its side
 * or in front, its gun aimed at the victim's core every step, the trigger held, and a charged shot
 * let go once full. Hits shove the victim, which then stays where it was shoved. `Infinity` when the
 * victim stands after 20 s.
 */
function timeToKill(rapier: Rapier, id: TankClassId, victim: TankClassId, side: 'rear' | 'side' | 'front', range: number, seed: number) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const random = seeded(seed * 7919);
  const combat = createCombat(rapier, world, fakeRenderer(), { halfWidth: 1500, halfHeight: 1500 }, { shell: MEDIUM_TANK.shell, friendlyFire: false, random, pace: () => PACE_DEFAULTS });
  const spawn = (classId: TankClassId, at: { x: number; y: number }, rotation: number, team: string) => {
    const tankClass = TANK_CLASSES[classId];
    return combat.spawnTank({ ...at, rotation }, { color: 0, team, pullSpeed: pullSpeedFor(tankClass.speed), hull: tankClass.hull, mass: tankClass.mass, look: tankClass.look });
  };
  const target = spawn(victim, { x: 0, y: 0 }, 0, 'blue');
  const angle = side === 'rear' ? Math.PI : side === 'side' ? Math.PI / 2 : 0;
  const shooter = spawn(id, { x: Math.cos(angle) * range, y: Math.sin(angle) * range }, angle + Math.PI, 'red');
  const tankClass = TANK_CLASSES[id];
  const weapon = createWeapon(tankClass, random);
  let shots = 0;

  for (let step = 0; step < 20 * 60; step++) {
    const core = combat.coreOf(target);

    if (!core) {
      return { time: step / 60, shots };
    }

    const pivot = combat.gunPivotOf(shooter);
    shooter.turretAngle = Math.atan2(core.y - pivot.y, core.x - pivot.x);

    if (tankClass.mount.kind === 'casemate') {
      clampGun(shooter, tankClass.mount.arc);
    }

    const at = shooter.hull.translation();
    const fire = tankClass.weapon.kind === 'charge' ? (weapon.charge ?? 0) < 1 : true;

    for (const shot of weapon.step(1 / 60, { fire, reach: Math.hypot(core.x - at.x, core.y - at.y) })) {
      combat.fire(shooter, { ...shot, angle: shooter.turretAngle + (shot.angle ?? 0) });
      shots++;
    }

    combat.drive(target, { x: 0, y: 0 });
    combat.step(1 / 60);
  }

  return { time: Infinity, shots };
}

/**
 * A match of 120 s with the player's seat in class `id` and bots in the other seven: the seat's
 * own bot drives it and plans, but its gun is aimed as a player aims with a mouse: the turret
 * turns at once to the nearest enemy in sight within a screen's reach, at the middle of its hull
 * where its shell would meet it, for the core under the armor is hidden, except for a Sniper,
 * whose scope shows the cores; the hand misses by a few pixels, more with range, drawn anew every
 * `HAND_SETTLE` s. The trigger is held while an enemy is in reach; a charged shot is let go once
 * full, or half charged up close. Returns the seat's kills, deaths, the enemies' armor it shot
 * away and its shots and hits.
 */
function playAsPlayer(rapier: Rapier, id: TankClassId, seed: number) {
  const random = seeded(seed);
  const roster = { red: [id, ...pickRoster(3, [id], random)], blue: pickRoster(4, [], random) };
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const hits = { armor: 0, core: 0 };
  const match: KothMatch = createKothMatch(rapier, world, fakeRenderer(), {
    human: true,
    random,
    roster,
    playerClass: id,
    rules: { ...CAPTURE_RULES, holdTime: 120 },
    onHit: (target, shooter, part) => {
      // Called only as the match steps, once it exists.
      if (shooter && shooter === match.seat.tank && part !== 'ricochet') {
        hits[part]++;
      }
    }
  });
  const seat: Member = match.seat;
  match.spectate(true);
  const bot = match.bots.get(seat)!;
  const drive = bot.step;
  const armor = new Map<object, number>();
  // Shots of each of the seat's weapons, one for every life.
  const fired = new Map<object, number>();
  let hand = { x: 0, y: 0, until: -Infinity };
  let damage = 0;

  bot.step = (dt) => {
    drive(dt);
    const tank = seat.tank;
    const weapon = seat.weapon;

    if (!tank || !weapon) {
      return;
    }

    const at = tank.hull.translation();
    const tankClass = seat.tankClass;
    const enemy = match.members
      .filter((member) => member.team !== seat.team && member.tank)
      .map((member) => member.tank!)
      .filter((other) => Math.hypot(other.hull.translation().x - at.x, other.hull.translation().y - at.y) < PLAYER_VIEW && match.combat.lineOfSight(at, other.hull.translation()))
      .sort((a, b) => Math.hypot(a.hull.translation().x - at.x, a.hull.translation().y - at.y) - Math.hypot(b.hull.translation().x - at.x, b.hull.translation().y - at.y))[0];

    if (!enemy) {
      seat.trigger = { fire: weapon.charge !== undefined, cancel: true };
      return;
    }

    const charged = tankClass.weapon.kind === 'charge';
    const mark = charged ? (match.combat.coreOf(enemy) ?? enemy.hull.translation()) : enemy.hull.translation();
    const range = Math.hypot(mark.x - at.x, mark.y - at.y);
    const flight = Number.isFinite(tankClass.shell.speed) ? range / tankClass.shell.speed : 0;
    const velocity = enemy.hull.linvel();

    if (match.time >= hand.until) {
      const error = HAND_ERROR + range * HAND_PER_PIXEL;
      hand = { x: gaussian(random) * error, y: gaussian(random) * error, until: match.time + HAND_SETTLE };
    }

    const pivot = match.combat.gunPivotOf(tank);
    const spot = { x: mark.x + velocity.x * flight + hand.x, y: mark.y + velocity.y * flight + hand.y };
    tank.turretAngle = Math.atan2(spot.y - pivot.y, spot.x - pivot.x);
    const reach = tankClass.weapon.kind === 'charge' ? tankClass.weapon.full.range : tankClass.shell.range + tankClass.look.muzzle;
    const wanted = range < 300 ? 0.45 : 1;
    seat.trigger = charged ? { fire: (weapon.charge ?? 0) < wanted } : { fire: range < reach, reach: range };
  };

  while (match.time < 120 && !match.capture.winner) {
    match.step(1 / 60);
    match.update(1 / 60);

    if (seat.weapon) {
      fired.set(seat.weapon, seat.weapon.shots);
    }

    for (const member of match.members) {
      if (member.team === seat.team || !member.tank) {
        continue;
      }

      const left = match.combat.armorLeft(member.tank);
      const before = armor.get(member.tank) ?? 1;

      if (left < before && member.attacker && member.attacker === seat.tank) {
        damage += before - left;
      }

      armor.set(member.tank, left);
    }
  }

  return { kills: seat.kills, deaths: seat.deaths, damage, shots: [...fired.values()].reduce((sum, shots) => sum + shots, 0), hits };
}

/**
 * How far a player sees around the tank, about a laptop screen at the default zoom; how far the
 * hand misses, in pixels at the target and more with range; and how long it holds one miss.
 */
const PLAYER_VIEW = 450;
const HAND_ERROR = 3;
const HAND_PER_PIXEL = 0.012;
const HAND_SETTLE = 0.3;

/** A standard normal sample by the Box-Muller transform. */
function gaussian(random: () => number) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(Math.PI * 2 * random());
}

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

  return createKothMatch(rapier, world, fakeRenderer(), {
    human: false,
    random: seeded(seed),
    rules: { ...CAPTURE_RULES, holdTime: 120 },
    ...options
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
