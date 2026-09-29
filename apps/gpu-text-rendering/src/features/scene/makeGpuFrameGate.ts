import { ok, ResultAsync, type Result } from 'neverthrow';
import { errorMessage, gpuError, type ViewerError } from '../../shared/errors';

/**
 * Admits at most one unfinished scene frame, and none while `blocked` returns pending work. Skipped requests
 * coalesce into one invalidation, so the next draw reads the latest camera rather than replaying old frames.
 * The caller owns disposal; camera updates can continue while GPU work is pending.
 */
export function makeGpuFrameGate(options: {
  /** Resolves when the GPU has finished the frame just submitted; a rejection fails the gate once. */
  complete: () => Promise<void>;
  /** Unrelated work that must settle before the next submission, or undefined when none is pending. Never rejects. */
  blocked: () => Promise<void> | undefined;
  /** Requests a new frame after a skipped draw once the gate reopens. */
  invalidate: () => void;
  /** Reports a failed completion; the gate then admits no further frames. */
  fail: (error: ViewerError) => void;
}) {
  /** Submitted frames the GPU has not finished; a resize can admit a second one. */
  let unfinished = 0;
  let requested = false;
  let disposed = false;

  return {
    /**
     * Runs `render` unless the gate is closed; a skipped draw returns Ok and redraws when the gate reopens.
     * `resized` admits a frame even while another is unfinished: resizing the canvas discarded that frame's image, and
     * waiting would present the cleared canvas. `blocked` work still defers it.
     */
    draw(render: () => Result<void, ViewerError>, { resized = false } = {}): Result<void, ViewerError> {
      if (disposed) {
        return ok();
      }

      const pending = unfinished > 0 && !resized;
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

  /** Holds the gate closed until `work` settles, then fails or, once no frame is unfinished, replays a skipped request. */
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

      // A skipped request replays once the last unfinished frame completes; earlier it would be skipped again.
      if (requested && unfinished === 0) {
        requested = false;
        options.invalidate();
      }
    });
  }
}
