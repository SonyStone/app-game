import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { worldToScreen } from '../arena/camera';
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
  it('finds the fatal shot on the tape and films it from the killer to the hit, the shell flying up the screen', () => {
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
      const film = directKillCam(recorder.tape, chronicle, { death: kill.step, killer: indexOf(kill.killer), victim: indexOf(kill.victim), at: kill });
      expect(film.length).toBeGreaterThan(4);
      expect(film.length).toBeLessThan(7);
      expect(filmAt(film, film.length + 0.01)).toBeUndefined();
      expect(film.story.streak).toBeGreaterThanOrEqual(1);

      // The rewind runs the tape back; every other shot runs it on, or holds it.
      const kinds = film.shots.map((shot) => shot.kind);
      expect(kinds).toEqual(['freeze', 'rewind', 'killer', 'fire', 'flight', 'impact', 'blast', 'out']);
      film.shots.forEach((shot) => expect(shot.kind === 'rewind' ? shot.to < shot.from : shot.to >= shot.from).toBe(true));

      if (!film.shot) {
        continue;
      }

      found++;
      const path = film.shot.path;
      const killer = film.killerAt(film.shot.fired)!;
      expect(Math.hypot(path[0].x - killer.x, path[0].y - killer.y)).toBeLessThan(80);
      expect(Math.hypot(path.at(-1)!.x - kill.x, path.at(-1)!.y - kill.y)).toBeLessThan(70);
      expect(film.shot.fired).toBeLessThanOrEqual(film.shot.hit);

      // Turned as the ride ends, the view has the shell fly straight up.
      const camera = { x: 0, y: 0, zoom: 1, rotation: film.upward };
      const screen = { width: 100, height: 100 };
      const [from, to] = [worldToScreen(camera, path[0], screen), worldToScreen(camera, path.at(-1)!, screen)];

      if (Math.hypot(to.x - from.x, to.y - from.y) > 1) {
        expect(to.y).toBeLessThan(from.y);
        expect(Math.abs(to.x - from.x)).toBeLessThan(1e-6 * Math.hypot(to.x - from.x, to.y - from.y) + 1e-9);
      }
    }

    expect(kills.length).toBeGreaterThan(5);
    expect(found / kills.length).toBeGreaterThan(0.6);
    recorded.dispose();
  });
});
