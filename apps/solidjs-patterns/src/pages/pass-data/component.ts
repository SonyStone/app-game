import { Component, JSX, untrack } from 'solid-js';

export function createComponent<T extends Record<string, any>>(
  Comp: Component<T>,
  props: T
): JSX.Element {
  return untrack(() => Comp(props || ({} as T)));
}
