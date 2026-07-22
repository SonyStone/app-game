import { makeEventListener } from '@solid-primitives/event-listener';
import { untrack, type Accessor, type Setter, type Signal } from 'solid-js';

type SearchParamValue = string | number | boolean;

/** Synchronizes one primitive signal with a named URL search parameter. */
export function makeUrlSearchParams<T extends SearchParamValue>(
  signal: Signal<T>,
  options: {
    /** Search parameter name. */
    key: string;
    /** Creates browser history entries instead of replacing the current URL. Defaults to `false`. */
    push?: boolean;
  }
): [get: Accessor<T>, set: Setter<T>] {
  const [value, setValue] = signal;
  const defaultValue = untrack(value);
  const initialValue = readSearchParam(options.key, defaultValue);

  if (initialValue !== undefined) setValue(() => initialValue);

  makeEventListener(window, 'popstate', () => {
    setValue(() => readSearchParam(options.key, defaultValue) ?? defaultValue);
  });

  const setSearchParamValue = ((...args: Parameters<Setter<T>>) => {
    const result = (setValue as (...setterArgs: Parameters<Setter<T>>) => T)(...args);
    writeSearchParam(options.key, untrack(value), defaultValue, options.push ?? false);
    return result;
  }) as Setter<T>;

  return [value, setSearchParamValue];
}

function readSearchParam<T extends SearchParamValue>(key: string, defaultValue: T): T | undefined {
  const rawValue = new URLSearchParams(window.location.search).get(key);
  if (rawValue === null) return undefined;

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (typeof parsedValue === typeof defaultValue) return parsedValue as T;
  } catch {
    if (typeof defaultValue === 'string') return rawValue as T;
  }

  return undefined;
}

function writeSearchParam<T extends SearchParamValue>(key: string, value: T, defaultValue: T, push: boolean): void {
  const searchParams = new URLSearchParams(window.location.search);
  if (value === defaultValue) searchParams.delete(key);
  else searchParams.set(key, String(value));

  const query = searchParams.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history[push ? 'pushState' : 'replaceState'](window.history.state, '', url);
}
