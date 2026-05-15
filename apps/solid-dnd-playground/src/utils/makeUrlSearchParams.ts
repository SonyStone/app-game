import { makeEventListener } from '@solid-primitives/event-listener';
import type { Simplify } from '@solid-primitives/utils';
import type { Accessor, Setter, Signal } from 'solid-js';
import { untrack } from 'solid-js';
import type { SetStoreFunction, Store } from 'solid-js/store';
import { reconcile } from 'solid-js/store';

type ParamValue = string | number | boolean;
type ParamRecord = Record<string, ParamValue>;

/** Widens boolean literal types (`true` → `boolean`, `false` → `boolean`). */
type WidenBooleans<T extends ParamRecord> = Simplify<{ [K in keyof T]: T[K] extends boolean ? boolean : T[K] }>;

type UrlSearchParamsOptions = {
  /** Use `pushState` instead of `replaceState` so each change creates a browser history entry. @default false */
  readonly push?: boolean;
};

/**
 * Wraps a `createSignal` or `createStore` to sync its state with URL search
 * params. Works like `makePersisted` from `@solid-primitives/storage` but
 * uses the URL query string as storage. Values are serialized with
 * `String()` and deserialized with `JSON.parse`, validated against the
 * default's runtime type (mismatches are silently dropped), so numbers
 * and booleans round-trip correctly.
 *
 * @example
 * ```ts
 * // With createStore (path-based setters):
 * const [params, setParams] = makeUrlSearchParams(
 *   createStore({ page: 1, debug: false })
 * );
 * params.page;               // 1 (number, reactive)
 * setParams("page", 2);      // URL → ?page=2 (debug omitted — still default)
 *
 * // With pushState (creates history entries for back/forward):
 * const [params, setParams] = makeUrlSearchParams(
 *   createStore({ page: 1 }),
 *   { push: true }
 * );
 * ```
 */
export function makeUrlSearchParams<T extends ParamRecord>(
  signal: Signal<T>,
  options?: UrlSearchParamsOptions
): [get: Accessor<WidenBooleans<T>>, set: Setter<WidenBooleans<T>>];

export function makeUrlSearchParams<T extends ParamRecord>(
  signal: [Store<T>, SetStoreFunction<T>],
  options?: UrlSearchParamsOptions
): [get: Store<WidenBooleans<T>>, set: SetStoreFunction<WidenBooleans<T>>];

export function makeUrlSearchParams<T extends ParamRecord>(
  signal: Signal<T> | [Store<T>, SetStoreFunction<T>],
  options?: UrlSearchParamsOptions
): [get: Accessor<T> | Store<T>, set: Setter<T> | SetStoreFunction<T>] {
  const isSignal = typeof signal[0] === 'function';
  const push = options?.push ?? false;

  // Snapshot defaults (untracked) so missing URL keys fall back to initial values
  const defaults = untrack(() => (isSignal ? { ...(signal[0] as Accessor<T>)() } : { ...(signal[0] as Store<T>) }));

  /** Apply merged state to the underlying signal or store. */
  const applyState = (merged: T): void => {
    if (isSignal) {
      (signal[1] as Setter<T>)(() => merged);
    } else {
      (signal[1] as SetStoreFunction<T>)(reconcile(merged));
    }
  };

  // Initialize from URL (merge on top of defaults, always replaceState on init)
  const initial = parseSearch(defaults);
  if (Object.keys(initial).length > 0) {
    const merged = { ...defaults, ...initial } as T;
    applyState(merged);
    writeToUrl(merged, defaults, false);
  }

  // Sync URL → state on back/forward navigation
  makeEventListener(window, 'popstate', () => {
    applyState({ ...defaults, ...parseSearch(defaults) } as T);
  });

  // Wrap setter to eagerly push to URL (effect is deferred)
  if (isSignal) {
    const originalSet = signal[1] as Setter<T>;
    const wrappedSet = ((...args: Parameters<Setter<T>>) => {
      const result = (originalSet as (...a: Parameters<Setter<T>>) => T)(...args);
      writeToUrl(untrack(signal[0] as Accessor<T>), defaults, push);
      return result;
    }) as Setter<T>;
    return [signal[0], wrappedSet] as const;
  }

  const store = signal[0] as Store<T>;
  const originalSet = signal[1] as SetStoreFunction<T>;
  const wrappedSet = ((...args: readonly unknown[]) => {
    (originalSet as (...a: readonly unknown[]) => void)(...args);
    writeToUrl(readStore(store), defaults, push);
  }) as SetStoreFunction<T>;

  return [signal[0], wrappedSet];
}

/**
 * Parse URL search params, filtering to known keys and validating that
 * the parsed runtime type matches the default's type.
 */
function parseSearch(defaults: ParamRecord): ParamRecord {
  const result: ParamRecord = {};
  for (const [key, raw] of new URLSearchParams(window.location.search)) {
    if (!(key in defaults)) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as ParamValue;
      if (typeof parsed === typeof defaults[key]) {
        result[key] = parsed;
      }
    } catch {
      if (typeof defaults[key] === 'string') {
        result[key] = raw;
      }
    }
  }
  return result;
}

function readStore<T extends ParamRecord>(store: Store<T>): ParamRecord {
  return untrack(() => {
    const snapshot: ParamRecord = {};
    for (const key of Object.keys(store)) {
      snapshot[key] = store[key as keyof T] as ParamValue;
    }
    return snapshot;
  });
}

function writeToUrl(params: ParamRecord, defaults: ParamRecord, push: boolean): void {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '' && value !== defaults[key]) {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  const url = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  if (push) {
    window.history.pushState(window.history.state, '', url);
  } else {
    window.history.replaceState(window.history.state, '', url);
  }
}
