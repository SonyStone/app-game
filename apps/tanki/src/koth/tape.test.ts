import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BodyDraw, createRangeRenderer, SmokeBall } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import { PACE_DEFAULTS } from './pace';
import { createRecordedMatch, matchPaceOf, STEP } from './recording';
import { CAPTURE_RULES } from './rules';
import { createTapePlayer, createTapeRecorder, roundField } from './tape';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

afterAll(() => applyClassTuning({}));

describe('a match on tape', { timeout: 120_000 }, () => {
  it('shows any step, in any order, as the match drew it: bodies, lights, smoke and the damage fields', () => {
    const live = captureRenderer(true);
    const recorder = createTapeRecorder(live.renderer);
    const recorded = createRecordedMatch(rapier, recorder.renderer, {
      seed: 4242,
      human: true,
      playerClass: 'soldier',
      rules: { ...CAPTURE_RULES, unlockTime: 5 },
      pace: matchPaceOf(PACE_DEFAULTS),
      classes: {}
    });
    const view = { x: 0, y: 0 };
    const seen = new Map<number, ReturnType<typeof live.frame> & { lagging: Set<number> }>();
    recorded.watch(true);

    // Every frame after the first 20 s, where fights have broken walls, burned wrecks and spread smoke.
    while (recorded.steps < 45 * 60) {
      recorded.step({ drive: { x: 0, y: 0 }, fire: false, turn: false });
      recorded.match.update(STEP);
      recorded.match.draw(view);
      recorder.endFrame(recorded.steps, recorded.match);


      if (recorded.steps >= 20 * 60 && recorded.steps % 37 === 0) {
        seen.set(recorded.steps, { ...live.frame(), lagging: new Set(recorder.lagging) });
      }
    }

    recorded.dispose();
    const shown = captureRenderer();
    const player = createTapePlayer(shown.renderer, recorder.tape);
    const steps = [...seen.keys()];
    const order = [...steps, ...[...steps].reverse(), steps[3], steps.at(-2)!, steps[0], steps[10]];

    for (const step of order) {
      const result = player.show(step);
      const frame = shown.frame();
      const expected = seen.get(step)!;

      expect(result?.step).toBe(step);
      expect(frame.bodies).toEqual(expected.bodies);
      expect(frame.lights).toEqual(expected.lights);
      expect(frame.balls).toEqual(expected.balls);
      // Slots the match had not taken yet hold whatever they held, as no body draws them; a wide
      // change, as mending, comes on the tape a little later.
      const compared = [...expected.fields.keys()].filter((slot) => !expected.lagging.has(slot));
      expect(compared.map((slot) => frame.fields.get(slot))).toEqual(compared.map((slot) => expected.fields.get(slot)));
      expect(compared.length).toBeGreaterThan(expected.fields.size * 0.9);
    }

    // Particles where scrubbing lands, back and forth, held or jumped to, are those of playing on.
    const played = captureRenderer();
    const playing = createTapePlayer(played.renderer, recorder.tape);
    const scrubbed = captureRenderer();
    const scrubbing = createTapePlayer(scrubbed.renderer, recorder.tape);
    let checked = 0;

    for (let step = 20 * 60; step <= 40 * 60; step++) {
      played.render(playing.show(step)!.age);

      if (step % 97 === 0) {
        for (const at of [step - 200, step - 3, step - 2, step - 3, step - 2, step - 2, step - 1, step]) {
          scrubbed.render(scrubbing.show(at)!.age);
        }

        expect(scrubbed.particles()).toEqual(played.particles());

        // Held, or dragged about within a step, they hold still.
        for (const at of [step + 0.5, step + 0.25, step]) {
          scrubbed.render(scrubbing.show(at)!.age);
          scrubbed.render(scrubbing.show(at)!.age);
        }

        expect(scrubbed.particles()).toEqual(played.particles());
        checked += played.particles().length;
      }
    }

    expect(checked).toBeGreaterThan(100);
    expect(seen.size).toBeGreaterThan(30);
    expect(seen.get(steps.at(-1)!)!.balls.length).toBeGreaterThan(0);
    // 45 s of a match, its map's fields included, in a few megabytes.
    expect(recorder.tape.bytes).toBeLessThan(16 * 1024 * 1024);
  });
});

/**
 * A renderer that keeps what it is given: each frame's bodies, lights and smoke balls as drawn,
 * every field slot's content as last uploaded, `rounded` as the tape keeps fields, and the
 * particles, aged as the real one ages them.
 */
function captureRenderer(rounded = false) {
  let slots = Array.from({ length: 512 }, (_, index) => 511 - index);
  let bodies: BodyDraw[] = [];
  let lights: number[][] = [];
  let balls: SmokeBall[] = [];
  const fields = new Map<number, Float32Array>();
  let spawned: number[][] = [];
  let particles: { spawn: number[]; age: number }[] = [];
  const advance = (dt: number) => {
    particles.push(...spawned.map((spawn) => ({ spawn, age: 0 })));
    spawned = [];
    particles = particles.filter((particle) => particle.age < particle.spawn[5]);
    particles.forEach((particle) => (particle.age += dt));
  };
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    releaseAllFields: () => (slots = Array.from({ length: 512 }, (_, index) => 511 - index)),
    uploadField: (slot: number, field: { data: Float32Array }) => fields.set(slot, field.data.slice()),
    beginBodies() {
      bodies = [];
      lights = [];
      balls = [];
    },
    addBody: (body: BodyDraw) => bodies.push(normal(body)),
    addSmokeBall: (ball: SmokeBall) => balls.push({ ...ball }),
    addLight: (...light: [number, number, number, number, readonly number[], number]) => lights.push([light[0], light[1], light[2], light[3], ...light[4].slice(0, 3), light[5]].map(Math.fround)),
    spawn: (...spawn: [number, number, number, number, number, number, number, readonly number[]]) => rounded || spawned.push([...spawn.slice(0, 7), ...spawn[7]] as number[]),
    clearParticles() {
      spawned = [];
      particles = [];
    },
    advanceParticles: advance
  };

  return {
    renderer: renderer as unknown as ReturnType<typeof createRangeRenderer>,

    /** What the frame drawn last held, with the fields as they are. */
    frame() {
      return { bodies, lights, balls, fields: new Map([...fields].map(([slot, data]) => [slot, digest(rounded ? roundField(data) : data)])) };
    },

    /** Draws a frame, as `render` does: particles advance by `dt` s. */
    render: advance,

    /** The particles alive, as spawned with their age to a millionth of a second, in a stable order. */
    particles() {
      return particles
        .filter((particle) => particle.age < particle.spawn[5] - 1e-6)
        .map((particle) => JSON.stringify([...particle.spawn, Math.round(particle.age * 1e6) / 1e6]))
        .sort();
    }
  };
}

/** A field's content as a short string, its numbers as 32-bit floats hashed. */
function digest(data: Float32Array) {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
  let hash = 0x811c9dc5;

  for (const word of words) {
    hash = Math.imul(hash ^ word, 0x01000193);
  }

  return `${data.length}:${(hash >>> 0).toString(16)}`;
}

/** A body as the tape keeps it: 32-bit numbers, the color's first three parts, no empty options. */
function normal(body: BodyDraw): BodyDraw {
  const entries = Object.entries({ ...body, color: body.color.slice(0, 3) })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, Array.isArray(value) ? value.map(Math.fround) : Math.fround(value as number)]);
  return Object.fromEntries(entries.sort(([a], [b]) => String(a).localeCompare(String(b)))) as BodyDraw;
}
