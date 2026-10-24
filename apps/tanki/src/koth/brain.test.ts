import { describe, expect, it } from 'vitest';
import { planBot, type Situation } from './brain';

describe('bot plans', () => {
  it('drives to a free point and captures it', () => {
    expect(names(situation({}))).toEqual(['capture', 'goToPoint', 'capture']);
  });

  it('waits for the team at its staging spot before a coordinated push', () => {
    expect(names(situation({ facts: { mustStage: true } }))).toEqual(['capture', 'stage', 'goToPoint', 'capture']);
  });

  it('fights its way onto a point the enemy stands on', () => {
    const plan = names(situation({ facts: { enemyOnPoint: true, hasTarget: true }, targetClearsPoint: true }));

    expect(plan).toEqual(['capture', 'goToPoint', 'attackFront', 'capture']);
  });

  it('sends a flanker around to the rear, where the core is, instead of fighting head on', () => {
    const facing: Partial<Situation> = { facts: { hasTarget: true, targetVisible: true, inFireZone: true }, kill: { front: 4, rear: 0.5 }, current: 'kill' };

    expect(names(situation({ ...facing, role: 'flank' }))).toEqual(['kill', 'flank', 'attackRear']);
    expect(names(situation({ ...facing, role: 'assault' }))).toEqual(['kill', 'attackFront']);
  });

  it('takes the nearest cover when hit with its core open', () => {
    expect(names(situation({ facts: { coreOpen: true, underFire: true } }))).toEqual(['survive', 'takeCover']);
  });

  it('drives home to mend badly chipped armor once out of fire', () => {
    expect(names(situation({ facts: { armorLow: true, inCover: true } }))).toEqual(['repair', 'retreat', 'repair']);
  });

  it('stays on the point to the end when the enemy is about to win', () => {
    expect(names(situation({ facts: { armorLow: true }, enemyClock: 0.95 }))[0]).toBe('capture');
  });

  it('has a support move up and suppress the enemy shooting at an ally', () => {
    expect(names(situation({ role: 'support', facts: { allyNeedsHelp: true } }))).toEqual(['support', 'moveToSupport', 'suppress']);
    expect(names(situation({ role: 'support', facts: { allyNeedsHelp: true, attackerInRange: true } }))).toEqual(['support', 'suppress']);
  });

  it('guards a point the team holds', () => {
    expect(names(situation({ facts: { pointOurs: true } }))).toEqual(['defend', 'guardPoint']);
  });

  it('falls back to the rally point when the team is called to regroup', () => {
    expect(names(situation({ facts: { regroupCalled: true } }))).toEqual(['regroup', 'regroup']);
  });

  it('sticks to its goal when another is only a little more urgent', () => {
    const contest = { facts: { hasTarget: true, targetVisible: true, inFireZone: true } };

    expect(names(situation({ ...contest, role: 'assault' }))[0]).toBe('capture');
    expect(names(situation({ ...contest, role: 'assault', current: 'kill' }))[0]).toBe('kill');
  });
});

/** A bot of the assault role at its base with the point free, adjusted by `overrides`. */
function situation(overrides: Partial<Situation>): Situation {
  return {
    role: 'assault',
    travel: { point: 4, stage: 3, approach: 2, flank: 4, support: 2, cover: 1, base: 6, rally: 3 },
    kill: { front: 3, rear: 0.5 },
    capture: 8,
    enemyClock: 0,
    targetClearsPoint: false,
    ...overrides,
    facts: { ...overrides.facts }
  };
}

/** The chosen goal followed by its plan's actions. */
function names(state: Situation) {
  const choice = planBot(state);
  return choice ? [choice.goal.name, ...choice.steps.map((step) => step.name)] : [];
}
