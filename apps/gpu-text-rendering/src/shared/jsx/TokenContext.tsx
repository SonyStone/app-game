import type { JSX } from '@solidjs/web';
import { children, createComponent, createMemo, untrack, type Context } from 'solid-js';

/**
 * Provides a fixed context value while preserving raw JSX tokens for FrameLoop.
 * A regular provider flattens its children and would execute each token's render fallback.
 * Callers must remount to replace value; Solid owns the child memo and its cleanup.
 */
export function TokenContext<T>(props: { context: Context<T>; value: T; children: JSX.Element }): JSX.Element {
  let scene!: JSX.Element;

  const initialize = children(() =>
    createComponent(props.context, {
      value: props.value,
      get children() {
        // Capture evaluation under the provider's owner, without passing tokens through its children() resolver.
        scene = createMemo(() => props.children) as unknown as JSX.Element;
        return null;
      }
    })
  );

  untrack(initialize);

  return scene;
}
