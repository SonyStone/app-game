import { createSignal } from 'solid-js';

/**
 * A signal whose last write is also readable at once through `now`, for synchronous guards such as double-click and
 * busy checks. Solid shows a write to every reader, `latest()` included, only at the flush that carries it, so a
 * second call in the same event would otherwise see the value from before the first call's write.
 *
 * Returns `[value, set, now]`: `value` is the reactive accessor and `set` replaces the value. `now` returns the last
 * value passed to `set`, or `initial`; read in a tracking scope it also subscribes, re-running at the flush that
 * publishes a write.
 */
// Mirrors createSignal's value overload, which a function would select the derived form of.
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function createImmediateSignal<T>(initial: Exclude<T, Function>) {
  const [value, setValue] = createSignal<T>(initial);
  let current: T = initial;

  /** Replaces the value; `now` returns it immediately, `value` from the next flush. */
  const set = (next: T) => {
    setValue(() => next);
    current = next;
  };
  const now = () => {
    value();
    return current;
  };

  return [value, set, now] as const;
}
