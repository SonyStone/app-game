import type { Listen } from '@solid-primitives/event-bus';
import type { JSX } from '@solidjs/web';
import { type Accessor, For, Match, Show, Switch } from 'solid-js';
import type { ExplorerBackend, ExplorerCommand } from '../explorer/backend';
import type { BrowserBackendBinding } from '../explorer/bindings';

/**
 * A change made to one backend: an executed explorer command, or `cloud-backup`
 * after a cloud backup created outside the Cloud panel. Service panels reload
 * their lists when a change can alter them.
 */
export type BackendChange = Readonly<{
  backendId: string;
  change: ExplorerCommand['kind'] | 'cloud-backup';
}>;

/** Subscribes to {@link BackendChange}s; listeners unsubscribe when the caller's owner is disposed. */
export type BackendChanges = Readonly<{ listen: Listen<BackendChange> }>;

/** Asks the user to confirm an operation in an in-app dialog and resolves with the answer. */
export type ConfirmOperation = (
  title: string,
  message: string,
  confirmLabel: string,
  danger?: boolean
) => Promise<boolean>;

/** Whether a backend keeps deleted hierarchies for the Deleted panel. */
export function canBrowseDeletedItems(backend: ExplorerBackend): boolean {
  return backend.deletions !== undefined;
}

/** Whether a backend creates, lists and restores local tree snapshots. */
export function canUseLocalSnapshots(backend: ExplorerBackend): boolean {
  const commands = backend.capabilities.commands;
  return (
    commands['create-tree-snapshot'] && commands['restore-latest-tree-snapshot'] && backend.snapshots !== undefined
  );
}

/** Whether a backend offers remote tree backups. */
export function canUseCloudBackups(backend: ExplorerBackend): boolean {
  return backend.cloudBackups !== undefined;
}

/**
 * Body of a service panel: a browser picker when more than one browser offers the
 * feature, then the scrollable content for the chosen `browser`, or `unavailable`
 * when no browser offers it. `label` names the panel's region.
 */
export function ServicePanelFrame(props: {
  label: string;
  browser: BrowserBackendBinding | undefined;
  browsers: readonly BrowserBackendBinding[];
  onBrowserChange: (browserId: string) => void;
  unavailable: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section class="flex h-full flex-col bg-neutral-950 text-xs print:hidden" aria-label={props.label}>
      <Show when={props.browsers.length > 1}>
        <div class="flex h-8 flex-none items-center gap-2 border-b border-neutral-700 bg-neutral-900 px-2">
          <select
            class="h-6 max-w-48 min-w-0 rounded border border-neutral-700 bg-neutral-950 px-1 text-xs text-neutral-200"
            aria-label="Browser"
            value={props.browser?.id}
            onChange={(event) => props.onBrowserChange(event.currentTarget.value)}
          >
            <For each={props.browsers}>{(browser) => <option value={browser.id}>{browser.label()}</option>}</For>
          </select>
        </div>
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <Show when={props.browser} fallback={<p class="py-2 text-neutral-400">{props.unavailable}</p>}>
          {props.children}
        </Show>
      </div>
    </section>
  );
}

/** Formats a backup or deletion time for lists. */
export function formatSnapshotTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(createdAt);
}

/** List state of a service panel: loading, failed with a message, or ready (`T`). */
export type ServicePanelState<T extends Readonly<{ status: 'ready' }>> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | T;

/** Renders `children` for a ready state, otherwise the loading text or the error with a Retry button. */
export function ServicePanelStateView<T extends Readonly<{ status: 'ready' }>>(props: {
  state: ServicePanelState<T>;
  loadingText: string;
  onRetry: () => void;
  children: (ready: Accessor<T>) => JSX.Element;
}): JSX.Element {
  return (
    <Switch>
      <Match when={props.state.status === 'ready' ? (props.state as T) : undefined}>
        {(ready) => props.children(ready)}
      </Match>
      <Match when={props.state.status === 'error' ? (props.state as Readonly<{ message: string }>) : undefined}>
        {(error) => (
          <div role="alert">
            <p class="mb-2 text-red-300">{error().message}</p>
            <button
              type="button"
              class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
              onClick={() => props.onRetry()}
            >
              Retry
            </button>
          </div>
        )}
      </Match>
      <Match when={props.state.status === 'loading'}>
        <p class="py-2 text-neutral-400" role="status">
          {props.loadingText}
        </p>
      </Match>
    </Switch>
  );
}
