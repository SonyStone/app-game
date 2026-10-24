import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import type { SpyArena } from './arena';
import { createHeadlessSandbox, IDLE, runSandbox, STEP } from './headless';
import { HOLD_TIME, INFECT_TIME, JAM_TIME, type SpySandbox } from './sandbox';
import { BUILDS, sternOf } from './spider';
import type { Gait, Variant } from './variants';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('the spider among obstacles', () => {
  /**
   * Four lanes from left to right: rubble on the middle one, a wall above it, a tank broadside on
   * the top one and a barrier across the bottom one.
   */
  const arena: SpyArena = {
    halfWidth: 500,
    halfHeight: 300,
    walls: [{ x: 200, y: -120, halfWidth: 20, halfHeight: 40 }],
    obstacles: [
      { kind: 'rubble', x: 0, y: 0, radius: 25, seed: 1 },
      { kind: 'barrier', x: 0, y: 150, halfLength: 40, rotation: Math.PI / 2 }
    ],
    patrols: [{ start: { x: 0, y: -240, rotation: Math.PI / 2 }, route: [{ x: 0, y: -240 }], posts: {} }],
    spiderStart: { x: -400, y: 250, rotation: 0 }
  };

  /** Runs the spider to the right from `x`, `y` for `seconds`; returns where it ends and how high it got. */
  function runRight(gait: Gait, from: { x: number; y: number }, seconds: number) {
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ gait }), { arena, tankBots: false });
    sandbox.placeSpider({ ...from, rotation: 0 });
    let highest = 0;

    for (let time = 0; time < seconds; time += STEP) {
      sandbox.step(STEP, { ...IDLE, move: { x: 1, y: 0 }, aim: 0 });
      highest = Math.max(highest, sandbox.spider.height);
    }

    const end = sandbox.spider.position;
    world.free();
    return { end, highest };
  }

  it('climbs over rubble, its body rising over the heap', () => {
    const { end, highest } = runRight('low', { x: -100, y: 0 }, 1.6);

    expect(end.x).toBeGreaterThan(80);
    expect(highest).toBeGreaterThan(BUILDS.low.height + 1.5);
  });

  it('stops at a wall', () => {
    const { end } = runRight('low', { x: 60, y: -120 }, 1.5);

    expect(end.x).toBeLessThan(180 - BUILDS.low.radius + 1);
    expect(end.x).toBeGreaterThan(150);
  });

  it('stops at a tank', () => {
    const { end } = runRight('low', { x: -120, y: -240 }, 1.5);

    expect(end.x).toBeLessThan(-12);
  });

  it('only the tall spider steps over a barrier', () => {
    expect(runRight('low', { x: -100, y: 150 }, 1.5).end.x).toBeLessThan(-6);
    expect(runRight('tall', { x: -100, y: 150 }, 1.8).end.x).toBeGreaterThan(60);
  });
});

describe('abilities', () => {
  /** One tank in an open yard; it patrols back and forth through the middle unless it stands at its post there. */
  function yard(posts: Record<number, number> = { 0: 60 }): SpyArena {
    return {
      halfWidth: 500,
      halfHeight: 300,
      walls: [],
      obstacles: [],
      patrols: [{ start: { x: 0, y: 0, rotation: 0 }, route: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 0 }, { x: -300, y: 0 }], posts }],
      spiderStart: { x: -400, y: 250, rotation: 0 }
    };
  }

  /** Puts the spider right behind tank 0's stern and holds the ability key until it holds on. */
  function grab(sandbox: SpySandbox) {
    for (let tries = 0; tries < 30 && !sandbox.spider.holding; tries++) {
      const tank = sandbox.tanks[0]!;
      const stern = sternOf(tank);
      const angle = tank.hull.rotation();
      sandbox.placeSpider({ x: stern.x - Math.cos(angle) * 14, y: stern.y - Math.sin(angle) * 14, rotation: angle });
      sandbox.step(STEP, { ...IDLE, fire: true });
    }

    expect(sandbox.spider.holding).toBe(sandbox.tanks[0]);
  }

  it('infecting hands the tank to the player until the time runs out', () => {
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ ability: 'infect' }), { arena: yard(), tankBots: false });
    const tank = sandbox.tanks[0]!;
    grab(sandbox);
    runSandbox(sandbox, HOLD_TIME.infect + 0.05, { ...IDLE, fire: true });

    expect(sandbox.infected).toBe(tank);
    expect(sandbox.playerTank).toBe(tank);

    const start = { ...tank.hull.translation() };
    runSandbox(sandbox, 1.5, { ...IDLE, move: { x: 0, y: 1 }, aim: Math.PI / 2 });

    expect(tank.hull.translation().y - start.y).toBeGreaterThan(60);
    expect(tank.turretAngle).toBeCloseTo(Math.PI / 2);

    runSandbox(sandbox, INFECT_TIME - 1.5);

    expect(sandbox.infected).toBeUndefined();
    expect(sandbox.spider.holding).toBeUndefined();
    expect(sandbox.combat.armorLeft(tank)).toBeLessThan(1);
    world.free();
  });

  it('infection ends when the infected tank is destroyed, throwing the spider out alive', () => {
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ ability: 'infect' }), { arena: yard(), tankBots: false });
    const tank = sandbox.tanks[0]!;
    grab(sandbox);
    runSandbox(sandbox, HOLD_TIME.infect + 0.05, { ...IDLE, fire: true });

    expect(sandbox.infected).toBe(tank);

    sandbox.combat.detonate(tank, { x: 1, y: 0 });
    runSandbox(sandbox, 0.5);

    expect(sandbox.infected).toBeUndefined();
    expect(sandbox.spider.holding).toBeUndefined();
    expect(sandbox.hud().spider.alive).toBe(true);
    world.free();
  });

  it('the bots take an infected tank for a friend until it fires', () => {
    // A second tank stands below the first, looking away from it; under `cone` it cannot see the grab.
    const arena: SpyArena = { ...yard(), patrols: [...yard().patrols, { start: { x: 0, y: 200, rotation: Math.PI / 2 }, route: [{ x: 0, y: 200 }], posts: { 0: 60 } }] };
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ ability: 'infect', visibility: 'cone' }), { arena });
    const tank = sandbox.tanks[0]!;
    sandbox.placeTank(0, { x: 0, y: 0, rotation: Math.PI / 2 });
    grab(sandbox);
    runSandbox(sandbox, HOLD_TIME.infect + 0.05, { ...IDLE, fire: true });
    runSandbox(sandbox, 2, { ...IDLE, aim: -Math.PI / 2 });

    expect(sandbox.infected).toBe(tank);
    expect(sandbox.hud().watchers[1].alerted).toBe(false);

    runSandbox(sandbox, 0.1, { ...IDLE, aim: Math.PI / 2, fire: true });
    runSandbox(sandbox, 0.1);

    expect(sandbox.hud().watchers[1].alerted).toBe(true);
    world.free();
  });

  it('a tank that turns its barrel to its stern can shoot the spider off it', () => {
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ ability: 'infect' }), { arena: yard(), tankBots: false });
    const tank = sandbox.tanks[0]!;
    grab(sandbox);
    runSandbox(sandbox, 0.3, { ...IDLE, fire: true });
    tank.turretAngle = tank.hull.rotation() + Math.PI;
    sandbox.combat.fire(tank);
    runSandbox(sandbox, 0.1, { ...IDLE, fire: true });

    expect(sandbox.spider.holding).toBeUndefined();
    expect(sandbox.infected).toBeUndefined();
    expect(sandbox.hud().spider.hp).toBe(1);
    world.free();
  });

  it('a backstab blows the tank up through its core; letting go early does not', () => {
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ ability: 'backstab' }), { arena: yard(), tankBots: false });
    grab(sandbox);
    runSandbox(sandbox, HOLD_TIME.backstab * 0.5, { ...IDLE, fire: true });
    runSandbox(sandbox, 0.2);

    expect(sandbox.tanks[0]).toBeDefined();
    expect(sandbox.spider.holding).toBeUndefined();

    grab(sandbox);
    runSandbox(sandbox, HOLD_TIME.backstab + 0.05, { ...IDLE, fire: true });

    expect(sandbox.tanks[0]).toBeUndefined();
    world.free();
  });

  it('a charge stops a driving tank, its turret and its gun for the jam time', () => {
    const { sandbox, world } = createHeadlessSandbox(rapier, variant({ ability: 'jam' }), { arena: yard({}) });
    runSandbox(sandbox, 1.5);
    const tank = sandbox.tanks[0]!;
    const before = { ...tank.hull.linvel() };

    expect(Math.hypot(before.x, before.y)).toBeGreaterThan(60);

    grab(sandbox);
    runSandbox(sandbox, HOLD_TIME.jam + 0.05, { ...IDLE, fire: true });

    expect(sandbox.isJammed(tank)).toBe(true);

    // Let the tank coast to a stop, then watch it stand.
    runSandbox(sandbox, 0.4);
    const parked = { ...tank.hull.translation() };
    const turret = tank.turretAngle;
    runSandbox(sandbox, JAM_TIME - 0.6);

    expect(Math.hypot(tank.hull.translation().x - parked.x, tank.hull.translation().y - parked.y)).toBeLessThan(1);
    expect(tank.turretAngle).toBe(turret);
    expect(sandbox.isJammed(tank)).toBe(true);

    runSandbox(sandbox, 0.3);

    expect(sandbox.isJammed(tank)).toBe(false);
    world.free();
  });
});

function variant(overrides: Partial<Variant>): Variant {
  return { role: 'spy', visibility: 'hidden', ability: 'infect', gait: 'low', cones: 'off', ...overrides };
}
