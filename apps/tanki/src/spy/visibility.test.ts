import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import { createHeadlessSandbox } from './headless';
import { VISIBILITY_RULES, type VisibilityRule } from './variants';
import { inFan, sees, sightFan, VIEW } from './visibility';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

/** A tank at the origin whose hull faces +x and whose barrel is turned to face +y, down the screen. */
const watcher = { x: 0, y: 0, facing: Math.PI / 2 };
const open = () => true;
const walled = () => false;
/** Behind the barrel: the barrel looks down, the spider sits above the tank. */
const behind = { x: 0, y: -120 };
/** At the hull's side, which the turned barrel looks at. */
const side = { x: 30, y: 150 };
/** At the side again, but out of the short range of `range`. */
const farSide = { x: 0, y: VIEW.shortRange + 100 };

describe('sight rules', () => {
  const expected: Record<VisibilityRule, { behind: boolean; side: boolean; farSide: boolean; walled: boolean }> = {
    cone: { behind: false, side: true, farSide: true, walled: false },
    hidden: { behind: false, side: false, farSide: false, walled: false },
    range: { behind: false, side: true, farSide: false, walled: false }
  };

  for (const rule of VISIBILITY_RULES) {
    it(`${rule}: hides the spider behind the barrel and behind walls, shows it in the cone as the rule says`, () => {
      expect(sees(rule, watcher, behind, false, open)).toBe(expected[rule].behind);
      expect(sees(rule, watcher, side, false, open)).toBe(expected[rule].side);
      expect(sees(rule, watcher, farSide, false, open)).toBe(expected[rule].farSide);
      expect(sees(rule, watcher, side, false, walled)).toBe(expected[rule].walled);
    });
  }

  it('hidden: an action shows the spider to every tank with a clear line, whichever way it looks', () => {
    expect(sees('hidden', watcher, behind, true, open)).toBe(true);
    expect(sees('hidden', watcher, side, true, walled)).toBe(false);
    expect(sees('cone', watcher, behind, true, open)).toBe(false);
  });

  it('turning the barrel toward the spider behind the tank shows it', () => {
    expect(sees('cone', { ...watcher, facing: -Math.PI / 2 }, behind, false, open)).toBe(true);
    expect(sees('cone', { ...watcher, facing: -Math.PI / 2 + VIEW.halfAngle + 0.1 }, behind, false, open)).toBe(false);
  });

  it('draws the same area it sees', () => {
    for (const rule of ['cone', 'range'] as const) {
      const fan = sightFan(rule, watcher, false, (_angle, limit) => limit)!;

      for (const point of [behind, side, farSide, { x: 200, y: 10 }, { x: -60, y: 70 }]) {
        expect(inFan(fan, point)).toBe(sees(rule, watcher, point, false, open));
      }
    }
  });
});

describe('sight in the sandbox', () => {
  it('a wall between a tank and the spider hides it under every rule', () => {
    const arena = {
      halfWidth: 400,
      halfHeight: 300,
      walls: [{ x: 0, y: 0, halfWidth: 20, halfHeight: 80 }],
      obstacles: [],
      patrols: [{ start: { x: -150, y: 0, rotation: 0 }, route: [{ x: -150, y: 0 }], posts: {} }],
      spiderStart: { x: 150, y: 0, rotation: Math.PI }
    };

    for (const visibility of VISIBILITY_RULES) {
      const { sandbox, world } = createHeadlessSandbox(rapier, { role: 'spy', visibility, ability: 'backstab', gait: 'low', cones: 'off' }, { arena, tankBots: false });
      sandbox.step(1 / 60, { move: { x: 0, y: 0 }, aim: undefined, fire: false, dismount: false });
      sandbox.step(1 / 60, { move: { x: 0, y: 0 }, aim: undefined, fire: false, dismount: false });
      const watchers = sandbox.hud().watchers;

      expect(watchers[0].sees).toBe(false);
      sandbox.placeSpider({ x: -150, y: 150, rotation: 0 });
      sandbox.placeTank(0, { x: -150, y: 0, rotation: 0, turret: Math.PI / 2 });
      sandbox.step(1 / 60, { move: { x: 0, y: 0 }, aim: undefined, fire: false, dismount: false });
      sandbox.step(1 / 60, { move: { x: 0, y: 0 }, aim: undefined, fire: false, dismount: false });

      expect(sandbox.hud().watchers[0].sees).toBe(visibility !== 'hidden');
      world.free();
    }
  });
});
