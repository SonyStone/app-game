import { Accessor } from 'solid-js';

export function createGetterObject<T extends Record<string, Accessor<unknown>>>(props: T) {
  const result: Record<string, unknown> = {};
  for (const key in props) {
    Object.defineProperty(result, key, {
      get: () => props[key](),
      enumerable: true,
      configurable: true
    });
  }
  return result as Readonly<{ [K in keyof typeof props]: ReturnType<(typeof props)[K]> }>;
}
