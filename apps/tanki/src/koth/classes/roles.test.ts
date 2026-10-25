import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor } from '../../arena/bodies';
import { createCombat, type ShellSpec } from '../../damage/combat';
import type { createRangeRenderer } from '../../damage/renderer';
import type { Rapier } from '../../physics/Rapier2D';
import { PACE_DEFAULTS, type Pace } from '../pace';
import { MEDIUM_TANK, type TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';
import { chargedShell, createWeapon } from './weapon';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe("the Scout's scattergun", () => {
  it("blows a Soldier up with one volley into its rear from point blank, and only chips it from beyond the scattergun's point-blank range", () => {
    const close = createDuel('scout', 'rear', 70);
    close.fireHeld(1);

    expect(close.destroyed()).toBe(true);

    const far = createDuel('scout', 'rear', 240);
    far.fireHeld(1);

    expect(far.destroyed()).toBe(false);
    expect(far.armorLeft()).toBeGreaterThan(0.95);
  });
});

describe("the Heavy's gatling", () => {
  it("drills to a Soldier's core from its side at mid range, aimed by a shaky hand, in a fraction of the rounds the same stream takes without drilling", () => {
    // The median of five streams at the match's pace, each scattered by its own seed and a hand
    // missing by up to 4 px, from 250 px, where rounds rarely land in the same hole by chance.
    const rounds = (shell: ShellSpec) => {
      const counts = [1, 2, 3, 4, 5].map((seed) => createDuel('heavy', 'side', 250, shell, 'soldier', seed, { pace: PACE_DEFAULTS, hand: 4 }).fireUntilDestroyed(150));
      return counts.sort((a, b) => a - b)[2];
    };
    const drilling = rounds(TANK_CLASSES.heavy.shell);
    const scattered = rounds({ ...TANK_CLASSES.heavy.shell, drill: undefined });

    expect(drilling).toBeLessThan(30);
    expect(scattered).toBeGreaterThan(drilling * 3);
  });

  it("takes a Demoman grenade's blast on its plated side with less armor lost than a Soldier's side", () => {
    const lost = (id: TankClassId) => {
      const { combat, target } = createDuel('soldier', 'side', 200, undefined, id);
      const hull = TANK_CLASSES[id].hull;
      combat.blast({ x: 0, y: hull.halfWidth + 6 }, TANK_CLASSES.demoman.shell.blast!);
      // The armor's area is measured anew as the battle steps.
      combat.step(1 / 60);
      return (1 - combat.armorLeft(target)) * TANK_CLASSES[id].hull.halfLength * TANK_CLASSES[id].hull.halfWidth;
    };

    expect(lost('heavy')).toBeLessThan(lost('soldier') * 0.75);
  });
});

describe("the Sniper's rail", () => {
  it('blows a tank up when fully charged and passing just beside its core, which a half charge on the same line only slits', () => {
    const { shell, weapon } = TANK_CLASSES.sniper;
    const full = weapon.kind === 'charge' ? weapon.full : shell;
    const core = MEDIUM_TANK.hull.core;
    // From the side, 1.5 px past the rim of the core.
    const across = core.x - core.radius - 1.5;
    const shoot = (charge: number) => {
      const { combat, target, shooter } = createDuel('sniper', 'side', 300);
      // The gun sits off the hull's middle: move the hull so the muzzle's line runs where wanted.
      shooter.turretAngle = -Math.PI / 2;
      const muzzle = combat.muzzleOf(shooter);
      const at = shooter.hull.translation();
      shooter.hull.setTranslation({ x: at.x + across - muzzle.x, y: at.y }, true);
      combat.fire(shooter, { shell: chargedShell(shell, full, charge), angle: -Math.PI / 2 });
      return combat.armorOf(target) === undefined;
    };

    expect(shoot(1)).toBe(true);
    expect(shoot(0.5)).toBe(false);
  });
});

/**
 * A still target of class `targetId` at the origin facing +x, and a shooter of class `id` `range`
 * px away behind it, at its side or in front, facing it, on an empty field with seeded randomness.
 *
 * @param shell - Replaces the shooter's shell, to weigh a rule against the shell without it.
 * @param seed - Seeds the spread of the shooter's rounds and the outlines of the holes.
 * @param options.pace - The battle's pace; defaults to shells and hits as their specs say.
 * @param options.hand - Pixels by which the aim misses the core at most, drawn anew every 0.3 s; defaults to 0.
 */
function createDuel(
  id: TankClassId,
  side: 'rear' | 'side' | 'front',
  range: number,
  shell?: ShellSpec,
  targetId: TankClassId = 'soldier',
  seed = 1,
  options: { pace?: Pace; hand?: number } = {}
) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  let state = seed * 4242;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const pace = options.pace;
  const combat = createCombat(rapier, world, fakeRenderer(), { halfWidth: 1200, halfHeight: 900 }, { shell: MEDIUM_TANK.shell, friendlyFire: false, random, pace: pace && (() => pace) });
  const spawn = (classId: TankClassId, at: { x: number; y: number }, rotation: number, team: string) => {
    const tankClass = TANK_CLASSES[classId];
    return combat.spawnTank({ ...at, rotation }, { color: 0, team, pullSpeed: pullSpeedFor(tankClass.speed), hull: tankClass.hull, mass: tankClass.mass, look: tankClass.look });
  };
  const target = spawn(targetId, { x: 0, y: 0 }, 0, 'blue');
  const angle = side === 'rear' ? Math.PI : side === 'side' ? Math.PI / 2 : 0;
  const shooter = spawn(id, { x: Math.cos(angle) * range, y: Math.sin(angle) * range }, angle + Math.PI, 'red');
  const tankClass = shell ? { ...TANK_CLASSES[id], shell } : TANK_CLASSES[id];
  const weapon = createWeapon(tankClass, random);
  let shots = 0;
  let steps = 0;
  let miss = { x: 0, y: 0 };

  return {
    combat,
    target,
    shooter,
    destroyed: () => combat.armorOf(target) === undefined,
    armorLeft: () => combat.armorLeft(target),

    /** Holds the trigger for `seconds`, aiming at the target's core, firing at most one shot, then lets the shells land. */
    fireHeld(seconds: number) {
      for (let step = 0; step < seconds * 60; step++) {
        stepOnce(shots === 0);
      }
    },

    /** Holds the trigger, aiming at the target's core, until it blows up or `most` shots were fired; returns the shots fired. */
    fireUntilDestroyed(most: number) {
      for (let step = 0; step < 1200 && combat.armorOf(target) && shots < most; step++) {
        stepOnce(true);
      }

      return combat.armorOf(target) ? Infinity : shots;
    }
  };

  function stepOnce(fire: boolean) {
    const core = combat.coreOf(target);
    const hand = options.hand ?? 0;

    if (steps++ % HAND_STEPS === 0) {
      miss = { x: (random() * 2 - 1) * hand, y: (random() * 2 - 1) * hand };
    }

    if (core) {
      const pivot = combat.gunPivotOf(shooter);
      shooter.turretAngle = Math.atan2(core.y + miss.y - pivot.y, core.x + miss.x - pivot.x);
      combat.drive(target, { x: 0, y: 0 });
    }

    for (const shot of weapon.step(1 / 60, { fire, reach: range })) {
      combat.fire(shooter, { ...shot, angle: shooter.turretAngle + (shot.angle ?? 0) });
      shots++;
    }

    combat.step(1 / 60);
  }
}

/** Steps a hand holds one miss for. */
const HAND_STEPS = 18;

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
