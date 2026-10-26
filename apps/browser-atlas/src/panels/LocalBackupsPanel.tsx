import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, For, Show } from 'solid-js';
import type { ExplorerTreeSnapshotSummary } from '../explorer/backend';
import type { BrowserBackendBinding } from '../explorer/bindings';
import type { ExplorerDocument } from '../explorer/portable';
import {
  type BackendChange,
  type BackendChanges,
  type ConfirmOperation,
  formatSnapshotTime,
  ServicePanelFrame,
  type ServicePanelState,
  ServicePanelStateView
} from './ServicePanelFrame';

/**
 * Backups panel: lists one browser's local tree snapshots, opens one as a
 * document or restores it over the saved tree after confirmation. Reloads when
 * the browser changes and after snapshots are created or restored elsewhere.
 */
export function LocalBackupsPanel(props: {
  /** Browser whose snapshots are shown; `undefined` when no browser keeps them. */
  browser: BrowserBackendBinding | undefined;
  /** Browsers with local snapshots, offered in the picker. */
  browsers: readonly BrowserBackendBinding[];
  onBrowserChange: (browserId: string) => void;
  changes: BackendChanges;
  confirm: ConfirmOperation;
  /** Shows a snapshot read as a detached document, for example in a new explorer. */
  onOpenDocument: (document: ExplorerDocument) => void;
}): JSX.Element {
  const [state, setState] = createSignal<ServicePanelState<LocalBackupsReady>>({ status: 'loading' });
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
      label="Local backup history"
      browser={props.browser}
      browsers={props.browsers}
      onBrowserChange={props.onBrowserChange}
      unavailable="No browser keeps local backups."
    >
      <ServicePanelStateView
        state={state()}
        loadingText="Loading local backups…"
        onRetry={() => void load(props.browser)}
      >
        {(ready) => (
          <Show
            when={ready().snapshots.length > 0}
            fallback={<p class="py-2 text-neutral-400">No local backups yet.</p>}
          >
            <ol class="space-y-2">
              <For each={ready().snapshots}>
                {(snapshot) => (
                  <li class="rounded border border-neutral-700 bg-neutral-950 p-2" data-created-at={snapshot.createdAt}>
                    <div class="mb-2 min-w-0">
                      <time
                        class="block truncate text-neutral-200"
                        datetime={new Date(snapshot.createdAt).toISOString()}
                        title={new Date(snapshot.createdAt).toISOString()}
                      >
                        {formatSnapshotTime(snapshot.createdAt)}
                      </time>
                      <span class="text-neutral-400">
                        {snapshot.nodeCount} {snapshot.nodeCount === 1 ? 'node' : 'nodes'}
                      </span>
                    </div>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                        aria-label={`Open backup from ${formatSnapshotTime(snapshot.createdAt)}`}
                        onClick={() => void open(snapshot.createdAt)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                        aria-label={`Restore backup from ${formatSnapshotTime(snapshot.createdAt)}`}
                        onClick={() => void restore(snapshot.createdAt)}
                      >
                        Restore
                      </button>
                    </div>
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
    const history = browser?.backend.snapshots;
    const current = ++request;
    if (!history) {
      setState({ status: 'error', message: 'This browser does not expose local backups.' });
      return;
    }

    setState({ status: 'loading' });
    try {
      const snapshots = await history.list();
      if (current === request) {
        setState({ status: 'ready', snapshots });
      }
    } catch (reason: unknown) {
      if (current === request) {
        setState({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'Local backups could not be loaded.'
        });
      }
    }
  }

  async function restore(createdAt: number): Promise<void> {
    const browser = props.browser;
    const history = browser?.backend.snapshots;
    if (!browser || !history) {
      return;
    }

    const confirmed = await props.confirm(
      'Restore local backup?',
      `The current saved tree will be replaced with the backup from ${formatSnapshotTime(createdAt)}.`,
      'Restore',
      true
    );
    if (!confirmed) {
      return;
    }

    const current = ++request;
    setState({ status: 'loading' });
    try {
      await history.restore(createdAt);
      browser.sources.refresh('explore');
      const snapshots = await history.list();
      if (current === request) {
        setState({ status: 'ready', snapshots });
      }
    } catch (reason: unknown) {
      if (current === request) {
        setState({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'The selected backup could not be restored.'
        });
      }
    }
  }

  async function open(createdAt: number): Promise<void> {
    const browser = props.browser;
    const history = browser?.backend.snapshots;
    if (!history) {
      return;
    }

    try {
      props.onOpenDocument(await history.read(createdAt));
    } catch (reason: unknown) {
      ++request;
      setState({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'The selected backup could not be opened.'
      });
    }
  }
}

type LocalBackupsReady = Readonly<{ status: 'ready'; snapshots: readonly ExplorerTreeSnapshotSummary[] }>;

/** Changes that add or consume snapshots outside this panel. */
const RELOADING_CHANGES: ReadonlySet<BackendChange['change']> = new Set([
  'create-tree-snapshot',
  'restore-latest-tree-snapshot'
]);
