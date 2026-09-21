import { isToken } from '@solid-primitives/jsx-tokenizer';
import type { JSX } from '@solidjs/web';
import { createMemo, untrack } from 'solid-js';
import { RenderLayer } from './RenderLayer';

/**
 * Resolves render functions beneath the current context without consuming draw tokens.
 * Zero-argument functions also represent reactive JSX lists: retain their tracking and owner in a memo.
 */
export function resolveSceneChildren<T>(children: JSX.Element | ((value: T) => JSX.Element), value: T): JSX.Element {
  if (typeof children !== 'function' || isToken(RenderLayer, children)) {
    return children;
  }

  if (children.length > 0) {
    return untrack(() => children(value));
  }

  return createMemo(() => children(value)) as unknown as JSX.Element;
}
