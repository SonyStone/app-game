import { createSignal, onSettled } from 'solid-js';
import type { ExplorerBackend } from './backend';
import type { ExplorerSourceId, ExplorerTreeNode } from './model';

/** Creates Solid resources and subscriptions over an injected explorer backend. */
export function createExplorerSources(backend: ExplorerBackend) {
  const resources = {
    explore: createExplorerSource('explore'),
    bookmarks: createExplorerSource('bookmarks'),
    history: createExplorerSource('history')
  } satisfies Record<ExplorerSourceId, ReturnType<typeof createExplorerSource>>;
  const refreshTimers: Record<ExplorerSourceId, ReturnType<typeof setTimeout> | undefined> = {
    explore: undefined,
    bookmarks: undefined,
    history: undefined
  };

  onSettled(() => {
    const unsubscribe = backend.subscribe(scheduleRefresh);

    return () => {
      unsubscribe();
      for (const source of EXPLORER_SOURCE_IDS) {
        clearScheduledRefresh(source);
      }
    };
  });

  return {
    /** Returns the current tree for a source, or undefined while it loads. */
    tree(source: ExplorerSourceId): ExplorerTreeNode | undefined {
      return resources[source].value();
    },
    /** Reports whether a source is currently loading or refreshing. */
    loading(source: ExplorerSourceId): boolean {
      return resources[source].loading();
    },
    /** Returns the last loading failure for a source. */
    error(source: ExplorerSourceId): unknown {
      return resources[source].error();
    },
    /** Reloads a source from the injected backend. */
    refresh(source: ExplorerSourceId): void {
      refreshNow(source);
    }
  } as const;

  function scheduleRefresh(source: ExplorerSourceId): void {
    clearScheduledRefresh(source);
    refreshTimers[source] = setTimeout(() => refreshNow(source), REFRESH_COALESCE_TIME_MS);
  }

  function refreshNow(source: ExplorerSourceId): void {
    clearScheduledRefresh(source);
    void resources[source].load();
  }

  function clearScheduledRefresh(source: ExplorerSourceId): void {
    const timer = refreshTimers[source];
    if (timer !== undefined) {
      clearTimeout(timer);
      refreshTimers[source] = undefined;
    }
  }

  function createExplorerSource(source: ExplorerSourceId) {
    const [value, setValue] = createSignal<ExplorerTreeNode>();
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<unknown>();
    let requestId = 0;

    async function load(): Promise<void> {
      const currentRequestId = ++requestId;
      setLoading(true);
      setError(undefined);
      try {
        const nextValue = await backend.load(source);
        if (requestId === currentRequestId) setValue(nextValue);
      } catch (reason: unknown) {
        if (requestId === currentRequestId) setError(reason);
      } finally {
        if (requestId === currentRequestId) setLoading(false);
      }
    }

    void load();
    return { value, loading, error, load } as const;
  }
}

const EXPLORER_SOURCE_IDS = ['explore', 'bookmarks', 'history'] as const satisfies readonly ExplorerSourceId[];
const REFRESH_COALESCE_TIME_MS = 16;
