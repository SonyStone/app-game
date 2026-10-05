import { errorMessage, gpuError } from '@app-game/solid-gpu/errors';
import { ok, ResultAsync, type Result } from 'neverthrow';
import type { ViewerError } from '../../shared/errors';

/**
 * Admits at most `maxUnfinished()` unfinished scene frames, and none while `blocked` returns pending work.
 * Skipped requests coalesce into one invalidation, so the next draw reads the latest camera rather than replaying
 * old frames. The caller owns disposal; camera updates can continue while GPU work is pending.
 */
export function makeGpuFrameGate(options: {
  /** Resolves when the GPU has finished the frame just submitted; a rejection fails the gate once. */
  complete: () => Promise<void>;
  /** Unrelated work that must settle before the next submission, or undefined when none is pending. Never rejects. */
  blocked: () => Promise<void> | undefined;
  /**
   * Frames the GPU may still be working on when the next one is submitted, read for every draw; see
   * {@link maxUnfinishedFrames} for the default.
   */
  maxUnfinished?: () => number;
  /** Requests a new frame after a skipped draw once the gate reopens. */
  invalidate: () => void;
  /** Reports a failed completion; the gate then admits no further frames. */
  fail: (error: ViewerError) => void;
}) {
  const limit = options.maxUnfinished ?? (() => maxUnfinishedFrames);
  /** Submitted frames the GPU has not finished; a resize can admit one beyond the limit. */
  let unfinished = 0;
  let requested = false;
  let disposed = false;

  return {
    /**
     * Runs `render` unless the gate is closed; a skipped draw returns Ok and redraws when the gate reopens.
     * `resized` admits a frame even at the limit: resizing the canvas discarded the latest frame's image, and
     * waiting would present the cleared canvas. `blocked` work still defers it.
     */
    draw(render: () => Result<void, ViewerError>, { resized = false } = {}): Result<void, ViewerError> {
      if (disposed) {
        return ok();
      }

      const pending = unfinished >= limit() && !resized;
      const blocker = pending ? undefined : options.blocked();

      if (pending || blocker) {
        requested = true;

        if (blocker) {
          wait(blocker.then(() => ok()));
        }

        return ok();
      }

      const result = render();

      if (result.isErr()) {
        return result;
      }

      wait(
        ResultAsync.fromThrowable(
          options.complete,
          (cause): ViewerError => gpuError('render', errorMessage(cause), cause)
        )()
      );

      return result;
    },
    /** Ignores late GPU completion and prevents further submissions. */
    destroy() {
      disposed = true;
      requested = false;
    }
  };

  /** Counts `work` as unfinished until it settles, then fails or, once below the limit, replays a skipped request. */
  function wait(work: PromiseLike<Result<void, ViewerError>>) {
    unfinished++;

    void work.then((completed) => {
      unfinished--;

      if (disposed) {
        return;
      }

      if (completed.isErr()) {
        disposed = true;
        options.fail(completed.error);
        return;
      }

      // A skipped request replays once a frame slot frees; earlier it would be skipped again.
      if (requested && unfinished < limit()) {
        requested = false;
        options.invalidate();
      }
    });
  }
}

/**
 * Default number of frames the GPU may still be working on when the next one is submitted. `onSubmittedWorkDone`
 * resolves after the frame is presented, which on large displays can take longer than one refresh interval even when
 * the GPU work is a few milliseconds. Admitting only one frame then skipped every other refresh, halving the frame
 * rate. A second frame keeps the queue full; latency grows by at most one frame, and only while the GPU is behind.
 */
const maxUnfinishedFrames = 2;
