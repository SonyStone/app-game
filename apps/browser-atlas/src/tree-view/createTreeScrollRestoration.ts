import type { JSX } from '@solidjs/web';
import { createSignal, createTrackedEffect, onCleanup } from 'solid-js';

/** Creates optional per-key scroll persistence for a tree's scrolling container. */
export function createTreeScrollRestoration(props: {
  /** Stable persistence key for the currently rendered tree. */
  key: () => string;
  /** Delays restoration until the current tree has been rendered. */
  ready?: () => boolean;
  /** Position used when the current key has never been persisted. Defaults to `start`. */
  defaultPosition?: () => TreeScrollPosition;
  /** Storage implementation. Defaults to browser local storage when available. */
  storage?: TreeScrollStorage;
}) {
  const [element, setElement] = createSignal<HTMLElement>();
  let activeKey: string | undefined;
  let activePosition = 0;
  let restoreFrame: number | undefined;
  let releaseRestoreTimeout: number | undefined;
  let restoringKey: string | undefined;
  let restoreCurrentPosition: (() => void) | undefined;

  createTrackedEffect(() => {
    const currentElement = element();
    const currentKey = props.key();
    if (!currentElement || activeKey === currentKey) {
      return;
    }
    const ready = props.ready?.() ?? true;
    if (!ready) {
      return;
    }
    const defaultPosition = props.defaultPosition?.() ?? 'start';

    finishActiveContext();

    const persistedPosition = readPosition(currentKey);
    activeKey = currentKey;
    activePosition = currentElement.scrollTop;
    restoringKey = currentKey;
    const restore = () => {
      const position = resolvePosition(persistedPosition, defaultPosition, currentElement);
      if (currentElement.scrollTop !== position) {
        currentElement.scrollTop = position;
      }
      activePosition = currentElement.scrollTop;
    };
    restoreCurrentPosition = restore;

    const restoreUntilSettled = () => {
      restore();
      restoreFrame = requestAnimationFrame(restoreUntilSettled);
    };
    restoreUntilSettled();

    releaseRestoreTimeout = window.setTimeout(() => {
      releaseRestoreTimeout = undefined;
      if (restoringKey === currentKey) {
        if (restoreFrame !== undefined) {
          cancelAnimationFrame(restoreFrame);
          restoreFrame = undefined;
        }
        restore();
        writePosition(currentKey, activePosition);
        restoringKey = undefined;
        restoreCurrentPosition = undefined;
      }
    }, RESTORE_SETTLE_TIME_MS);
  });

  onCleanup(finishActiveContext);

  return {
    /** Assigns the scrolling tree container. */
    setElementRef(element: HTMLElement): void {
      setElement(element);
    },
    /** Persists user-driven scrolling for the current tree key. */
    onScroll(event: TreeScrollEvent): void {
      const currentKey = activeKey;
      if (!currentKey || props.key() !== currentKey) {
        return;
      }
      const ready = props.ready?.() ?? true;
      if (!ready) {
        return;
      }

      if (restoringKey === currentKey) {
        restoreCurrentPosition?.();
        return;
      }

      activePosition = event.currentTarget.scrollTop;
      writePosition(currentKey, activePosition);
    },
    /** Releases initial restoration when the user starts interacting with the scroll container. */
    onUserInteraction(): void {
      cancelRestore();
    }
  } as const;

  function cancelRestore(): void {
    if (restoreFrame !== undefined) {
      cancelAnimationFrame(restoreFrame);
      restoreFrame = undefined;
    }
    if (releaseRestoreTimeout !== undefined) {
      clearTimeout(releaseRestoreTimeout);
      releaseRestoreTimeout = undefined;
    }
    restoringKey = undefined;
    restoreCurrentPosition = undefined;
  }

  function finishActiveContext(): void {
    cancelRestore();
    if (activeKey !== undefined) {
      writePosition(activeKey, activePosition);
      activeKey = undefined;
    }
  }

  function readPosition(key: string): number | undefined {
    try {
      const serialized = getStorage()?.getItem(key);
      if (serialized === null || serialized === undefined) {
        return undefined;
      }

      const position = Number(serialized);
      return Number.isFinite(position) && position >= 0 ? position : undefined;
    } catch {
      return undefined;
    }
  }

  function writePosition(key: string, position: number): void {
    try {
      getStorage()?.setItem(key, String(Math.max(0, position)));
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  function getStorage(): TreeScrollStorage | undefined {
    if (props.storage) {
      return props.storage;
    }
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  }
}

/** Initial position used when a tree has no saved scroll offset. */
export type TreeScrollPosition = 'start' | 'end' | number;

/** Minimal synchronous storage contract used by tree scroll persistence. */
export type TreeScrollStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Props accepted by {@link createTreeScrollRestoration}. */
export type CreateTreeScrollRestorationProps = Parameters<typeof createTreeScrollRestoration>[0];

type TreeScrollEvent = Parameters<JSX.EventHandler<HTMLDivElement, Event>>[0];

function resolvePosition(position: number | undefined, fallback: TreeScrollPosition, element: HTMLElement): number {
  const resolvedPosition = position ?? fallback;
  if (resolvedPosition === 'end') {
    return Math.max(0, element.scrollHeight - element.clientHeight);
  }
  return resolvedPosition === 'start' ? 0 : resolvedPosition;
}

const RESTORE_SETTLE_TIME_MS = 1_500;
