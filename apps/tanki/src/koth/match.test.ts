import { beforeAll, describe, expect, it } from 'vitest';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { inBase, onPoint } from './map';
import { createKothMatch } from './match';
import { CAPTURE_RULES } from './rules';
import { MEDIUM_TANK } from './tanks';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('king of the hill with eight bots', () => {
  it('reaches the point, takes it once it opens, fights over it and never gets stuck for long', () => {
    const match = createMatch(7);
    const watch = watchMovement(match);
    let firstCapture: number | undefined;
    let contested = 0;

    while (match.time < 150) {
      tick(match);
      watch.sample();

      if (match.capture.owner) {
        firstCapture ??= match.time;
      }

      if (match.capture.contested) {
        contested += 1 / 60;
      }
    }

    expect(firstCapture).toBeGreaterThan(CAPTURE_RULES.unlockTime);
    expect(firstCapture).toBeLessThan(90);
    // Both teams fight on the point for a while, and shoot through to cores.
    expect(contested).toBeGreaterThan(3);
    expect(match.members.reduce((total, member) => total + member.kills, 0)).toBeGreaterThanOrEqual(2);

    for (const bot of match.bots.values()) {
      expect(bot.driver.longestStall).toBeLessThan(1.5);
    }

    // A bot that wants to go somewhere far gets there: it rarely spends a whole window of four
    // seconds in one place, and never two in a row.
    expect(watch.stuck / watch.windows).toBeLessThan(0.05);
    expect(watch.longest).toBeLessThan(2);
  }, 60_000);

  it('fires only at enemies in sight within the reach of a screen, at a measured pace', () => {
    const match = createMatch(11);
    const ranges: number[] = [];
    const fire = match.combat.fire;
    match.combat.fire = (tank) => {
      const shooter = match.members.find((member) => member.tank === tank)!;
      const at = tank.hull.translation();
      const seen = match.members
        .filter((member) => member.team !== shooter.team && member.tank)
        .map((member) => member.tank!.hull.translation())
        .filter((enemy) => match.combat.lineOfSight(at, enemy))
        .map((enemy) => Math.hypot(enemy.x - at.x, enemy.y - at.y));
      ranges.push(Math.min(...seen));
      fire(tank);
    };

    while (match.time < 120) {
      tick(match);
    }

    // The point opens at 30 s; from then on the eight tanks fight on and off.
    expect(ranges.length).toBeGreaterThan(40);
    expect(ranges.length / 8 / 2).toBeLessThan(30);
    expect(Math.max(...ranges)).toBeLessThan(500);
  }, 60_000);

  it('brings destroyed tanks back at their base in waves', () => {
    const match = createMatch(3);
    const deaths = new Map<number, number>();
    let respawned = 0;

    while (match.time < 300 && respawned < 3) {
      tick(match);

      for (const member of match.members) {
        if (!member.tank && !deaths.has(member.id)) {
          deaths.set(member.id, match.time);
        } else if (member.tank && deaths.has(member.id)) {
          const away = match.time - deaths.get(member.id)!;
          expect(away).toBeGreaterThan(4.9);
          expect(away).toBeLessThan(11.1);
          // Waves come every six seconds of match time.
          expect(match.time % 6).toBeLessThan(0.05);
          expect(inBase(match.map.bases[member.team], member.tank.hull.translation())).toBe(true);
          deaths.delete(member.id);
          respawned++;
        }
      }
    }

    expect(respawned).toBe(3);
  }, 60_000);

  it('declares the team that held the point long enough the winner, and starts over', () => {
    const match = createMatch(11, { ...CAPTURE_RULES, holdTime: 15 });

    while (match.time < 180 && !match.capture.winner) {
      tick(match);
    }

    const winner = match.capture.winner;

    expect(winner).toBeDefined();
    expect(match.capture.held[winner!]).toBe(15);
    expect(match.hud().teams[winner!].left).toBe(0);

    match.restart();

    expect(match.capture.winner).toBeUndefined();
    expect(match.capture.locked).toBe(CAPTURE_RULES.unlockTime);
    expect(match.time).toBe(0);
    expect(match.members.every((member) => member.tank && member.kills === 0)).toBe(true);
    expect(match.members.every((member) => !onPoint(match.map, member.tank!.hull.translation()))).toBe(true);
  }, 60_000);
});

describe('king of the hill with the player', () => {
  it('mends the armor of a tank in its own base', () => {
    const match = createMatch(5, CAPTURE_RULES, true);
    const player = match.player!;
    const enemy = match.members.find((member) => member.team === 'blue')!.tank!;
    const at = player.hull.translation();
    const away = { hull: enemy.hull.translation(), pull: enemy.pull.translation() };

    // A blue tank, facing west like at its spawn, drops by and puts a few shells into the front of
    // the player's tank in red's base.
    enemy.hull.setTranslation({ x: at.x + 80, y: at.y }, true);
    enemy.pull.setTranslation({ x: at.x + 65, y: at.y }, true);

    for (let shot = 0; shot < 3; shot++) {
      enemy.turretAngle = Math.PI + (shot - 1) * 0.04;
      match.combat.fire(enemy);

      for (let step = 0; step < 20; step++) {
        match.step(1 / 60);
      }
    }

    enemy.hull.setTranslation(away.hull, true);
    enemy.pull.setTranslation(away.pull, true);
    const chipped = match.combat.armorLeft(player);

    for (let step = 0; step < 180; step++) {
      match.step(1 / 60);
    }

    expect(chipped).toBeLessThan(0.95);
    expect(inBase(match.map.bases.red, player.hull.translation())).toBe(true);
    expect(match.combat.armorLeft(player)).toBeGreaterThan(chipped + (1 - chipped) * 0.8);
  });

  it('lets the player drive and aim while bots fill the other seats, and hands the seat to a bot when watching', () => {
    const match = createMatch(5, CAPTURE_RULES, true);
    const start = match.player!.hull.translation();
    const turret = match.player!.turretAngle;

    for (let step = 0; step < 60; step++) {
      match.step(1 / 60, { drive: { x: 0, y: 1 }, aim: turret + Math.PI, fire: false });
    }

    const moved = match.player!.hull.translation();

    expect(match.bots.has(match.seat)).toBe(false);
    expect(moved.y - start.y).toBeGreaterThan(100);
    // Half a turn takes the turret longer than a second.
    expect(Math.abs(match.player!.turretAngle - turret)).toBeCloseTo(MEDIUM_TANK.turretSpeed, 1);

    match.spectate(true);

    expect(match.player).toBeUndefined();
    expect(match.bots.has(match.seat)).toBe(true);

    let planned = false;

    for (let step = 0; step < 300; step++) {
      tick(match);
      planned ||= match.bots.get(match.seat)!.thought().goal !== undefined;
    }

    expect(planned).toBe(true);

    match.spectate(false);

    expect(match.player).toBe(match.seat.tank);
  });

  it('fires the clip one interval apart and reloads it', () => {
    const match = createMatch(5, CAPTURE_RULES, true);
    const shots: number[] = [];

    for (let step = 0; step < 300; step++) {
      const before = match.hud().player.rounds;
      match.step(1 / 60, { drive: { x: 0, y: 0 }, fire: true });

      if (match.hud().player.rounds < before) {
        shots.push(match.time);
      }
    }

    expect(shots).toHaveLength(MEDIUM_TANK.gun.clip);
    expect(shots[1] - shots[0]).toBeCloseTo(MEDIUM_TANK.gun.interval, 1);

    for (let step = 0; step < 300; step++) {
      match.step(1 / 60);
    }

    expect(match.hud().player.rounds).toBe(MEDIUM_TANK.gun.clip);
  });
});

/** A match on a real Rapier world with a renderer that only hands out field slots, seeded for repeatable runs. */
function createMatch(seed: number, rules = CAPTURE_RULES, human = false) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 256 }, (_, index) => 255 - index);
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

  return createKothMatch(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, { human, random, rules });
}

/** One physics step and one frame of effects, which also frees the field slots of old debris. */
function tick(match: ReturnType<typeof createMatch>) {
  match.step(1 / 60);
  match.update(1 / 60);
}

/**
 * Every four seconds, checks each bot with somewhere far to go: a window in which it moved less
 * than 30 px counts as stuck.
 */
function watchMovement(match: ReturnType<typeof createMatch>) {
  const last = new Map<number, { x: number; y: number; streak: number }>();
  const result = { windows: 0, stuck: 0, longest: 0, sample };
  let next = 4;

  return result;

  function sample() {
    if (match.time < next) {
      return;
    }

    next += 4;

    for (const [member, bot] of match.bots) {
      const position = member.tank?.hull.translation();
      const before = last.get(member.id);
      const destination = bot.driver.destination;
      const far = position && destination && Math.hypot(destination.x - position.x, destination.y - position.y) > 80;
      let streak = 0;

      if (position && before && far) {
        result.windows++;

        if (Math.hypot(position.x - before.x, position.y - before.y) < 30) {
          result.stuck++;
          streak = before.streak + 1;
          result.longest = Math.max(result.longest, streak);
        }
      }

      if (position) {
        last.set(member.id, { x: position.x, y: position.y, streak });
      } else {
        last.delete(member.id);
      }
    }
  }
}
