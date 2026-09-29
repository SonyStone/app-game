import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { children, createRenderEffect, createRoot } from 'solid-js';
import { isWorkerShutdown } from './workerProtocol';

/**
 * Resolves a component-only JSX tree under a Solid owner, without a DOM renderer. Returns its disposer.
 * With a worker scope, a shutdown message disposes the tree (running its cleanups and aborting active requests)
 * and then closes the worker. Omit the scope when mounting outside a worker.
 */
export function mountWorker(assembly: () => JSX.Element, scope?: WorkerScope) {
  return createRoot((dispose) => {
    if (scope) {
      makeEventListener<{ message: MessageEvent }>(scope, 'message', ({ data }) => {
        if (isWorkerShutdown(data)) {
          dispose();
          scope.close();
        }
      });
    }

    const tree = children(assembly);
    // Keep lazy Show/children computations observed without inserting anything into the DOM.
    createRenderEffect(tree, () => {});
    tree();
    return dispose;
  });
}

/** The worker's global endpoint; `self` inside a dedicated worker. */
export type WorkerScope = EventTarget & { close(): void };
