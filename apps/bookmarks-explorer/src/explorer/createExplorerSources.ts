import type { Resource } from 'solid-js';
import { createResource, onCleanup, onMount } from 'solid-js';
import type { ExplorerBackend } from './backend';
import type { ExplorerSourceId, ExplorerTreeNode } from './model';

/** Creates Solid resources and subscriptions over an injected explorer backend. */
export function createExplorerSources(backend: ExplorerBackend) {
  const [explore, exploreControls] = createResource(() => backend.load('explore'));
  const [bookmarks, bookmarksControls] = createResource(() => backend.load('bookmarks'));
  const [history, historyControls] = createResource(() => backend.load('history'));

  const resources = { explore, bookmarks, history } satisfies Record<ExplorerSourceId, Resource<ExplorerTreeNode>>;
  const controls = {
    explore: exploreControls,
    bookmarks: bookmarksControls,
    history: historyControls
  } satisfies Record<ExplorerSourceId, Pick<typeof exploreControls, 'refetch'>>;
  const refreshTimers: Record<ExplorerSourceId, ReturnType<typeof setTimeout> | undefined> = {
    explore: undefined,
    bookmarks: undefined,
    history: undefined
  };

  onMount(() => {
    const unsubscribe = backend.subscribe(scheduleRefresh);
    onCleanup(() => {
      unsubscribe();
      for (const source of EXPLORER_SOURCE_IDS) {
        clearScheduledRefresh(source);
      }
    });
  });

  return {
    /** Returns the current tree for a source, or undefined while it loads. */
    tree(source: ExplorerSourceId): ExplorerTreeNode | undefined {
      return resources[source]();
    },
    /** Reports whether a source is currently loading or refreshing. */
    loading(source: ExplorerSourceId): boolean {
      return resources[source].loading;
    },
    /** Returns the last loading failure for a source. */
    error(source: ExplorerSourceId): unknown {
      return resources[source].error;
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
    void controls[source].refetch();
  }

  function clearScheduledRefresh(source: ExplorerSourceId): void {
    const timer = refreshTimers[source];
    if (timer !== undefined) {
      clearTimeout(timer);
      refreshTimers[source] = undefined;
    }
  }
}

const EXPLORER_SOURCE_IDS = ['explore', 'bookmarks', 'history'] as const satisfies readonly ExplorerSourceId[];
const REFRESH_COALESCE_TIME_MS = 16;
