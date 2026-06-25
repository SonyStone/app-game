import type { MaybeAccessor } from '@solid-primitives/utils';
import type { JSX } from 'solid-js';
import { createEffect, splitProps } from 'solid-js';
import { createSpread } from './spread';
import type { Props } from './types';

/**
 * Applies Solid-style props to an already-created target while the component is mounted.
 *
 * This is useful for wrappers that receive a DOM ref from elsewhere and need the proxy
 * props to be added, updated, and restored without owning the element creation.
 */
export function PropsProxy<T extends object>(
  props: {
    target?: T | null | undefined;
  } & Props<T>
): JSX.Element {
  const [local, restProps] = splitProps(props, ['target']);

  createPropsProxy(
    () => local.target,
    restProps as unknown as Props<T>
  );

  return null;
}

/**
 * Creates a reactive prop proxy for a target object or element.
 *
 * The proxy tracks the current target and props inside Solid effects. Applied props are
 * cleaned up when the owner disposes, when the target changes, or when a prop disappears.
 */
export function createPropsProxy<T extends object>(
  target: MaybeAccessor<T | null | undefined>,
  props: Props<T>
): void {
  const spread = createSpread(target);

  createEffect(() => {
    spread(props);
  });
}
