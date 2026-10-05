/**
 * The only waiting primitives GPU and browser verifications use. Prefer, in order: awaiting the operation itself, an
 * event the code emits (`onRefine`, posted paint events, gate arrivals), and only then `until` for state the code
 * exposes as a value. Never sleep to prove that something did not happen: wait for the event that shows the code is
 * blocked (for example a readback counter), then assert.
 */

/** Upper bound for any single wait on GPU, storage or worker progress. Generous: exceeding it means the code is stuck. */
export const waitLimitMs = 30_000;

/** Resolves with `promise`, or rejects with `message` if it has not settled within `ms`. Only for things that must happen. */
export async function within<T>(promise: Promise<T>, message: string, ms = waitLimitMs): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${message} (after ${ms} ms)`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounded poll for state the code exposes only as a value, such as renderer stats counters. Checks after every
 * macrotask, so it observes GPU map callbacks and promise chains as soon as they run. Rejects with `message` after `ms`.
 */
export async function until(condition: () => boolean, message: string, ms = waitLimitMs) {
  const deadline = performance.now() + ms;

  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error(`${message} (after ${ms} ms)`);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Change notifications from a renderer's `onRefine` option (or a virtual texture's `changed` callback). `next()`
 * resolves at the following notification; arm it before the work that may trigger one.
 */
export function createRefinements() {
  let waiters: (() => void)[] = [];

  return {
    /** Pass as `onRefine`. */
    notify() {
      const woken = waiters;
      waiters = [];
      woken.forEach((wake) => wake());
    },
    next: () => new Promise<void>((resolve) => waiters.push(resolve))
  };
}

/**
 * Draws frames until `done()` holds, as the app does: after each frame it waits for the next refinement (streamed
 * page resident or obsolete) or, at most, one display frame, since some queued page work completes without a
 * notification. Rejects with `message` after `ms`.
 */
export async function drawUntil(
  draw: () => Promise<unknown> | unknown,
  done: () => boolean,
  message: string,
  { refinements, ms = waitLimitMs }: { refinements?: ReturnType<typeof createRefinements>; ms?: number } = {}
) {
  const deadline = performance.now() + ms;

  for (;;) {
    const refined = refinements?.next();
    await draw();

    if (done()) {
      return;
    }

    if (performance.now() > deadline) {
      throw new Error(`${message} (after ${ms} ms)`);
    }

    await Promise.race([...(refined ? [refined] : []), new Promise((resolve) => setTimeout(resolve, 16))]);
  }
}

/**
 * Lets real time pass as the *input* of a check, such as a pen held still for Airbrush build-up or smoothing catch-up,
 * whose effect the runtime derives from elapsed time. Not a synchronization primitive.
 */
export function elapse(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
