import { beforeAll, describe, expect, it } from 'vitest';
import type { Tank } from '../arena/bodies';
import { carve } from '../damage/field';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { inBase, onPoint } from './map';
import { createKothMatch } from './match';
import { TANK_CLASSES } from './classes/classes';
import { TACTICS } from './classes/tactics';
import { CAPTURE_RULES } from './rules';
import { MEDIUM_TANK, type TankClassId } from './tanks';

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

  it('fires only at enemies within its reach, in sight unless it lobs grenades over cover, at a measured pace', () => {
    const match = createMatch(11);
    const shots: { tankClass: TankClassId; range: number }[] = [];
    const fire = match.combat.fire;
    match.combat.fire = (tank, shot) => {
      const shooter = match.members.find((member) => member.tank === tank)!;
      const at = tank.hull.translation();
      const lobs = shooter.tankClass.weapon.kind === 'lob';
      const seen = match.members
        .filter((member) => member.team !== shooter.team && member.tank)
        .map((member) => member.tank!.hull.translation())
        .filter((enemy) => lobs || match.combat.lineOfSight(at, enemy))
        .map((enemy) => Math.hypot(enemy.x - at.x, enemy.y - at.y));
      shots.push({ tankClass: shooter.tankClass.id, range: Math.min(...seen) });
      fire(tank, shot);
    };

    while (match.time < 120) {
      tick(match);
    }

    const classes = new Set(shots.map((shot) => shot.tankClass));
    const aimed = shots.filter((shot) => shot.tankClass !== 'heavy');

    // The point opens at 30 s; from then on the eight tanks fight on and off, every class firing.
    expect(classes.size).toBeGreaterThanOrEqual(3);
    expect(aimed.length).toBeGreaterThan(40);
    expect(aimed.length / 8 / 2).toBeLessThan(30);

    for (const shot of shots) {
      const reach = TANK_CLASSES[shot.tankClass].weapon.kind === 'lob' ? TANK_CLASSES[shot.tankClass].shell.range : TACTICS[shot.tankClass].reach;
      expect(shot.range).toBeLessThan(reach + 80);
    }
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

    // A wave may bring several back in the same step.
    expect(respawned).toBeGreaterThanOrEqual(3);
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

  it('keeps fighting after a restart, which turns the clock back', () => {
    const match = createMatch(5);
    const shotsUntil = (time: number) => {
      let shots = 0;
      const fire = match.combat.fire;
      match.combat.fire = (tank) => {
        shots++;
        fire(tank);
      };

      while (match.time < time) {
        tick(match);
      }

      match.combat.fire = fire;
      return shots;
    };

    expect(shotsUntil(90)).toBeGreaterThan(20);

    match.restart();

    expect(shotsUntil(90)).toBeGreaterThan(20);
  }, 60_000);
});

describe('king of the hill with the player', () => {
  it('mends the armor of a tank in its own base', () => {
    const match = createMatch(5, CAPTURE_RULES, true);
    const player = match.player!;
    const enemy = match.members.find((member) => member.team === 'blue')!.tank!;
    const at = player.hull.translation();
    const away = { hull: enemy.hull.translation(), pull: enemy.pull.translation() };

    // Bots stay out of it, so red's bots in the base do not shoot the visitor first.
    match.bots.clear();

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

  it('mends a damaged tank that drives over a repair kit, and lays the kit out again ten seconds later', () => {
    const match = createMatch(5, CAPTURE_RULES, true);
    const player = match.player!;
    const large = match.kits.kits.find((kit) => kit.size === 'large')!;
    const small = match.kits.kits.find((kit) => kit.size === 'small')!;
    match.bots.clear();

    chip(match, player, 4);
    const chipped = match.combat.armorLeft(player);
    place(player, small);
    match.step(1 / 60);
    const mended = match.combat.armorLeft(player);

    // A small kit mends part of the damage, a large one all of it.
    expect(chipped).toBeLessThan(0.9);
    expect(mended).toBeGreaterThan(chipped + 0.01);
    expect(mended).toBeLessThan(0.99);
    expect(small.readyAt).toBeCloseTo(match.time + 10, 5);
    expect(match.hud().player.mending).toBe(true);

    place(player, large);
    match.step(1 / 60);

    expect(match.combat.armorLeft(player)).toBeGreaterThan(0.999);

    // Whole again, the tank drives over the small kit's pad until the kit comes back, and leaves it lying.
    place(player, small);

    for (let step = 0; step < 600; step++) {
      match.step(1 / 60);
    }

    expect(small.readyAt).toBeLessThanOrEqual(match.time);
    expect(match.kits.pickups).toBe(2);
  });

  it('sends a bot with chipped armor to a repair kit nearer than its base', () => {
    const match = createMatch(5);
    const member = match.members.find((candidate) => candidate.team === 'red' && candidate.index === 2)!;
    const bot = match.bots.get(member)!;
    const kit = match.kits.kits.find((candidate) => candidate.size === 'large' && candidate.x < 0 && candidate.y < 0)!;
    const tank = member.tank!;

    for (const other of match.members) {
      if (other !== member) {
        match.bots.delete(other);
      }
    }

    place(tank, match.map.lanes.red.north);

    // Hulls of every class: chip until the armor is low, as a bot judges it.
    for (let holes = 6; match.combat.armorLeft(tank) >= 0.72 && holes < 12; holes++) {
      chip(match, tank, holes);
    }

    const chipped = match.combat.armorLeft(tank);

    while (match.time < 6 && kit.readyAt === 0) {
      tick(match);
    }

    expect(chipped).toBeLessThan(0.72);
    expect(bot.stats.actions.pickUpKit?.started).toBeGreaterThanOrEqual(1);
    expect(kit.readyAt).toBeGreaterThan(0);
    expect(match.combat.armorLeft(tank)).toBeGreaterThan(0.99);
  });

  it('lets the player drive and aim while bots fill the other seats, and hands the seat to a bot when watching', () => {
    const match = createMatch(5, CAPTURE_RULES, true);
    const start = match.player!.hull.translation();
    const turret = match.player!.turretAngle;

    match.step(1 / 60, { drive: { x: 0, y: 1 }, aim: turret + Math.PI, fire: false });

    // The turret follows the aim at once, as in a shooter.
    expect(match.player!.turretAngle).toBeCloseTo(turret + Math.PI);

    for (let step = 1; step < 60; step++) {
      match.step(1 / 60, { drive: { x: 0, y: 1 }, aim: turret + Math.PI, fire: false });
    }

    const moved = match.player!.hull.translation();

    expect(match.bots.has(match.seat)).toBe(false);
    expect(moved.y - start.y).toBeGreaterThan(100);

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

  return createKothMatch(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, { human, random, rules });
}

/** Puts a tank and its tow point at `spot`, at rest. */
function place(tank: Tank, spot: { x: number; y: number }) {
  tank.hull.setTranslation({ x: spot.x, y: spot.y }, true);
  tank.pull.setTranslation({ x: spot.x + 15, y: spot.y }, true);
  tank.hull.setLinvel({ x: 0, y: 0 }, true);
}

/** Chips `holes` holes into the armor of `tank` along its rear and its left side, as hits there would. */
function chip(match: ReturnType<typeof createMatch>, tank: Tank, holes: number) {
  const field = match.combat.armorOf(tank)!;

  for (let hole = 0; hole < holes; hole++) {
    carve(field, { x: -19, y: (hole - (holes - 1) / 2) * 4 }, 5, 0.2, hole);
    carve(field, { x: (hole - (holes - 1) / 2) * 5, y: -12 }, 5, 0.2, hole + 50);
  }

  // Mending by a hair makes the battle refresh the tank's shape with the next step.
  match.combat.repair(tank, 1e-9);
  match.step(1 / 60);
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
