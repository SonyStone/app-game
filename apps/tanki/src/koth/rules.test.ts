import { describe, expect, it } from 'vitest';
import { advanceCapture, CAPTURE_RULES, captureRate, createCaptureState, type CaptureRules, type CaptureState, type TeamId } from './rules';

/** The rules with the point open from the start, for the mechanics of capturing it. */
const OPEN: CaptureRules = { ...CAPTURE_RULES, unlockTime: 0 };

describe('the lock', () => {
  it('keeps the point shut for the unlock time, then lets a tank on it capture', () => {
    const locked = run(createCaptureState(), { red: 3, blue: 0 }, CAPTURE_RULES.unlockTime - 0.1, CAPTURE_RULES);

    expect(locked.locked).toBeGreaterThan(0);
    expect(locked.capturer).toBeUndefined();
    expect(locked.progress).toBe(0);

    const opened = run(locked, { red: 3, blue: 0 }, 0.2, CAPTURE_RULES);

    expect(opened.locked).toBe(0);
    expect(opened.capturer).toBe('red');
  });
});

describe('capturing the point', () => {
  it('takes one tank the capture time', () => {
    const almost = run(createCaptureState(OPEN), { red: 1, blue: 0 }, CAPTURE_RULES.captureTime - 0.1);

    expect(almost.owner).toBeUndefined();
    expect(almost.capturer).toBe('red');
    expect(run(almost, { red: 1, blue: 0 }, 0.2).owner).toBe('red');
  });

  it('goes faster with more tanks, each adding less', () => {
    expect(captureRate(1)).toBe(1);
    expect(captureRate(2)).toBe(1.5);
    expect(captureRate(4)).toBeCloseTo(2.083, 3);

    const time = CAPTURE_RULES.captureTime / captureRate(3) + 0.05;

    expect(run(createCaptureState(OPEN), { red: 0, blue: 3 }, time).owner).toBe('blue');
    expect(run(createCaptureState(OPEN), { red: 0, blue: 2 }, time).owner).toBeUndefined();
  });

  it('stalls while both teams stand on the point', () => {
    const started = run(createCaptureState(OPEN), { red: 2, blue: 0 }, 2);
    const contested = run(started, { red: 2, blue: 1 }, 10);

    expect(contested.contested).toBe(true);
    expect(contested.progress).toBeCloseTo(started.progress, 6);
    expect(contested.owner).toBeUndefined();
  });

  it('lets defenders undo an enemy capture and the enemy then capture from nothing', () => {
    const owned = run(createCaptureState(OPEN), { red: 1, blue: 0 }, CAPTURE_RULES.captureTime + 0.1);
    const attacked = run(owned, { red: 0, blue: 1 }, 4);

    expect(attacked.capturer).toBe('blue');
    expect(attacked.progress).toBeCloseTo(0.5, 2);

    const defended = run(attacked, { red: 1, blue: 0 }, 4.1);

    expect(defended.progress).toBe(0);
    expect(defended.capturer).toBeUndefined();
    expect(defended.owner).toBe('red');
  });

  it('lets an abandoned capture fade', () => {
    const started = run(createCaptureState(OPEN), { red: 1, blue: 0 }, 4);
    const abandoned = run(started, { red: 0, blue: 0 }, CAPTURE_RULES.decayTime * 0.5 + 0.1);

    expect(abandoned.progress).toBe(0);
    expect(abandoned.capturer).toBeUndefined();
  });
});

describe('winning', () => {
  it('goes to the team that owned the point for the hold time', () => {
    const owned = run(createCaptureState(OPEN), { red: 0, blue: 1 }, CAPTURE_RULES.captureTime + 0.1);
    const almost = run(owned, { red: 0, blue: 0 }, CAPTURE_RULES.holdTime - 1);

    expect(almost.held.blue).toBeGreaterThan(CAPTURE_RULES.holdTime - 1.01);
    expect(almost.held.blue).toBeLessThan(CAPTURE_RULES.holdTime);
    expect(almost.winner).toBeUndefined();
    expect(run(almost, { red: 0, blue: 0 }, 1).winner).toBe('blue');
  });

  it('keeps the owner clock running while contested and goes into overtime', () => {
    const owned = run(createCaptureState(OPEN), { red: 1, blue: 0 }, CAPTURE_RULES.captureTime + 0.1);
    const late = run(owned, { red: 0, blue: 0 }, CAPTURE_RULES.holdTime - 2);
    const overtime = run(late, { red: 1, blue: 1 }, 3);

    expect(overtime.held.red).toBe(CAPTURE_RULES.holdTime);
    expect(overtime.overtime).toBe(true);
    expect(overtime.winner).toBeUndefined();

    // Blue's progress must fall to nothing before red wins.
    const capturing = run(overtime, { red: 0, blue: 1 }, 1);
    expect(capturing.winner).toBeUndefined();
    expect(run(capturing, { red: 1, blue: 0 }, 2).winner).toBe('red');
  });

  it('freezes once decided', () => {
    const won: CaptureState = { ...createCaptureState(OPEN), owner: 'red', winner: 'red' };

    expect(run(won, { red: 0, blue: 4 }, 60)).toBe(won);
  });
});

/** Advances the state in 1/60 s steps for `seconds`. */
function run(state: CaptureState, presence: Record<TeamId, number>, seconds: number, rules = OPEN) {
  let next = state;

  for (let time = 0; time < seconds - 1e-9; time += 1 / 60) {
    next = advanceCapture(next, presence, Math.min(1 / 60, seconds - time), rules);
  }

  return next;
}
