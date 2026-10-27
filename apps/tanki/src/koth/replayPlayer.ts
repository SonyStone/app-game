import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { createNullRenderer } from '../damage/nullRenderer';
import { replayRecording, STEP, type Recording } from './recording';
import { createTapeRecorder } from './tape';

/**
 * Plays a recorded match again on the game's renderer, to watch it: at any speed, held still, or
 * from any moment. The match is played anew from its script (see `replayRecording`), so it is the
 * very match recorded as long as this game code plays it the same, which `diverged` tells.
 *
 * A match cannot be wound back, so going back plays it again from its first step, on a world of
 * its own as every match has: a seek forward or back is carried out by `frame`, which plays as
 * many steps as fit in `SEEK_BUDGET` ms a frame, many times faster than the match goes, until
 * it reaches the step sought.
 *
 * @param start - The step to seek at once, as `seek`; the first step by default.
 */
export function createReplayPlayer(
  rapier: Rapier,
  renderer: ReturnType<typeof createRangeRenderer>,
  recording: Recording,
  start = 0
) {
  let played = replayRecording(rapier, renderer, recording);
  let sought: number | undefined;
  let pending = 0;

  seek(start);

  return {
    /** The match as it stands; another one after a seek back, so read it anew every frame. */
    get match() {
      return played.replay.match;
    },

    /** How many steps of the recording have been played. */
    get step() {
      return played.replay.steps;
    },

    /** The step sought, while a seek is under way. */
    get sought() {
      return sought;
    },

    /** Whether the whole recording has been played. */
    get done() {
      return played.done;
    },

    /** The first second at which this game code plays the match differently from the recording, if it does. */
    get diverged() {
      return played.diverged;
    },

    seek,

    /**
     * Moves the match on for a frame of `dt` seconds: seeks on while a seek is under way, and
     * otherwise plays `dt` seconds of the match times `speed`, its effects too. A speed of 0
     * holds the match still.
     */
    frame(dt: number, speed: number) {
      const match = played.replay.match;

      played.replay.useTuning();

      if (sought !== undefined) {
        const started = performance.now();
        let moved = 0;

        // Effects move on in short strides, so smoke and debris of the steps skipped settle as they would.
        while (played.replay.steps < sought && (moved % 10 !== 0 || performance.now() - started < SEEK_BUDGET)) {
          played.advance(1);
          moved++;

          if (moved % EFFECT_STRIDE === 0) {
            match.update(EFFECT_STRIDE * STEP);
          }
        }

        if (played.replay.steps >= sought) {
          sought = undefined;
        }

        return;
      }

      pending += dt * speed;

      // A hair's tolerance, so a second played in frames is the 60 steps it adds up to and not 59.
      while (pending >= STEP - 1e-9 && !played.done) {
        pending -= STEP;
        played.advance(1);
      }

      if (played.done) {
        pending = 0;
      }

      match.update(dt * speed);
    },

    /** Frees the match's world; the player is not to be used after. */
    dispose() {
      played.replay.dispose();
    }
  };

  /**
   * Seeks step `step`, kept within the recording: plays on to it, or plays the match again from
   * its first step when it lies before the step played.
   */
  function seek(step: number) {
    const target = Math.min(Math.max(Math.round(step), 0), recording.steps);

    if (target < played.replay.steps) {
      played.replay.dispose();
      renderer.releaseAllFields();
      played = replayRecording(rapier, renderer, recording);
    }

    sought = target > played.replay.steps ? target : undefined;
    pending = 0;
  }
}

/** A player of `createReplayPlayer`. */
export type ReplayPlayer = ReturnType<typeof createReplayPlayer>;

/** Milliseconds a frame may spend seeking. */
const SEEK_BUDGET = 12;

/** Steps between two moves of the effects while seeking. */
const EFFECT_STRIDE = 6;

/**
 * Builds the tape of a recorded match (see `createTapeRecorder`) by playing it again without a
 * GPU, drawing every step onto the tape, as many steps as fit in `budget` ms each time `work` is
 * called, many times faster than the match goes. Its checks tell whether this game code plays the
 * match as recorded (`diverged`). Built to its end, it frees the match it played.
 */
export function createTapeBuilder(rapier: Rapier, recording: Recording) {
  const recorder = createTapeRecorder(createNullRenderer());
  const played = replayRecording(rapier, recorder.renderer, recording);
  let freed = false;

  recorder.endFrame(0, played.replay.match);

  return {
    tape: recorder.tape,

    /** Whether the whole match is on the tape. */
    get done() {
      return played.done;
    },

    /** The first second at which this game code plays the match differently from the recording, if it does. */
    get diverged() {
      return played.diverged;
    },

    /** Plays and tapes steps for up to `budget` ms. */
    work(budget: number) {
      const started = performance.now();
      const match = played.replay.match;
      played.replay.useTuning();

      while (!played.done && performance.now() - started < budget) {
        for (let step = 0; step < 10 && !played.done; step++) {
          played.advance(1);
          match.update(STEP);
          match.draw(TAPE_VIEW);
          recorder.endFrame(played.replay.steps, match);
        }
      }

      if (played.done && !freed) {
        freed = true;
        played.replay.dispose();
      }
    },

    /** Frees the match it plays, if not yet. */
    dispose() {
      if (!freed) {
        freed = true;
        played.replay.dispose();
      }
    }
  };
}

/** A builder of `createTapeBuilder`. */
export type TapeBuilder = ReturnType<typeof createTapeBuilder>;

/** Where a taped match is drawn from: over the point. Only bodies in the air, few and brief, look a little different from elsewhere. */
const TAPE_VIEW = { x: 0, y: 0 };
