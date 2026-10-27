import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCamera } from '../arena/camera';
import { createNullRenderer } from '../damage/nullRenderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import { calloutsAt, calloutsOnScreen } from './onScreen';
import { PACE_DEFAULTS } from './pace';
import { BUBBLE_TIME, MARKER_TIME } from './radio';
import { createRecordedMatch, matchPaceOf, STEP } from './recording';
import { CAPTURE_RULES } from './rules';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

afterAll(() => applyClassTuning({}));

/**
 * Callouts without their ids, team by team, as text with every number left out, and the numbers: the chronicle
 * keeps markers to a tenth of a pixel, and counts time in steps where the match adds them up.
 */
function split(views: ReturnType<typeof calloutsAt>) {
  const numbers: number[] = [];
  const shape = JSON.stringify(
    // The match lists a team's lines after the other's, the chronicle as they were said.
    views.toSorted((a, b) => a.team.localeCompare(b.team)),
    (key, value) => (key === 'id' ? undefined : typeof value === 'number' ? (numbers.push(value), '#') : value)
  );
  return { shape, numbers };
}

describe('the radio in a replay', { timeout: 60_000 }, () => {
  it('shows from the chronicle what the match showed: bubbles, shots and markers, on tanks too', () => {
    const recorded = createRecordedMatch(rapier, createNullRenderer(), {
      seed: 31337,
      human: false,
      playerClass: 'soldier',
      rules: CAPTURE_RULES,
      pace: matchPaceOf(PACE_DEFAULTS),
      classes: {}
    });
    const camera = { ...createCamera({ x: 0, y: 0 }), zoom: 0.6 };
    const screen = { width: 1600, height: 1000 };
    const positionOf = (id: number) => {
      const at = recorded.match.members.find((member) => member.id === id)?.tank?.hull.translation();
      return at && { x: at.x, y: at.y };
    };
    let compared = 0;

    while (recorded.steps < 60 * 60) {
      recorded.step({ drive: { x: 0, y: 0 }, fire: false, turn: false });
      recorded.match.update(STEP);
      // As the game asks every frame, which moves markers on tanks along.
      recorded.match.callouts();

      // Right where a bubble or marker goes, the match's clock, adding up steps, may be a hair short of the step's.
      const chronicle = recorded.recording().chronicle;
      const edge = chronicle.radio.some((line) => [BUBBLE_TIME * 60, MARKER_TIME * 60].includes(recorded.steps - line.step));

      if (recorded.steps % 10 === 0 && !edge) {
        const live = calloutsOnScreen(recorded.match, camera, screen, true);
        const replayed = calloutsAt(chronicle, recorded.steps, positionOf, camera, screen);
        expect(split(replayed).shape).toEqual(split(live).shape);
        split(replayed).numbers.forEach((value, index) => expect(value).toBeCloseTo(split(live).numbers[index], 1));
        compared += live.length;
      }
    }

    expect(compared).toBeGreaterThan(200);
    recorded.dispose();
  });
});
