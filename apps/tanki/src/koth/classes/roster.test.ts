import { describe, expect, it } from 'vitest';
import { adaptClass, SWITCH_COOLDOWN } from './roster';

describe('a bot switching class when its own does not work out', () => {
  const calm = { team: ['soldier', 'heavy', 'demoman'] as const, size: 4, lives: [{ kills: 1, killer: 'soldier' as const }], teamDeaths: [], switchedAgo: Infinity };

  it('keeps a class that works', () => {
    expect(adaptClass('soldier', { ...calm, team: ['scout', 'heavy', 'demoman'] })).toBeUndefined();
  });

  it('takes a Scout to hunt an enemy Sniper that keeps picking the team off, even beside a teammate Scout', () => {
    const sniped = { ...calm, lives: [{ kills: 1, killer: 'sniper' as const }], teamDeaths: ['sniper', 'soldier', 'sniper', 'sniper'] as const };

    expect(adaptClass('soldier', sniped)).toBe('scout');
    expect(adaptClass('soldier', { ...sniped, team: ['scout', 'heavy', 'demoman'] })).toBe('scout');
    expect(adaptClass('soldier', { ...sniped, team: ['scout', 'scout', 'demoman'] })).toBeUndefined();
  });

  it('answers the class that destroyed its last two tanks, however its team fares', () => {
    const hunted = { ...calm, lives: [{ kills: 2, killer: 'sniper' as const }, { kills: 1, killer: 'sniper' as const }] };

    expect(adaptClass('heavy', hunted)).toBe('scout');
    expect(adaptClass('heavy', { ...hunted, lives: [{ kills: 2, killer: 'soldier' }, { kills: 1, killer: 'sniper' }] })).toBeUndefined();
  });

  it('takes a Sniper against an enemy Heavy that grinds the team down', () => {
    const ground = { ...calm, lives: [{ kills: 0, killer: 'heavy' as const }], teamDeaths: ['heavy', 'heavy', 'heavy'] as const };

    expect(adaptClass('soldier', ground)).toBe('sniper');
  });

  it('tries another class after three lives that destroyed at most one tank', () => {
    const lives = [
      { kills: 0, killer: 'soldier' as const },
      { kills: 1, killer: 'demoman' as const },
      { kills: 0, killer: 'soldier' as const }
    ];
    const struggling = { ...calm, team: ['soldier', 'scout', 'sniper'] as const, lives };

    expect(adaptClass('soldier', struggling)).toBe('heavy');
    expect(adaptClass('soldier', { ...struggling, lives: [...lives.slice(0, 2), { kills: 1, killer: 'soldier' }] })).toBeUndefined();
    expect(adaptClass('heavy', { ...struggling, team: ['soldier', 'demoman', 'sniper'] })).toBe('scout');
  });

  it('gives a new class a fair try before switching again', () => {
    const sniped = { ...calm, lives: [{ kills: 0, killer: 'sniper' as const }], teamDeaths: ['sniper', 'sniper', 'sniper'] as const };

    expect(adaptClass('soldier', { ...sniped, switchedAgo: SWITCH_COOLDOWN - 1 })).toBeUndefined();
  });
});
