import type { JSX } from '@solidjs/web';
import { children, createRenderEffect, createRoot } from 'solid-js';

/** Resolves a component-only JSX tree under a Solid owner, without a DOM renderer. Returns its disposer. */
export function mountWorker(assembly: () => JSX.Element) {
  return createRoot((dispose) => {
    const tree = children(assembly);
    // Keep lazy Show/children computations observed without inserting anything into the DOM.
    createRenderEffect(tree, () => {});
    tree();
    return dispose;
  });
}
