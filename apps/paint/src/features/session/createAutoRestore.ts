import { createPageVisibility } from '@solid-primitives/page-utilities';
import { createEffect, type Accessor } from 'solid-js';
import type { PaintError } from '../../shared/errors';

/**
 * Restores the renderer by itself after the GPU device was lost, once the page is visible. iPad Safari and mobile
 * browsers drop the device of a background tab or under memory pressure, which is routine rather than a fault.
 * Other failures, and a loss within `retryWindowMs` of the previous automatic restore, stay with the error notice and
 * its "Restore renderer" button, so a device that keeps failing does not restart in a loop.
 * Must be created within a Solid owner.
 */
export function createAutoRestore(options: {
  /** The editor's current error. */
  error: Accessor<PaintError | undefined>;
  /** Clears the error and restarts the renderer, as the notice's "Restore renderer" button does. */
  restore: () => void;
}) {
  const visible = createPageVisibility();
  let restoredAt = -Infinity;

  createEffect(
    () => {
      const error = options.error();
      return visible() && error?.kind === 'gpu' && error.code === 'lost' ? error : undefined;
    },
    (lost) => {
      if (!lost || performance.now() - restoredAt < retryWindowMs) {
        return;
      }

      restoredAt = performance.now();
      options.restore();
    }
  );
}

/** A device lost again this soon after an automatic restore is left to the user. */
const retryWindowMs = 30_000;
