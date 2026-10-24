import { describe, expect, it } from 'vitest';
import { chooseGoal, plan, type GoapAction } from './goap';

const actions: GoapAction[] = [
  { name: 'driveToPoint', requires: {}, effects: { atPoint: true, exposed: true }, cost: 4 },
  { name: 'driveToCover', requires: {}, effects: { inCover: true, exposed: false }, cost: 2 },
  { name: 'findTarget', requires: { atPoint: true }, effects: { seesEnemy: true }, cost: 1 },
  { name: 'flank', requires: { seesEnemy: true }, effects: { behindEnemy: true }, cost: 3 },
  { name: 'shootFront', requires: { seesEnemy: true }, effects: { enemyDown: true }, cost: 8 },
  { name: 'shootRear', requires: { behindEnemy: true }, effects: { enemyDown: true }, cost: 1 }
];

describe('plan', () => {
  it('finds the cheapest chain of actions to the goal', () => {
    const steps = plan({}, { enemyDown: true }, actions);

    expect(steps?.map((step) => step.name)).toEqual(['driveToPoint', 'findTarget', 'flank', 'shootRear']);
  });

  it('returns an empty plan when the goal already holds', () => {
    expect(plan({ inCover: true }, { inCover: true }, actions)).toEqual([]);
  });

  it('treats missing facts as false', () => {
    expect(plan({}, { exposed: false }, actions)).toEqual([]);
  });

  it('gives up on a goal no action can reach', () => {
    expect(plan({}, { flying: true }, actions)).toBeUndefined();
  });

  it('respects the step limit', () => {
    expect(plan({}, { enemyDown: true }, actions, 2)).toBeUndefined();
  });
});

describe('chooseGoal', () => {
  it('pursues the most important goal that is not met yet', () => {
    const choice = chooseGoal(
      { inCover: true },
      [
        { name: 'survive', wants: { inCover: true }, priority: 10 },
        { name: 'hold', wants: { atPoint: true }, priority: 5 }
      ],
      actions
    );

    expect(choice?.goal.name).toBe('hold');
    expect(choice?.steps.map((step) => step.name)).toEqual(['driveToPoint']);
  });
});
