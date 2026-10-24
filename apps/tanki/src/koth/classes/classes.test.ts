import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor } from '../../arena/bodies';
import { createCombat } from '../../damage/combat';
import { raycastField, sampleField } from '../../damage/field';
import { SLOT_CELLS, type createRangeRenderer } from '../../damage/renderer';
import { createHullField } from '../../damage/shapes';
import type { Rapier } from '../../physics/Rapier2D';
import { inBase } from '../map';
import { createKothMatch } from '../match';
import { advanceCapture, CAPTURE_RULES, createCaptureState } from '../rules';
import { TANK_CLASS_IDS, type TankClassId } from '../tanks';
import { clampGun, turnInPlace } from './casemate';
import { TANK_CLASSES } from './classes';
import { pickRoster, rebalance } from './roster';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('the hulls of the classes', () => {
  it('fit a renderer slot and hide the core under armor thinnest at the rear', () => {
    for (const id of TANK_CLASS_IDS) {
      const { hull } = TANK_CLASSES[id];
      const field = createHullField(hull);
      const armorTo = (from: { x: number; y: number }, direction: { x: number; y: number }) => raycastField(field, from, direction, 100)!;

      expect(field.cols * field.rows).toBeLessThanOrEqual(SLOT_CELLS);
      expect(sampleField(field, hull.core.x, hull.core.y)[2]).toBeLessThan(0);
      expect(armorTo({ x: -60, y: 0 }, { x: 1, y: 0 }).part).toBe('armor');
      expect(hull.halfLength + hull.core.x - hull.core.radius).toBeLessThan(hull.halfWidth - hull.core.radius + 0.5);
    }
  });

  it('are thin on the Scout and thick on the Heavy', () => {
    const rear = (id: TankClassId) => TANK_CLASSES[id].hull.halfLength + TANK_CLASSES[id].hull.core.x - TANK_CLASSES[id].hull.core.radius;

    expect(rear('scout')).toBeLessThan(rear('soldier'));
    expect(rear('heavy')).toBeGreaterThan(rear('soldier'));
    expect(TANK_CLASSES.heavy.mass).toBeGreaterThan(2 * TANK_CLASSES.scout.mass);
  });
});

describe('a casemate gun', () => {
  it('swings only within its arc of the hull', () => {
    const { combat } = createBattle();
    const tank = combat.spawnTank({ x: 0, y: 0, rotation: 0.5 }, { color: 0 });
    const arc = 0.16;

    tank.turretAngle = 2;
    clampGun(tank, arc);

    expect(tank.turretAngle).toBeCloseTo(0.5 + arc);

    tank.turretAngle = -1;
    clampGun(tank, arc);

    expect(tank.turretAngle).toBeCloseTo(0.5 - arc);
  });

  it('turns its hull on the spot through the tow, without driving off', () => {
    const sniper = TANK_CLASSES.sniper;
    const { combat } = createBattle();
    const pull = pullSpeedFor(sniper.speed);
    const tank = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0, pullSpeed: pull, hull: sniper.hull, mass: sniper.mass, look: sniper.look });

    for (let step = 0; step < 90; step++) {
      combat.drive(tank, turnInPlace(tank, { x: 0, y: 0 }, 2.5, 2.4, pull));
      combat.step(1 / 60);
    }

    const at = tank.hull.translation();

    expect(tank.hull.rotation()).toBeGreaterThan(2.3);
    expect(Math.hypot(at.x, at.y)).toBeLessThan(25);
  });
});

describe('the bots pick a team', () => {
  it('of four with one Sniper and one Heavy at most, something to break Heavies and a quick capper', () => {
    let state = 7;
    const random = () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };

    for (let draw = 0; draw < 200; draw++) {
      const team = pickRoster(4, [], random);
      const count = (id: TankClassId) => team.filter((member) => member === id).length;

      expect(team).toHaveLength(4);
      expect(count('sniper')).toBeLessThanOrEqual(1);
      expect(count('heavy')).toBeLessThanOrEqual(1);
      expect(count('soldier') + count('demoman')).toBeGreaterThanOrEqual(1);
      expect(count('soldier') + count('scout')).toBeGreaterThanOrEqual(1);
    }
  });

  it('around the player, and a bot switches at its respawn when the player takes the class it had', () => {
    expect(pickRoster(4, ['sniper'], Math.random)).not.toContain('sniper');
    expect(rebalance(['sniper', 'soldier', 'scout'], 'sniper', 4, () => 0.5)).not.toBe('sniper');
    expect(rebalance(['heavy', 'soldier', 'scout'], 'demoman', 4, () => 0.5)).toBe('demoman');
  });
});

describe('a Scout on the point', () => {
  it('captures faster than any other class, counting as two tanks', () => {
    const timeToCapture = (weight: number) => {
      let state = { ...createCaptureState(CAPTURE_RULES), locked: 0 };
      let time = 0;

      while (!state.owner) {
        state = advanceCapture(state, { red: weight, blue: 0 }, 1 / 60);
        time += 1 / 60;
      }

      return time;
    };

    expect(TANK_CLASSES.scout.capture).toBe(2);
    expect(timeToCapture(TANK_CLASSES.scout.capture)).toBeLessThan(timeToCapture(TANK_CLASSES.soldier.capture) * 0.7);
  });
});

describe('the player choosing a class', () => {
  it('changes class at once in the base, and otherwise at the next respawn', () => {
    const match = createMatch();

    match.chooseClass('heavy');

    expect(match.seat.tankClass.id).toBe('heavy');
    expect(match.hud().player.tankClass).toBe('heavy');

    // Out of the base, the choice waits for the next respawn.
    const tank = match.player!;
    tank.hull.setTranslation({ x: 0, y: 0 }, true);
    tank.pull.setTranslation({ x: 15, y: 0 }, true);
    match.step(1 / 60);

    expect(inBase(match.map.bases.red, tank.hull.translation())).toBe(false);

    match.chooseClass('scout');

    expect(match.seat.tankClass.id).toBe('heavy');
    expect(match.player).toBe(tank);
    expect(match.hud().player.nextClass).toBe('scout');
  });

  it('keeps the class through a death and takes the next one on respawning', () => {
    const match = createMatch();
    const enemy = match.members.find((member) => member.team === 'blue')!;
    match.bots.clear();

    match.chooseClass('demoman');
    const tank = match.player!;
    tank.hull.setTranslation({ x: 0, y: 0 }, true);
    tank.pull.setTranslation({ x: 15, y: 0 }, true);
    match.step(1 / 60);
    match.chooseClass('sniper');

    expect(match.seat.tankClass.id).toBe('demoman');

    // An enemy shell into the player's core.
    for (let shot = 0; shot < 40 && match.player; shot++) {
      const core = match.combat.coreOf(tank)!;
      enemy.tank!.hull.setTranslation({ x: core.x - 120, y: core.y }, true);
      enemy.tank!.pull.setTranslation({ x: core.x - 105, y: core.y }, true);
      enemy.tank!.turretAngle = 0;
      match.combat.fire(enemy.tank!, { shell: { speed: 3000, range: 400, hole: 5, depth: 9, knockback: 0 } });

      for (let step = 0; step < 6; step++) {
        match.step(1 / 60);
      }
    }

    expect(match.player).toBeUndefined();
    expect(match.seat.tankClass.id).toBe('demoman');

    while (!match.player && match.time < 20) {
      match.step(1 / 60);
    }

    expect(match.seat.tankClass.id).toBe('sniper');
  });
});

/** A battle on a real Rapier world with a renderer that only hands out field slots. */
function createBattle() {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const combat = createCombat(rapier, world, fakeRenderer(), { halfWidth: 600, halfHeight: 400 });
  return { combat };
}

/** A seeded match with the player, on a renderer that only hands out field slots. */
function createMatch() {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  let state = 5;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  return createKothMatch(rapier, world, fakeRenderer(), { human: true, random });
}

function fakeRenderer() {
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

  return renderer as unknown as ReturnType<typeof createRangeRenderer>;
}
