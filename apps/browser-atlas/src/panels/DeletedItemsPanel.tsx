import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, For, Show } from 'solid-js';
import type { ExplorerDeletedItemSummary } from '../explorer/backend';
import type { BrowserBackendBinding } from '../explorer/bindings';
import {
  type BackendChange,
  type BackendChanges,
  formatSnapshotTime,
  ServicePanelFrame,
  type ServicePanelState,
  ServicePanelStateView
} from './ServicePanelFrame';

/**
 * Deleted panel: lists hierarchies deleted from one browser's persistent tree,
 * newest first, and restores them. Reloads when the browser changes and after
 * deletions, Undo and Redo.
 */
export function DeletedItemsPanel(props: {
  /** Browser whose deletions are shown; `undefined` when no browser keeps them. */
  browser: BrowserBackendBinding | undefined;
  /** Browsers that keep deletions, offered in the picker. */
  browsers: readonly BrowserBackendBinding[];
  onBrowserChange: (browserId: string) => void;
  changes: BackendChanges;
}): JSX.Element {
  const [state, setState] = createSignal<ServicePanelState<DeletedItemsReady>>({ status: 'loading' });
  let request = 0;

  createEffect(
    () => props.browser,
    (browser) => void load(browser)
  );
  props.changes.listen((change) => {
    if (change.backendId === props.browser?.id && RELOADING_CHANGES.has(change.change)) {
      void load(props.browser);
    }
  });

  return (
    <ServicePanelFrame
      label="Deleted items history"
      browser={props.browser}
      browsers={props.browsers}
      onBrowserChange={props.onBrowserChange}
      unavailable="No browser keeps deleted items."
    >
      <ServicePanelStateView
        state={state()}
        loadingText="Loading deleted items…"
        onRetry={() => void load(props.browser)}
      >
        {(ready) => (
          <Show
            when={ready().items.length > 0}
            fallback={<p class="py-2 text-neutral-400">No deleted hierarchies yet.</p>}
          >
            <ol class="space-y-2">
              <For each={ready().items}>
                {(item) => (
                  <li
                    class="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 p-2"
                    data-deletion-id={item.deletionId}
                  >
                    <div class="min-w-0 flex-1">
                      <span class="block truncate text-neutral-200" title={item.title}>
                        {item.title}
                      </span>
                      <span class="block text-neutral-400">
                        {item.itemKind} · {item.nodeCount} {item.nodeCount === 1 ? 'node' : 'nodes'}
                      </span>
                      <span class="block text-neutral-500">
                        {formatDeletionTime(item.deletedAt)} ·{' '}
                        {item.mode === 'subtree' ? 'complete hierarchy' : 'children retained'}
                      </span>
                    </div>
                    <button
                      type="button"
                      class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                      aria-label={`Restore deleted ${item.title}`}
                      onClick={() => void restore(item.deletionId)}
                    >
                      Restore
                    </button>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        )}
      </ServicePanelStateView>
    </ServicePanelFrame>
  );

  /** Loads the list of `browser`; a result that arrives after a newer request is dropped. */
  async function load(browser: BrowserBackendBinding | undefined): Promise<void> {
    const history = browser?.backend.deletions;
    const current = ++request;
    if (!history) {
      setState({ status: 'error', message: 'This browser does not expose deleted items.' });
      return;
    }

    setState({ status: 'loading' });
    try {
      const items = await history.list();
      if (current === request) {
        setState({ status: 'ready', items });
      }
    } catch (reason: unknown) {
      if (current === request) {
        setState({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'Deleted items could not be loaded.'
        });
      }
    }
  }

  async function restore(deletionId: string): Promise<void> {
    const browser = props.browser;
    const history = browser?.backend.deletions;
    if (!browser || !history) {
      return;
    }

    const current = ++request;
    setState({ status: 'loading' });
    try {
      await history.restore(deletionId);
      browser.sources.refresh('explore');
      const items = await history.list();
      if (current === request) {
        setState({ status: 'ready', items });
      }
    } catch (reason: unknown) {
      if (current === request) {
        setState({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'The selected deleted item could not be restored.'
        });
      }
    }
  }
}

type DeletedItemsReady = Readonly<{ status: 'ready'; items: readonly ExplorerDeletedItemSummary[] }>;

/** Changes that add or remove deletions; a batch may delete several selected rows. */
const RELOADING_CHANGES: ReadonlySet<BackendChange['change']> = new Set([
  'batch',
  'delete-tree-item',
  'undo-persistent-tree',
  'redo-persistent-tree'
]);

function formatDeletionTime(deletedAt: number): string {
  return deletedAt > 0 ? formatSnapshotTime(deletedAt) : 'Unknown deletion time';
}
