import { ok, ResultAsync, type Result } from 'neverthrow';
import { errorMessage, gpuError, type ViewerError } from '../../shared/errors';

/**
 * Admits at most one unfinished scene frame. Skipped requests coalesce into one
 * invalidation, so the next draw reads the latest camera rather than replaying old frames.
 * The caller owns disposal; camera updates can continue while GPU work is pending.
 */
export function makeGpuFrameGate(
  complete: () => Promise<void>,
  invalidate: () => void,
  fail: (error: ViewerError) => void
) {
  let pending = false;
  let requested = false;
  let disposed = false;

  return {
    draw(render: () => Result<void, ViewerError>): Result<void, ViewerError> {
      if (disposed) {
        return ok();
      }

      if (pending) {
        requested = true;
        return ok();
      }

      const result = render();

      if (result.isErr()) {
        return result;
      }

      pending = true;
      void ResultAsync.fromThrowable(complete, (cause) => gpuError('render', errorMessage(cause), cause))().then(
        (completed) => {
          pending = false;

          if (disposed) {
            return;
          }

          if (completed.isErr()) {
            disposed = true;
            fail(completed.error);
            return;
          }

          if (requested) {
            requested = false;
            invalidate();
          }
        }
      );

      return result;
    },
    /** Ignores late GPU completion and prevents further submissions. */
    destroy() {
      disposed = true;
      requested = false;
    }
  };
}
