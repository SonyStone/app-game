import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';

/**
 * Calls `release` once, on owner cleanup or when `signal` aborts, whichever happens first. Calls it immediately if the
 * signal has already aborted. Use it for GPU-bound work that must stop before its canvas or device is released.
 */
export function onGpuRelease(signal: AbortSignal, release: () => void) {
  let released = false;
  const once = () => {
    if (!released) {
      released = true;
      release();
    }
  };

  onCleanup(once);
  makeEventListener(signal, 'abort', once, { once: true });

  if (signal.aborted) {
    once();
  }
}
