import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNullRenderer } from '../damage/nullRenderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import { directKillCam, filmAt } from './killCam';
import { PACE_DEFAULTS } from './pace';
import { createRecordedMatch, matchPaceOf, STEP } from './recording';
import { CAPTURE_RULES } from './rules';
import { createTapeRecorder } from './tape';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

afterAll(() => applyClassTuning({}));

describe('the kill-cam', { timeout: 120_000 }, () => {
  it('finds the fatal shot on the tape and films it from the killer to the hit', () => {
    const recorder = createTapeRecorder(createNullRenderer());
    const recorded = createRecordedMatch(rapier, recorder.renderer, {
      seed: 778,
      human: false,
      playerClass: 'soldier',
      rules: CAPTURE_RULES,
      pace: matchPaceOf(PACE_DEFAULTS),
      classes: {}
    });

    while (recorded.steps < 100 * 60) {
      recorded.step({ drive: { x: 0, y: 0 }, fire: false, turn: false });
      recorded.match.update(STEP);
      recorded.match.draw({ x: 0, y: 0 });
      recorder.endFrame(recorded.steps, recorded.match);
    }

    const chronicle = recorded.recording().chronicle;
    const indexOf = (id: number | undefined) => chronicle.members.findIndex((member) => member.id === id);
    // Kills with time on the tape after them for the film's end.
    const kills = chronicle.kills.filter((kill) => kill.killer !== undefined && kill.step > 5 * 60 && kill.step < recorded.steps - 90);
    let found = 0;

    for (const kill of kills) {
      const film = directKillCam(recorder.tape, chronicle, { death: kill.step, killer: indexOf(kill.killer), victim: indexOf(kill.victim), at: kill, begin: kill.step + 90 });
      expect(film.length).toBeGreaterThan(4);
      expect(film.length).toBeLessThan(7);
      expect(filmAt(film, film.length + 0.01)).toBeUndefined();
      expect(film.story.streak).toBeGreaterThanOrEqual(1);

      // The rewind runs the tape back; every other shot runs it on, or holds it.
      const kinds = film.shots.map((shot) => shot.kind);
      expect(kinds).toEqual(['freeze', 'rewind', 'killer', 'fire', 'flight', 'blast', 'out']);
      film.shots.forEach((shot) => expect(shot.kind === 'rewind' ? shot.to < shot.from : shot.to >= shot.from).toBe(true));

      // Cut to fit a short wait for the tank, the film loses its start and keeps the kill.
      for (const budget of [3.5, 2]) {
        const short = directKillCam(recorder.tape, chronicle, { death: kill.step, killer: indexOf(kill.killer), victim: indexOf(kill.victim), at: kill, begin: kill.step + 90 }, budget);
        expect(short.length - short.skip).toBeCloseTo(Math.min(budget, film.length), 6);
        expect(short.shots.slice(3)).toEqual(film.shots.slice(3));
        expect(short.shots[2].to).toBe(film.shots[2].to);
        expect(short.shots[1].to).toBe(short.shots[2].from);
      }

      if (!film.shot) {
        continue;
      }

      found++;
      const path = film.shot.path;
      const killer = film.killerAt(film.shot.fired)!;
      expect(Math.hypot(path[0].x - killer.x, path[0].y - killer.y)).toBeLessThan(80);
      expect(Math.hypot(path.at(-1)!.x - kill.x, path.at(-1)!.y - kill.y)).toBeLessThan(70);
      expect(film.shot.fired).toBeLessThanOrEqual(film.shot.hit);
    }

    expect(kills.length).toBeGreaterThan(5);
    expect(found / kills.length).toBeGreaterThan(0.6);
    recorded.dispose();
  });
});
