import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { createRangeRenderer } from '../../damage/renderer';
import type { Rapier } from '../../physics/Rapier2D';
import type { KothMap } from '../map';
import { createKothMatch } from '../match';
import { CAPTURE_RULES } from '../rules';
import { TANK_CLASS_IDS, type TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';
import {
  applyClassTuning,
  CLASS_KNOBS,
  cleanClassTuning,
  formatKnob,
  knobDefault,
  knobRange,
  knobsOf,
  withKnob,
  type ClassKnob,
  type ClassKnobId
} from './knobs';
import { TACTICS } from './tactics';

afterEach(() => applyClassTuning({}));

describe('class knobs', () => {
  it('reach a number of some class with every knob, its default on a step of its range', () => {
    for (const knob of CLASS_KNOBS) {
      const owners = TANK_CLASS_IDS.filter((id) => knobsOf(id).some((own) => own.id === knob.id));

      expect(owners.length, knob.id).toBeGreaterThan(0);

      for (const id of owners) {
        const { min, max, step } = knobRange(id, knob);
        const value = knobDefault(id, knob);
        const steps = (value - min) / step;

        expect(value, `${id}.${knob.id}`).toBeGreaterThanOrEqual(min);
        expect(value, `${id}.${knob.id}`).toBeLessThanOrEqual(max);
        expect(Math.abs(steps - Math.round(steps)), `${id}.${knob.id}`).toBeLessThan(1e-6);
      }
    }
  });

  it('give each class the knobs of the numbers it has', () => {
    const has = (id: TankClassId, knob: ClassKnobId) => knobsOf(id).some((own) => own.id === knob);

    expect(TANK_CLASS_IDS.filter((id) => has(id, 'fragments'))).toEqual(['soldier']);
    expect(TANK_CLASS_IDS.filter((id) => has(id, 'pellets'))).toEqual(['scout']);
    expect(TANK_CLASS_IDS.filter((id) => has(id, 'drillGain'))).toEqual(['heavy']);
    expect(TANK_CLASS_IDS.filter((id) => has(id, 'fuse'))).toEqual(['demoman']);
    expect(TANK_CLASS_IDS.filter((id) => has(id, 'chargeTime') && has(id, 'gunArc') && has(id, 'perch'))).toEqual([
      'sniper'
    ]);
    // A rail hits at once and a casemate gun has no turret to turn.
    expect(has('sniper', 'shellSpeed') || has('sniper', 'turretSpeed')).toBe(false);
    // Every class has plating, at 1 where its hull leaves it out.
    expect(TANK_CLASS_IDS.every((id) => has(id, 'plating'))).toBe(true);
    expect(knobDefault('soldier', knob('plating'))).toBe(1);
  });

  it('change the classes in place and take the changes back with an empty tuning', () => {
    const soldier = TANK_CLASSES.soldier;
    const tactics = TACTICS.sniper;

    applyClassTuning({
      soldier: { speed: 400, interval: 0.4, blastRadius: 120, coreRadius: 6 },
      sniper: { fullRailPower: 60, retreat: 0.5, perch: 500 }
    });

    expect(TANK_CLASSES.soldier).toBe(soldier);
    expect(soldier.speed).toBe(400);
    expect(soldier.interval).toBe(0.4);
    expect(soldier.shell.blast?.radius).toBe(120);
    expect(soldier.hull.core.radius).toBe(6);
    expect(TANK_CLASSES.sniper.weapon.kind === 'charge' && TANK_CLASSES.sniper.weapon.full.rail?.power).toBe(60);
    expect(TACTICS.sniper).toBe(tactics);
    expect(tactics.retreat).toBe(0.5);
    expect(tactics.perch).toBe(500);
    // Other classes stay as written.
    expect(TANK_CLASSES.scout.speed).toBe(350);

    applyClassTuning({ soldier: { interval: 0.5 } });

    expect(soldier.speed).toBe(250);
    expect(soldier.interval).toBe(0.5);
    expect(soldier.hull.core.radius).toBe(4.5);

    applyClassTuning({});

    expect(soldier.interval).toBe(0.8);
    expect(soldier.shell.blast?.radius).toBe(65);
    expect(tactics.retreat).toBe(0.72);
  });

  it('move the core so the rear armor is as set, whatever the core radius', () => {
    const rear = () => {
      const hull = TANK_CLASSES.scout.hull;
      return hull.halfLength + hull.core.x - hull.core.radius;
    };

    expect(knobDefault('scout', knob('rearArmor'))).toBe(3);

    applyClassTuning({ scout: { rearArmor: 8 } });

    expect(rear()).toBe(8);

    applyClassTuning({ scout: { rearArmor: 8, coreRadius: 6 } });

    expect(rear()).toBe(8);
    expect(TANK_CLASSES.scout.hull.core.radius).toBe(6);

    // The core radius alone keeps the rear armor as written.
    applyClassTuning({ scout: { coreRadius: 6 } });

    expect(rear()).toBe(3);
  });

  it('read only known knobs of known classes with numbers in range, and name the rest', () => {
    const { tuning, dropped } = cleanClassTuning({
      soldier: { interval: 0.4, speed: 5000, warp: 3, mass: 1 },
      scout: { pellets: 6.5, spread: 0.3, fragments: 3 },
      sniper: 'fast',
      medic: { speed: 300 }
    });

    expect(tuning).toEqual({ soldier: { interval: 0.4 }, scout: { spread: 0.3 } });
    expect(dropped.sort()).toEqual(
      ['medic', 'scout.fragments', 'scout.pellets', 'sniper', 'soldier.speed', 'soldier.warp'].sort()
    );
    expect(cleanClassTuning(undefined)).toEqual({ tuning: {}, dropped: [] });
    expect(cleanClassTuning([1, 2])).toEqual({ tuning: {}, dropped: ['classes'] });
  });

  it('keep only differences from the defaults', () => {
    let tuning = withKnob({}, 'soldier', knob('interval'), 0.4);
    tuning = withKnob(tuning, 'soldier', knob('speed'), 300);

    expect(tuning).toEqual({ soldier: { interval: 0.4, speed: 300 } });

    tuning = withKnob(tuning, 'soldier', knob('interval'), 0.8);

    expect(tuning).toEqual({ soldier: { speed: 300 } });
    // A slider's value a hair off the default in floating point counts as the default.
    expect(withKnob(tuning, 'soldier', knob('speed'), 250.0000000001)).toEqual({});
  });

  it('show values in their display units, angles in degrees and shares in percent, to their steps', () => {
    expect(formatKnob(knob('speed'), 'soldier', 250)).toBe('250');
    expect(formatKnob(knob('interval'), 'soldier', 0.8)).toBe('0.80');
    expect(formatKnob(knob('interval'), 'heavy', 0.1)).toBe('0.10');
    expect(formatKnob(knob('gunArc'), 'sniper', 0.16)).toBe('9.2');
    expect(formatKnob(knob('dodge'), 'scout', 0.6)).toBe('60');
    expect(formatKnob(knob('pointPriority'), 'scout', -5)).toBe('-5');
  });
});

describe('class knobs in a match', () => {
  let rapier: Rapier;

  beforeAll(async () => {
    rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
  });

  it('fire as often as the shot interval says, at once for a weapon already in hand', () => {
    const match = createDuel(rapier);
    const gaps = (seconds: number) => {
      const times: number[] = [];

      for (let step = 0; step < seconds * 60; step++) {
        const before = match.seat.weapon!.shots;
        match.step(1 / 60, { drive: STILL, aim: 0, fire: true });

        if (match.seat.weapon!.shots > before) {
          times.push(match.time);
        }
      }

      // The first shot after a change waits out the interval it was fired under.
      return times.slice(2).map((time, index) => time - times[index + 1]);
    };

    const asWritten = gaps(6);
    applyClassTuning({ soldier: { interval: 0.4 } });
    const halved = gaps(6);

    // Six seconds of a held trigger: eight rockets, then fourteen once the last 0.8 s wait ran out.
    expect(asWritten.length).toBe(6);
    expect(halved.length).toBe(12);
    asWritten.forEach((gap) => expect(gap).toBeCloseTo(0.8, 5));
    halved.forEach((gap) => expect(gap).toBeCloseTo(0.4, 5));
  });

  it('drive at the speed set, at once', () => {
    const drift = (speed: number | undefined) => {
      applyClassTuning(speed === undefined ? {} : { soldier: { speed } });
      const match = createDuel(rapier);
      const start = match.player!.hull.translation();

      for (let step = 0; step < 60; step++) {
        match.step(1 / 60, { drive: { x: 0, y: 1 }, fire: false });
      }

      return match.player!.hull.translation().y - start.y;
    };

    const asWritten = drift(undefined);
    const faster = drift(400);

    expect(asWritten).toBeGreaterThan(150);
    expect(faster / asWritten).toBeGreaterThan(1.4);
  });

  it('chip as big a crater as the shell is set to', () => {
    const lost = (tuning: Parameters<typeof applyClassTuning>[0]) => {
      applyClassTuning(tuning);
      const match = createDuel(rapier);
      const enemy = match.members[1];
      match.step(1 / 60, { drive: STILL, aim: 0, fire: true });

      for (let step = 0; step < 60; step++) {
        match.step(1 / 60, { drive: STILL, aim: 0, fire: false });
      }

      return enemy.tank ? 1 - match.combat.armorLeft(enemy.tank) : 1;
    };

    const asWritten = lost({});
    const bigger = lost({ soldier: { hole: 6, depth: 5 } });

    expect(asWritten).toBeGreaterThan(0);
    expect(bigger).toBeGreaterThan(asWritten * 1.5);
  });

  it('give a new hull only to tanks spawned after the change', () => {
    const match = createDuel(rapier);
    const before = match.player!;

    applyClassTuning({ soldier: { coreRadius: 6 } });

    expect(match.combat.hullOf(before)?.core.radius).toBe(4.5);

    match.restart();

    expect(match.combat.hullOf(match.player!)?.core.radius).toBe(6);
  });
});

/** The knob of `CLASS_KNOBS` named `id`. */
function knob(id: ClassKnobId): ClassKnob {
  return CLASS_KNOBS.find((candidate) => candidate.id === id)!;
}

const STILL = { x: 0, y: 0 };

/**
 * A match on an open field of the player's Soldier at (-150, 0) facing +x against a still blue
 * Soldier at (0, 0) facing +y, its side to the player's gun; the blue bot does nothing.
 */
function createDuel(rapier: Rapier) {
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
  const match = createKothMatch(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, {
    human: true,
    random: () => 0.5,
    map: OPEN_FIELD,
    roster: { red: ['soldier'], blue: ['soldier'] },
    rules: { ...CAPTURE_RULES, unlockTime: 1e9 }
  });
  match.bots.get(match.members[1])!.step = () => {};
  return match;
}

/** An open field 1800 x 900 px with the bases' zones far in the corners, so nobody mends. */
const OPEN_FIELD: KothMap = {
  halfWidth: 900,
  halfHeight: 450,
  walls: [],
  crates: [],
  point: { x: 600, y: 300, radius: 60 },
  bases: {
    red: { zone: { x: -880, y: -430, halfWidth: 10, halfHeight: 10 }, spawns: [{ x: -150, y: 0, rotation: 0 }] },
    blue: { zone: { x: 880, y: 430, halfWidth: 10, halfHeight: 10 }, spawns: [{ x: 0, y: 0, rotation: Math.PI / 2 }] }
  },
  lanes: {
    red: { center: { x: -150, y: 0 }, north: { x: -150, y: -200 }, south: { x: -150, y: 200 } },
    blue: { center: { x: 0, y: 0 }, north: { x: 0, y: -200 }, south: { x: 0, y: 200 } }
  },
  kits: []
};
