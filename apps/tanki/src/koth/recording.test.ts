import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import type { PlayerInput } from './match';
import { PACE_DEFAULTS } from './pace';
import { createRecordedMatch, replayRecording, seededRandom, type MatchSetup, type Recording } from './recording';
import { CAPTURE_RULES } from './rules';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

afterAll(() => applyClassTuning({}));

describe('a recorded match', { timeout: 60_000 }, () => {
  it('plays again from its file exactly, with the player changing class, pace and tuning and watching the bots on the way', () => {
    const recording = record(30);
    const read = JSON.parse(JSON.stringify(recording)) as Recording;
    const replay = replayRecording(rapier, fakeRenderer(), read);

    replay.advance(Infinity);

    expect(replay.done).toBe(true);
    expect(replay.diverged).toBeUndefined();
    expect(replay.replay.checks).toEqual(recording.checks);
    expect(replay.replay.recording().chronicle).toEqual(recording.chronicle);
    expect(recording.events.map((event) => event.kind)).toEqual(['class', 'watch', 'pace', 'watch', 'classes']);
  });

  it('tells the second from which a replay plays differently', () => {
    const recording = record(12);
    // The player aims elsewhere in the seventh second than they did.
    recording.inputs = recording.inputs.map((input) =>
      input[0] >= 6 * 60 && input[0] < 7 * 60 ? [input[0], input[1], input[2], (input[3] ?? 0) + 0.5, input[4], input[5], input[6]] : input
    );
    const replay = replayRecording(rapier, fakeRenderer(), recording);

    replay.advance(Infinity);

    expect(replay.diverged).toBe(7);
  });

  it('chronicles where the tanks were, what the bots thought and the kills', () => {
    const { chronicle } = record(30);

    expect(chronicle.members).toHaveLength(8);
    expect(chronicle.samples).toHaveLength(30 * 4 + 1);
    expect(chronicle.samples[0].every((pose) => pose !== null)).toBe(true);
    expect(chronicle.spawns.length).toBeGreaterThanOrEqual(8);
    // The seven bots, and the player's seat while a bot drove it.
    expect(new Set(chronicle.thoughts.map((thought) => thought.member)).size).toBe(8);
    // Right after a respawn a bot has no plan yet; soon every one has one.
    expect(new Set(chronicle.thoughts.filter((thought) => thought.goal && thought.plan.length > 0).map((thought) => thought.member)).size).toBe(8);
  });
});

/**
 * Records `seconds` of a match played by a scripted player who switches to the Scout in its base,
 * hands the tank to a bot for a while, slows the shells and speeds up the Soldier.
 */
function record(seconds: number) {
  const setup: MatchSetup = {
    seed: 4242,
    human: true,
    playerClass: 'soldier',
    rules: { ...CAPTURE_RULES, unlockTime: 5 },
    pace: PACE_DEFAULTS,
    classes: {}
  };
  const match = createRecordedMatch(rapier, fakeRenderer(), setup);
  const inputs = seededRandom(7);
  let input: PlayerInput = { drive: { x: 0, y: 0 }, fire: false };

  while (match.steps < seconds * 60) {
    const step = match.steps;

    if (step === 60) {
      match.chooseClass('scout');
    }

    match.watch(step >= 600 && step < 900);

    if (step === 720) {
      match.setPace({ ...PACE_DEFAULTS, shellSpeed: 0.8 });
    }

    if (step === 1080) {
      match.setClasses({ soldier: { speed: 300 } });
    }

    // The mouse moves every frame, of about two steps; the keys change now and then.
    if (step % 2 === 0) {
      const heading = step % 40 === 0 ? inputs() * Math.PI * 2 : Math.atan2(input.drive.y, input.drive.x);
      input = { drive: { x: Math.cos(heading), y: Math.sin(heading) }, aim: inputs() * Math.PI * 2, fire: inputs() < 0.6, reach: inputs() * 400 };
    }

    match.step(input);
  }

  const recording = match.recording();
  match.dispose();
  applyClassTuning({});
  return recording;
}

/** A renderer that only hands out field slots. */
function fakeRenderer() {
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

  return renderer as unknown as ReturnType<typeof createRangeRenderer>;
}
