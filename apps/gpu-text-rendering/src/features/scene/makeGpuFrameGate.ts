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
  let pending = false;
  let requested = false;
  let disposed = false;

  return {
    /** Runs `render` unless the gate is closed; a skipped draw returns Ok and redraws when the gate reopens. */
    draw(render: () => Result<void, ViewerError>): Result<void, ViewerError> {
      if (disposed) {
        return ok();
      }

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

  /** Closes the gate until `work` settles, then fails or replays one skipped request. */
  function wait(work: PromiseLike<Result<void, ViewerError>>) {
    pending = true;

    void work.then((completed) => {
      pending = false;

      if (disposed) {
        return;
      }

      if (completed.isErr()) {
        disposed = true;
        options.fail(completed.error);
        return;
      }

      if (requested) {
        requested = false;
        options.invalidate();
      }
    });
  }
}
