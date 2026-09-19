import type { MaybeAccessor } from '@solid-primitives/utils';
import { access } from '@solid-primitives/utils';
import { DOMWithState, isServer } from '@solidjs/web';
import { createEffect, onCleanup, sharedConfig, untrack } from 'solid-js';
import { setProperty } from './attribute-patch';
import { assignDOMProp } from './solid-dom';
import type { Cleanup, Props } from './types';
import { cleanupAll, isElement, isEqual, noop, readProps, runCleanupUpdate } from './utils';

/**
 * Creates a reversible Solid 2 prop updater owned by the current Solid scope.
 *
 * Calling the updater reads prop getters immediately, even without a target, and
 * applies their snapshot synchronously, except during a hydration claim, when the
 * latest update waits for a microtask. Target changes are applied after rendering.
 * Call inside a tracked effect for reactive props, or use createPropsProxy.
 * Do not call the updater in a memo or an effect compute callback.
 * Disposal restores the target and makes subsequent updater calls inert. SSR is inert.
 */
export function createSpread<T extends object>(target: MaybeAccessor<T | null | undefined>): (props: Props<T>) => void {
  let currentTarget: T | undefined;
  let latestProps: ReturnType<typeof readProps> | undefined;
  let disposed = false;
  let queued = false;
  let updateVersion = 0;
  let pendingTarget: T | null | undefined;
  const applied = new Map<string, AppliedProp>();

  const disposeCurrent = () => {
    cleanupAll(Array.from(applied.values(), ({ cleanup }) => cleanup))();
    applied.clear();
    currentTarget = undefined;
  };

  const syncTarget = (nextTarget: T | null | undefined) => {
    if (disposed) return;
    // client.ts skips writes during the synchronous hydration claim. A proxy has
    // no SSR output to claim, so install its layers after that pass has finished.
    if (sharedConfig.hydrating) {
      pendingTarget = nextTarget;
      if (!queued) {
        queued = true;
        queueMicrotask(() => {
          if (!queued) return;
          queued = false;
          const next = pendingTarget;
          pendingTarget = undefined;
          syncTarget(next);
        });
      }
      return;
    }
    queued = false;
    pendingTarget = undefined;
    if (currentTarget !== (nextTarget ?? undefined)) disposeCurrent();
    currentTarget = nextTarget ?? undefined;
    if (currentTarget && latestProps) assign(currentTarget, latestProps, applied);
  };

  onCleanup(() => {
    disposed = true;
    latestProps = undefined;
    pendingTarget = undefined;
    disposeCurrent();
  });

  // Keep DOM writes out of Solid 2's speculative compute phase.
  createEffect(
    () => ({ target: isServer ? undefined : access(target), version: updateVersion }),
    (snapshot) => {
      // An explicit updater call can supersede a target captured by a pending effect.
      if (snapshot.version === updateVersion) syncTarget(snapshot.target);
    }
  );

  return (props: Props<T>) => {
    if (disposed || isServer) return;
    updateVersion++;
    const snapshot = readProps(props);
    untrack(() => {
      const nextTarget = access(target);
      latestProps = snapshot;
      syncTarget(nextTarget);
    });
  };
}

/** One prop's last snapshot and reversible layer. */
type AppliedProp = {
  value: unknown;
  cleanup: Cleanup;
};

/**
 * Synchronizes a prop bag onto a target and disposes props that disappeared.
 *
 * This follows @solidjs/web 2.0.0-rc.4's assign step while keeping cleanup state for
 * reversible overlays on existing DOM nodes or plain objects.
 */
function assign(target: object, entries: ReturnType<typeof readProps>, applied: Map<string, AppliedProp>): void {
  const nextKeys = new Set(Object.keys(entries));
  const syncProp = (prop: string, value: unknown, apply: () => Cleanup): void => {
    const current = applied.get(prop);

    const stateful = isElement(target) && DOMWithState[target.nodeName]?.[prop] === 1;
    if (current && isEqual(current.value, value) && !stateful) {
      return;
    }

    if (current && runCleanupUpdate(current.cleanup, value)) {
      current.value = value;
      return;
    }

    current?.cleanup();
    applied.set(prop, {
      value,
      cleanup: apply()
    });
  };

  for (const prop of Array.from(applied.keys()).reverse()) {
    if (nextKeys.has(prop)) {
      continue;
    }

    applied.get(prop)?.cleanup();
    applied.delete(prop);
  }

  if (isElement(target)) {
    for (const [prop, value] of Object.entries(entries)) {
      syncProp(prop, value, () => assignDOMProp(target, prop, value));
    }

    return;
  }

  for (const [prop, value] of Object.entries(entries)) {
    if (prop === 'ref') {
      syncProp(prop, value, () => {
        if (typeof value === 'function') {
          (value as (target: object) => void)(target);
        }

        return noop;
      });

      continue;
    }

    syncProp(prop, value, () => setProperty(target, prop, value, false));
  }
}
