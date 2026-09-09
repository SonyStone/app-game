/** Expected operation outcome. Narrow `ok` before accessing either value or error. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/** Converts synchronous throws and rejected promises into an explicit, owned result.
 * Calls action immediately, preserving browser user activation and GPU submission order.
 */
export async function attempt<T>(action: () => T | PromiseLike<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (cause: unknown) {
    return { ok: false, error: cause instanceof Error ? cause : new Error(String(cause), { cause }) };
  }
}

/** Compatibility bridge for APIs that still reject. Throws the original error on failure.
 * Prefer branching on result.ok where the caller can recover or report the failure directly.
 */
export function unwrapResult<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

/** Serializes tasks without poisoning later work after failure. Every caller owns its result.
 * drain waits for tasks enqueued before the call and returns the last outcome, including failure.
 */
export function createTaskQueue() {
  let tail: Promise<Result<unknown>> = Promise.resolve({ ok: true, value: undefined });
  return {
    run<T>(action: () => T | PromiseLike<T>): Promise<Result<T>> {
      const result = tail.then(() => attempt(action));
      tail = result;
      return result;
    },
    drain: () => tail
  };
}
