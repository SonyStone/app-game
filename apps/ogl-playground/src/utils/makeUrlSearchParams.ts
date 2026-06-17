import { makeEventListener } from '@solid-primitives/event-listener';
import type { Simplify } from '@solid-primitives/utils';
import type { Accessor, Setter, Signal } from 'solid-js';
import { untrack } from 'solid-js';
import type { SetStoreFunction, Store } from 'solid-js/store';
import { reconcile } from 'solid-js/store';

type ParamPrimitive = string | number | boolean;
type ParamValue = ParamPrimitive | ParamPrimitive[];
type ParamRecord = Record<string, ParamValue>;

/** Widens boolean literal types (`true` → `boolean`, `false` → `boolean`). */
type WidenBooleans<T extends ParamRecord> = Simplify<{
  [K in keyof T]: T[K] extends boolean ? boolean : T[K];
}>;

type WidenSignalValue<T extends ParamValue> = T extends boolean ? boolean : T;

type UrlSearchParamsOptions<Key extends string | undefined = undefined> = {
  /** Use `pushState` instead of `replaceState` so each change creates a browser history entry. @default false */
  readonly push?: boolean;
  /** Required when syncing a non-record signal so the utility knows which query param to bind. */
  readonly key?: Key;
};

/**
 * Wraps a `createSignal` or `createStore` to sync its state with URL search
 * params. Works like `makePersisted` from `@solid-primitives/storage` but
 * uses the URL query string as storage. Scalar values are serialized as a
 * single query param value, while arrays are serialized as repeated query
 * params. Values are deserialized with `JSON.parse` where needed and
 * validated against the default's runtime type so numbers, booleans, and
 * arrays round-trip correctly.
 */
export function makeUrlSearchParams<T extends ParamRecord>(
  signal: Signal<T>,
  options?: UrlSearchParamsOptions,
): [get: Accessor<WidenBooleans<T>>, set: Setter<WidenBooleans<T>>];

export function makeUrlSearchParams<T extends ParamValue, Key extends string>(
  signal: Signal<T>,
  options: UrlSearchParamsOptions<Key> & { readonly key: Key },
): [get: Accessor<WidenSignalValue<T>>, set: Setter<WidenSignalValue<T>>];

export function makeUrlSearchParams<T extends ParamRecord>(
  signal: [Store<T>, SetStoreFunction<T>],
  options?: UrlSearchParamsOptions,
): [get: Store<WidenBooleans<T>>, set: SetStoreFunction<WidenBooleans<T>>];

export function makeUrlSearchParams<T extends ParamRecord | ParamValue>(
  signal:
    | Signal<T>
    | [
        Store<Extract<T, ParamRecord>>,
        SetStoreFunction<Extract<T, ParamRecord>>,
      ],
  options?: UrlSearchParamsOptions,
): [
  get: Accessor<T> | Store<Extract<T, ParamRecord>>,
  set: Setter<T> | SetStoreFunction<Extract<T, ParamRecord>>,
] {
  const isSignal = typeof signal[0] === 'function';
  const push = options?.push ?? false;

  if (isSignal) {
    const getValue = signal[0] as Accessor<T>;
    const originalSet = signal[1] as Setter<T>;
    const defaultValue = cloneParamData(untrack(getValue));

    if (!isParamRecord(defaultValue)) {
      const key = options?.key;

      if (!key) {
        throw new Error(
          'makeUrlSearchParams() requires options.key when used with a non-record signal.',
        );
      }

      const defaults: ParamRecord = {
        [key]: cloneParamValue(defaultValue as ParamValue),
      };
      const initial = parseSearch(defaults);

      if (key in initial) {
        const nextValue = cloneParamValue(initial[key]);
        originalSet(() => nextValue as T);
        writeToUrl({ [key]: nextValue }, defaults, false);
      }

      makeEventListener(window, 'popstate', () => {
        const parsed = parseSearch(defaults);

        if (key in parsed) {
          originalSet(() => cloneParamValue(parsed[key]) as T);
          return;
        }

        originalSet(() => cloneParamValue(defaults[key]) as T);
      });

      const wrappedSet = ((...args: Parameters<Setter<T>>) => {
        const result = (originalSet as (...a: Parameters<Setter<T>>) => T)(
          ...args,
        );
        writeToUrl(
          { [key]: cloneParamValue(untrack(getValue) as ParamValue) },
          defaults,
          push,
        );
        return result;
      }) as Setter<T>;

      return [signal[0], wrappedSet] as const;
    }

    const defaults = cloneParamRecord(defaultValue as Extract<T, ParamRecord>);

    const applyState = (merged: Extract<T, ParamRecord>): void => {
      originalSet(() => merged as T);
    };

    const initial = parseSearch(defaults);
    if (Object.keys(initial).length > 0) {
      const merged = { ...defaults, ...initial } as Extract<T, ParamRecord>;
      applyState(merged);
      writeToUrl(merged, defaults, false);
    }

    makeEventListener(window, 'popstate', () => {
      applyState({ ...defaults, ...parseSearch(defaults) } as Extract<
        T,
        ParamRecord
      >);
    });

    const wrappedSet = ((...args: Parameters<Setter<T>>) => {
      const result = (originalSet as (...a: Parameters<Setter<T>>) => T)(
        ...args,
      );
      writeToUrl(
        cloneParamRecord(untrack(getValue) as Extract<T, ParamRecord>),
        defaults,
        push,
      );
      return result;
    }) as Setter<T>;

    return [signal[0], wrappedSet] as const;
  }

  const store = signal[0] as Store<Extract<T, ParamRecord>>;
  const originalSet = signal[1] as SetStoreFunction<Extract<T, ParamRecord>>;
  const defaults = readStore(store);

  const applyState = (merged: Extract<T, ParamRecord>): void => {
    originalSet(reconcile(merged));
  };

  const initial = parseSearch(defaults);
  if (Object.keys(initial).length > 0) {
    const merged = { ...defaults, ...initial } as Extract<T, ParamRecord>;
    applyState(merged);
    writeToUrl(merged, defaults, false);
  }

  makeEventListener(window, 'popstate', () => {
    applyState({ ...defaults, ...parseSearch(defaults) } as Extract<
      T,
      ParamRecord
    >);
  });

  const wrappedSet = ((...args: readonly unknown[]) => {
    (originalSet as (...a: readonly unknown[]) => void)(...args);
    writeToUrl(readStore(store), defaults, push);
  }) as SetStoreFunction<Extract<T, ParamRecord>>;

  return [signal[0], wrappedSet];
}

/**
 * Parse URL search params, filtering to known keys and validating that
 * the parsed runtime type matches the default's type.
 */
function parseSearch(defaults: ParamRecord): ParamRecord {
  const result: ParamRecord = {};
  const searchParams = new URLSearchParams(window.location.search);

  for (const key of Object.keys(defaults)) {
    const fallback = defaults[key];

    if (Array.isArray(fallback)) {
      const parsed = deserializeParamArray(searchParams.getAll(key), fallback);
      if (parsed !== undefined) {
        result[key] = parsed;
      }
      continue;
    }

    const raw = searchParams.get(key);
    if (raw === null) {
      continue;
    }

    const parsed = deserializeParamValue(raw, fallback);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }

  return result;
}

function readStore<T extends ParamRecord>(store: Store<T>): T {
  return untrack(() => {
    const snapshot = {} as T;

    for (const key of Object.keys(store)) {
      snapshot[key as keyof T] = cloneParamValue(
        store[key as keyof T] as ParamValue,
      ) as T[keyof T];
    }

    return snapshot;
  });
}

function cloneParamData<T extends ParamRecord | ParamValue>(value: T): T {
  if (isParamRecord(value)) {
    return cloneParamRecord(value) as T;
  }

  return cloneParamValue(value) as T;
}

function cloneParamRecord<T extends ParamRecord>(record: T): T {
  const snapshot = {} as T;

  for (const [key, value] of Object.entries(record)) {
    snapshot[key as keyof T] = cloneParamValue(value) as T[keyof T];
  }

  return snapshot;
}

function cloneParamValue<T extends ParamValue>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

function deserializeParamValue(
  raw: string,
  fallback: ParamValue,
): ParamValue | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (isMatchingParamValue(parsed, fallback)) {
      return cloneParamValue(parsed as ParamValue);
    }
  } catch {
    if (typeof fallback === 'string') {
      return raw;
    }
  }

  return undefined;
}

function deserializeParamArray(
  rawValues: string[],
  fallback: ParamPrimitive[],
): ParamPrimitive[] | undefined {
  if (rawValues.length === 0) {
    return undefined;
  }

  if (rawValues.length === 1) {
    const legacyParsed = deserializeParamValue(rawValues[0], fallback);
    if (Array.isArray(legacyParsed)) {
      return legacyParsed as ParamPrimitive[];
    }
  }

  const sample = fallback[0];
  const parsedValues: ParamPrimitive[] = [];

  for (const raw of rawValues) {
    const parsed = deserializeRepeatedParamValue(raw, sample);
    if (parsed === undefined) {
      return undefined;
    }

    parsedValues.push(parsed);
  }

  return parsedValues;
}

function deserializeRepeatedParamValue(
  raw: string,
  sample: ParamPrimitive | undefined,
): ParamPrimitive | undefined {
  if (sample === undefined) {
    return deserializePrimitiveCandidate(raw);
  }

  if (typeof sample === 'string') {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === typeof sample
      ? (parsed as ParamPrimitive)
      : undefined;
  } catch {
    return undefined;
  }
}

function deserializePrimitiveCandidate(
  raw: string,
): ParamPrimitive | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isParamPrimitive(parsed) ? parsed : undefined;
  } catch {
    return raw;
  }
}

function isMatchingParamValue(
  value: unknown,
  fallback: ParamValue,
): value is ParamValue {
  if (Array.isArray(fallback)) {
    return (
      Array.isArray(value) &&
      value.every(isParamPrimitive) &&
      (fallback.length === 0 ||
        value.every((item) => typeof item === typeof fallback[0]))
    );
  }

  return typeof value === typeof fallback;
}

function isParamPrimitive(value: unknown): value is ParamPrimitive {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isParamRecord(value: unknown): value is ParamRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function writeToUrl(
  params: ParamRecord,
  defaults: ParamRecord,
  push: boolean,
): void {
  const searchParams = new URLSearchParams(window.location.search);

  for (const key of Object.keys(defaults)) {
    searchParams.delete(key);
  }

  for (const [key, value] of Object.entries(params)) {
    if (
      value == null ||
      paramValuesEqual(value, defaults[key]) ||
      (!Array.isArray(value) && value === '')
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of serializeParamArray(value)) {
        searchParams.append(key, item);
      }

      continue;
    }

    searchParams.set(key, serializeParamValue(value));
  }

  const query = searchParams.toString();
  const url =
    window.location.pathname +
    (query ? `?${query}` : '') +
    window.location.hash;

  if (push) {
    window.history.pushState(window.history.state, '', url);
  } else {
    window.history.replaceState(window.history.state, '', url);
  }
}

function paramValuesEqual(left: ParamValue, right: ParamValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  return left === right;
}

function serializeParamValue(value: ParamValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function serializeParamArray(value: ParamPrimitive[]): string[] {
  if (value.length === 0) {
    return ['[]'];
  }

  return value.map((item) => serializeParamValue(item));
}
