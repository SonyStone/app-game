import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import { createCombat, type BlastSpec, type ShellSpec } from './combat';
import type { createRangeRenderer } from './renderer';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('battle core', () => {
  it('lets shots pass through teammates without friendly fire and credits the shooter', () => {
    const { combat, hits } = createBattle({ friendlyFire: false });
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000, team: 'red' });
    const teammate = combat.spawnTank({ x: -100, y: 0, rotation: 0 }, { color: 0xff0000, team: 'red' });
    const enemy = combat.spawnTank({ x: 50, y: 0, rotation: 0 }, { color: 0x0000ff, team: 'blue' });

    combat.fire(shooter);

    expect(combat.armorLeft(teammate)).toBe(1);
    expect(hits).toEqual([{ target: enemy, shooter }]);
    expect(combat.teamOf(enemy)).toBe('blue');
  });

  it('sees past tanks but not through walls or crates', () => {
    const { combat } = createBattle({}, { walls: [{ x: 0, y: -150, halfWidth: 12, halfHeight: 60 }], crates: [{ x: 0, y: 150, rotation: 0 }] });
    combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });
    // Rapier answers ray queries from the state of the last step.
    combat.step(1 / 60);

    expect(combat.lineOfSight({ x: -200, y: 0 }, { x: 200, y: 0 })).toBe(true);
    expect(combat.lineOfSight({ x: -200, y: -150 }, { x: 200, y: -150 })).toBe(false);
    expect(combat.lineOfSight({ x: -200, y: 150 }, { x: 200, y: 150 })).toBe(false);
  });

  it('mends chipped armor back toward new', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0 });
    // Facing the shooter, so the shots chip the thick front and never reach the core behind the thin rear.
    const target = combat.spawnTank({ x: 0, y: 0, rotation: Math.PI }, { color: 0 });

    for (let shot = 0; shot < 10; shot++) {
      shooter.turretAngle = (shot - 5) * 0.01;
      combat.fire(shooter);
      combat.step(1 / 60);
    }

    const chipped = combat.armorLeft(target);
    combat.repair(target, 1);
    combat.step(1 / 60);

    expect(chipped).toBeLessThan(0.97);
    expect(combat.armorLeft(target)).toBeCloseTo(1, 2);
    expect(combat.isCoreOpen(target)).toBe(false);
  });
});

describe('shells', () => {
  const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

  it('fly for a while before they hit', () => {
    const { combat, hits } = createBattle({ shell });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter);
    run(combat, 0.15);

    expect(hits).toHaveLength(0);
    expect(combat.shells).toHaveLength(1);

    run(combat, 0.2);

    expect(hits).toEqual([{ target, shooter }]);
    expect(combat.shells).toHaveLength(0);
    expect(combat.armorLeft(target)).toBeLessThan(0.97);
  });

  it('fall once they have flown their range', () => {
    const { combat, shots } = createBattle({ shell }, { halfWidth: 1500 });
    const shooter = combat.spawnTank({ x: -1200, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter);
    run(combat, 0.7);

    expect(combat.shells).toHaveLength(1);

    run(combat, 0.2);

    expect(combat.shells).toHaveLength(0);
    expect(shots).toHaveLength(1);
    expect(pathLength(shots[0])).toBeCloseTo(shell.range, 0);
  });

  it('glance off armor and fly on with the range they have left', () => {
    const { combat, hits, shots } = createBattle({ shell }, { halfWidth: 1500 });
    const shooter = combat.spawnTank({ x: -300, y: -40, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });
    shooter.turretAngle = Math.atan2(27.5, 300);

    combat.fire(shooter);
    run(combat, 1);

    expect(hits).toEqual([{ target, shooter }]);
    expect(shots[0]).toHaveLength(3);
    expect(pathLength(shots[0])).toBeLessThanOrEqual(shell.range + 1e-6);
    expect(combat.armorLeft(target)).toBeGreaterThan(0.99);
  });
});

describe('blasts', () => {
  const blast: BlastSpec = { radius: 80, hole: 4, depth: 1.5, knockback: 400 };

  it('chip and push every tank in reach on the side facing them, but not one behind a wall', () => {
    const { combat, hits } = createBattle({}, { walls: [{ x: 0, y: 110, halfWidth: 80, halfHeight: 8 }] });
    const near = combat.spawnTank({ x: 45, y: 0, rotation: 0 }, { color: 0 });
    const far = combat.spawnTank({ x: 250, y: 0, rotation: 0 }, { color: 0 });
    const hidden = combat.spawnTank({ x: 0, y: 150, rotation: 0 }, { color: 0 });
    combat.step(1 / 60);
    const before = near.hull.translation().x;

    combat.blast({ x: 0, y: 0 }, blast);
    run(combat, 0.3);

    expect(combat.armorLeft(near)).toBeLessThan(0.995);
    expect(near.hull.translation().x).toBeGreaterThan(before + 3);
    expect(combat.armorLeft(far)).toBe(1);
    expect(combat.armorLeft(hidden)).toBe(1);
    expect(hits).toEqual([{ target: near, shooter: undefined }]);
  });

  it('reach crates too, which they shove, harder for a heavier blast', () => {
    const shoved = (knockback: number) => {
      const { combat } = createBattle({}, { crates: [{ x: 50, y: 0, rotation: 0 }] });
      combat.step(1 / 60);
      combat.blast({ x: 0, y: 0 }, { ...blast, knockback, structures: 3 });
      run(combat, 0.3);
      return combat.crates[0].x - 50;
    };

    expect(shoved(4000)).toBeGreaterThan(shoved(400));
    expect(shoved(400)).toBeGreaterThan(0);
  });

  it('spare teammates and their own tank, which they neither chip nor push', () => {
    const { combat } = createBattle({ friendlyFire: false });
    const shooter = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0, team: 'red' });
    const mate = combat.spawnTank({ x: 0, y: 60, rotation: 0 }, { color: 0, team: 'red' });
    combat.step(1 / 60);

    combat.blast({ x: -28, y: 0 }, { ...blast, knockback: 4000 }, shooter);
    run(combat, 0.6);

    expect(combat.isAirborne(shooter)).toBe(false);
    expect(Math.abs(shooter.hull.translation().x)).toBeLessThan(2);
    expect(combat.armorLeft(shooter)).toBe(1);
    expect(combat.armorLeft(mate)).toBe(1);
  });

  it('destroy a core that a hole had opened before, but not through the hole they chip themselves', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -250, y: 0, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });
    combat.step(1 / 60);

    combat.blast({ x: -23, y: 0 }, { ...blast, hole: 6, depth: 4, knockback: 0 });
    combat.step(1 / 60);

    expect(combat.isCoreOpen(target)).toBe(true);
    expect(combat.armorOf(target)).toBeDefined();

    target.hull.setTranslation({ x: 0, y: 0 }, true);
    combat.blast({ x: -32, y: 0 }, { ...blast, knockback: 0 }, shooter);

    expect(combat.armorOf(target)).toBeUndefined();
  });

  it('go off where a rocket hits and throw out its shrapnel', () => {
    const rocket: ShellSpec = {
      speed: 900,
      range: 700,
      hole: 3.5,
      depth: 2,
      knockback: 350,
      ricochet: false,
      blast,
      fragments: { count: 6, shell: { speed: 650, range: 75, hole: 1.3, depth: 0, knockback: 40, size: 0.35 } }
    };
    const { combat } = createBattle({}, { walls: [{ x: 100, y: 0, halfWidth: 10, halfHeight: 100 }] });
    const shooter = combat.spawnTank({ x: -100, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter, { shell: rocket });
    let shrapnel = 0;

    for (let step = 0; step < 30; step++) {
      combat.step(1 / 60);
      shrapnel = Math.max(shrapnel, combat.shells.length);
    }

    expect(shrapnel).toBe(6);
    expect(combat.shells).toHaveLength(0);
  });
});

describe('rails', () => {
  const rail: ShellSpec = { speed: Infinity, range: 1300, hole: 2.6, depth: 2, knockback: 700, rail: { power: 40, slit: 1.5 } };

  it('hit at once, through a crate, the tank behind it', () => {
    const { combat, hits } = createBattle({}, { crates: [{ x: 0, y: 0, rotation: 0 }] });
    const shooter = combat.spawnTank({ x: -250, y: 0, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 150, y: 0, rotation: Math.PI / 2 }, { color: 0 });
    combat.step(1 / 60);

    combat.fire(shooter, { shell: rail });

    expect(combat.shells).toHaveLength(0);
    expect(hits.some((hit) => hit.target === target)).toBe(true);
  });

  it('blow up a tank whose core their line crosses from the side, and leave one they pass beside it standing, slit', () => {
    const shoot = (across: number) => {
      const { combat } = createBattle();
      const shooter = combat.spawnTank({ x: -250, y: across, rotation: 0 }, { color: 0 });
      // Side on, its rear up: the core lies 11 px above the center.
      const target = combat.spawnTank({ x: 0, y: 0, rotation: Math.PI / 2 }, { color: 0 });
      combat.step(1 / 60);
      combat.fire(shooter, { shell: rail });
      run(combat, 0.3);
      return combat.armorOf(target) === undefined ? 0 : combat.armorLeft(target);
    };

    expect(shoot(-11)).toBe(0);
    expect(shoot(-3)).toBeGreaterThan(0.9);
    expect(shoot(-3)).toBeLessThan(0.98);
  });

  it('go on through one tank into the next with the power left, and stop in a second one side on', () => {
    const { combat, hits } = createBattle();
    const shooter = combat.spawnTank({ x: -250, y: 0, rotation: 0 }, { color: 0 });
    const targets = [0, 60, 120].map((x) => combat.spawnTank({ x, y: 0, rotation: Math.PI / 2 }, { color: 0 }));
    combat.step(1 / 60);

    combat.fire(shooter, { shell: rail });

    expect(targets.map((target) => hits.some((hit) => hit.target === target))).toEqual([true, true, false]);
  });
});

describe('lobbed grenades', () => {
  const grenade: ShellSpec = {
    speed: 900,
    range: 520,
    hole: 3,
    depth: 1,
    knockback: 250,
    ricochet: false,
    lob: { fuse: 1.5, gravity: 1500, bounce: 0.45, rebound: 0.7, roll: 4, minReach: 70 },
    blast: { radius: 95, hole: 5.5, depth: 2.5, knockback: 600 }
  };

  it('bounce off a wall and go off when the fuse burns down', () => {
    const { combat, shots } = createBattle({}, { walls: [{ x: 150, y: 0, halfWidth: 10, halfHeight: 100 }] });
    const shooter = combat.spawnTank({ x: -100, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter, { shell: grenade, reach: 400 });
    run(combat, 0.5);

    expect(combat.shells).toHaveLength(1);
    expect(combat.shells[0].direction.x).toBeLessThan(0);

    run(combat, 0.9);

    expect(combat.shells).toHaveLength(1);

    run(combat, 0.2);

    expect(combat.shells).toHaveLength(0);
    expect(shots[0].some((point) => point.x > 130)).toBe(true);
  });

  it('go off at once when they hit an enemy tank before they land', () => {
    const { combat, hits } = createBattle();
    const shooter = combat.spawnTank({ x: -100, y: 0, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 70, y: 0, rotation: Math.PI / 2 }, { color: 0 });

    combat.fire(shooter, { shell: grenade, reach: 170 });
    run(combat, 0.4);

    expect(combat.shells).toHaveLength(0);
    expect(hits.some((hit) => hit.target === target)).toBe(true);
  });

  it('fly over a crate that stops a shell flying straight', () => {
    const { combat } = createBattle({}, { crates: [{ x: 80, y: 0, rotation: 0 }] });
    const shooter = combat.spawnTank({ x: -100, y: 0, rotation: 0 }, { color: 0 });
    combat.step(1 / 60);

    combat.fire(shooter, { shell: grenade, reach: 380 });
    run(combat, 0.35);

    expect(combat.shells[0].x).toBeGreaterThan(110);
  });
});

describe('the pace', () => {
  const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

  it('slows shells down', () => {
    const { combat, hits } = createBattle({ shell, pace: () => ({ shellSpeed: 0.5, damage: 1 }) });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0 });
    combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter);
    // At full speed the shell hits within 0.35 s.
    run(combat, 0.45);

    expect(hits).toHaveLength(0);
    expect(combat.shells[0].speed).toBe(450);

    run(combat, 0.3);

    expect(hits).toHaveLength(1);
  });

  it('lobs a slowed grenade along the same way, to go off where it would at full speed', () => {
    const grenade: ShellSpec = {
      speed: 900,
      range: 520,
      hole: 3,
      depth: 1,
      knockback: 250,
      ricochet: false,
      lob: { fuse: 1.15, gravity: 1500, bounce: 0.45, rebound: 0.7, roll: 4, minReach: 70 }
    };
    const ends = [1, 0.6].map((share) => {
      const { combat, shots } = createBattle({ pace: () => ({ shellSpeed: share, damage: 1 }) });
      const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0 });
      let time = 0;

      combat.fire(shooter, { shell: grenade, reach: 380 });

      while (combat.shells.length > 0) {
        combat.step(1 / 60);
        time += 1 / 60;
      }

      return { at: shots[0].at(-1)!, time };
    });

    // Within a twentieth of the throw: bounces too low to see end at a fixed climb speed, so a
    // slowed grenade starts rolling a bounce later, and the 1/60 s steps alone move it more than that.
    expect(Math.hypot(ends[1].at.x - ends[0].at.x, ends[1].at.y - ends[0].at.y)).toBeLessThan(380 / 20);
    expect(ends[1].time).toBeCloseTo(ends[0].time / 0.6, 1);
  });

  it('takes less armor with every hit on a tank at a lower damage share', () => {
    const left = [1, 0.5].map((share) => {
      const { combat } = createBattle({ shell, pace: () => ({ shellSpeed: 1, damage: share }) });
      const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0 });
      // Facing the shooter, so the shots chip the thick front and never reach the core.
      const target = combat.spawnTank({ x: 0, y: 0, rotation: Math.PI }, { color: 0 });

      for (let shot = 0; shot < 6; shot++) {
        shooter.turretAngle = (shot - 3) * 0.01;
        combat.fire(shooter);
        run(combat, 0.3);
      }

      return 1 - combat.armorLeft(target);
    });

    expect(left[1]).toBeLessThan(left[0] * 0.5);
    expect(left[1]).toBeGreaterThan(0);
  });
});

/** Steps the battle for `seconds`. */
function run(combat: ReturnType<typeof createCombat>, seconds: number) {
  for (let time = 0; time < seconds - 1e-9; time += 1 / 60) {
    combat.step(1 / 60);
  }
}

function pathLength(path: readonly { x: number; y: number }[]) {
  return path.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0);
}

/** A battle on a real Rapier world with a renderer that only hands out field slots, recording hits and shot paths. */
function createBattle(options: Parameters<typeof createCombat>[4] = {}, layout: Partial<Parameters<typeof createCombat>[3]> = {}) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 64 }, (_, index) => 63 - index);
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
  const hits: { target: unknown; shooter: unknown }[] = [];
  const shots: (readonly { x: number; y: number }[])[] = [];
  const combat = createCombat(
    rapier,
    world,
    renderer as unknown as ReturnType<typeof createRangeRenderer>,
    { halfWidth: 400, halfHeight: 300, ...layout },
    {
      random: seeded(1),
      ...options,
      onHit: (target, shooter) => hits.push({ target, shooter }),
      onShot: (_shooter, path) => shots.push(path)
    }
  );

  return { combat, hits, shots };
}

/** A repeatable source of numbers in [0, 1), so rough craters and debris come out the same every run. */
function seeded(seed: number) {
  let state = seed;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
