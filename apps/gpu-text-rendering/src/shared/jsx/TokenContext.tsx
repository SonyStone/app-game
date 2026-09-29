import type { JSX } from '@solidjs/web';
import { createComponent, createMemo, flatten, untrack, type Context } from 'solid-js';

/**
 * Provides a fixed context value while preserving raw JSX tokens for FrameLoop.
 * A regular provider flattens its children and would execute each token's render fallback.
 * The value is read once; callers must remount to replace it. Solid owns the child memo and its cleanup.
 */
export function TokenContext<T>(props: {
  /** Context whose provider owns the children. */
  context: Context<T>;
  /** Fixed value for the subtree; later changes are ignored. */
  value: T;
  children: JSX.Element;
}): JSX.Element {
  return runWithContext(
    props.context,
    untrack(() => props.value),
    () => createMemo(() => props.children) as unknown as JSX.Element
  );
}

/**
 * Runs fn once beneath a provider for context, under the provider's owner, and returns its result unresolved.
 * Unlike rendering the provider, nothing is flattened, so token functions survive. Disposal follows the caller.
 */
export function runWithContext<T, R>(context: Context<T>, value: T, fn: () => R): R {
  let result!: R;
  const provider = createComponent(context, {
    value,
    get children() {
      result = fn();
      return null;
    }
  });
  // The provider returns nested lazy accessors (its root, then a children memo). Unwrapping them once, untracked,
  // evaluates the getter above under the provider's owner without a tracking memo of our own.
  untrack(() => flatten(provider));
  return result;
}
