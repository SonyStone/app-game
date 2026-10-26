import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, For, Match, Show, Switch } from 'solid-js';
import type {
  ExplorerCloudBackupAttempt,
  ExplorerCloudBackupConfiguration,
  ExplorerCloudBackupStatus,
  ExplorerCloudBackupSummary
} from '../explorer/backend';
import type { BrowserBackendBinding } from '../explorer/bindings';
import type { ExplorerDocument } from '../explorer/portable';
import {
  type BackendChanges,
  type ConfirmOperation,
  formatSnapshotTime,
  ServicePanelFrame,
  type ServicePanelState,
  ServicePanelStateView
} from './ServicePanelFrame';

/**
 * Cloud panel: provider-neutral connection, scheduling, retention and recovery
 * controls for one browser's remote backups. Reloads when the browser changes and
 * after a cloud backup made elsewhere; every operation refreshes the browser's
 * attempt strip shown on the Cloud toolbar buttons.
 */
export function CloudBackupsPanel(props: {
  /** Browser whose backups are shown; `undefined` when no browser offers cloud backups. */
  browser: BrowserBackendBinding | undefined;
  /** Browsers with cloud backups, offered in the picker. */
  browsers: readonly BrowserBackendBinding[];
  onBrowserChange: (browserId: string) => void;
  changes: BackendChanges;
  confirm: ConfirmOperation;
  /** Shows a downloaded backup as a detached document, for example in a new explorer. */
  onOpenDocument: (document: ExplorerDocument) => void;
}): JSX.Element {
  const [state, setState] = createSignal<ServicePanelState<CloudBackupsReady>>({ status: 'loading' });
  const providerName = () => props.browser?.backend.cloudBackups?.providerName ?? 'Cloud';
  let request = 0;

  createEffect(
    () => props.browser,
    (browser) => void load(browser)
  );
  props.changes.listen((change) => {
    if (change.backendId === props.browser?.id && change.change === 'cloud-backup') {
      void load(props.browser);
    }
  });

  return (
    <ServicePanelFrame
      label={`${providerName()} backups`}
      browser={props.browser}
      browsers={props.browsers}
      onBrowserChange={props.onBrowserChange}
      unavailable="No browser offers cloud backups."
    >
      <ServicePanelStateView
        state={state()}
        loadingText="Loading cloud backups…"
        onRetry={() => void load(props.browser)}
      >
        {(ready) => (
          <CloudBackupReadyPanel
            state={ready()}
            onConnect={() => void run((cloud) => cloud.connect())}
            onDisconnect={() => void run((cloud) => cloud.disconnect())}
            onConfigurationChange={updateConfigurationDraft}
            onSaveConfiguration={() => {
              const configuration = ready().configuration;
              void run((cloud) => cloud.configure(configuration));
            }}
            onCreate={() => {
              const configuration = ready().configuration;
              void run(async (cloud) => {
                await cloud.configure(configuration);
                await cloud.create('manual');
              });
            }}
            onOpen={(backupId) => void open(backupId)}
            onRestore={(backupId) => void restore(backupId)}
            onDelete={(backupId) => void remove(backupId)}
          />
        )}
      </ServicePanelStateView>
    </ServicePanelFrame>
  );

  /**
   * Loads connection, preferences, backups and the latest attempt of `browser`;
   * a result that arrives after a newer request is dropped.
   */
  async function load(browser: BrowserBackendBinding | undefined): Promise<void> {
    const cloudBackups = browser?.backend.cloudBackups;
    const current = ++request;
    if (!browser || !cloudBackups) {
      setState({ status: 'error', message: 'This browser does not expose cloud backups.' });
      return;
    }

    setState({ status: 'loading' });
    try {
      const [connection, configuration, attempt] = await Promise.all([
        cloudBackups.status(),
        cloudBackups.configuration(),
        cloudBackups.lastAttempt()
      ]);
      const backups = connection.status === 'connected' ? await cloudBackups.list() : [];
      const refreshedAttempt = await cloudBackups.lastAttempt();
      const latestAttempt = refreshedAttempt.status === 'none' ? attempt : refreshedAttempt;
      browser.cloudAttempt.set(latestAttempt);
      if (current === request) {
        setState({ status: 'ready', connection, configuration, backups, attempt: latestAttempt });
      }
    } catch (reason: unknown) {
      await browser.cloudAttempt.refresh();
      if (current === request) {
        setState({ status: 'error', message: formatCloudBackupError(reason) });
      }
    }
  }

  /** Runs a provider operation behind the loading state, then reloads; failures show in the panel. */
  async function run(
    operation: (cloud: NonNullable<BrowserBackendBinding['backend']['cloudBackups']>) => Promise<void>
  ): Promise<void> {
    const browser = props.browser;
    const cloudBackups = browser?.backend.cloudBackups;
    if (!browser || !cloudBackups) {
      return;
    }

    const current = ++request;
    setState({ status: 'loading' });
    try {
      await operation(cloudBackups);
    } catch (reason: unknown) {
      await browser.cloudAttempt.refresh();
      if (current === request) {
        setState({ status: 'error', message: formatCloudBackupError(reason) });
      }
      return;
    }

    await load(browser);
  }

  function updateConfigurationDraft(configuration: ExplorerCloudBackupConfiguration): void {
    const current = state();
    if (current.status === 'ready') {
      setState({ ...current, configuration });
    }
  }

  async function restore(backupId: string): Promise<void> {
    const browser = props.browser;
    const confirmed = await props.confirm(
      'Restore cloud backup?',
      'The current saved tree will be replaced with this cloud backup.',
      'Restore',
      true
    );
    if (browser && confirmed) {
      await run(async (cloud) => {
        await cloud.restore(backupId);
        browser.sources.refresh('explore');
      });
    }
  }

  async function remove(backupId: string): Promise<void> {
    const confirmed = await props.confirm(
      'Delete cloud backup?',
      'This cloud backup will be permanently deleted.',
      'Delete',
      true
    );
    if (confirmed) {
      await run((cloud) => cloud.delete(backupId));
    }
  }

  async function open(backupId: string): Promise<void> {
    const cloudBackups = props.browser?.backend.cloudBackups;
    if (!cloudBackups) {
      return;
    }

    try {
      props.onOpenDocument(await cloudBackups.read(backupId));
    } catch (reason: unknown) {
      ++request;
      setState({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }
}

type CloudBackupsReady = Readonly<{
  status: 'ready';
  connection: ExplorerCloudBackupStatus;
  configuration: ExplorerCloudBackupConfiguration;
  backups: readonly ExplorerCloudBackupSummary[];
  attempt: ExplorerCloudBackupAttempt;
}>;

function CloudBackupReadyPanel(props: {
  state: CloudBackupsReady;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigurationChange: (configuration: ExplorerCloudBackupConfiguration) => void;
  onSaveConfiguration: () => void;
  onCreate: () => void;
  onOpen: (backupId: string) => void;
  onRestore: (backupId: string) => void;
  onDelete: (backupId: string) => void;
}) {
  return (
    <>
      <CloudBackupAttemptStatus attempt={props.state.attempt} />
      <Switch>
        <Match when={props.state.connection.status === 'unavailable' ? props.state.connection : undefined}>
          {(connection) => <p class="py-2 text-amber-300">{connection().reason}</p>}
        </Match>
        <Match when={props.state.connection.status === 'disconnected'}>
          <p class="mb-3 text-neutral-400">
            Connect this browser identity to create and restore durable remote copies.
          </p>
          <button
            type="button"
            class="rounded border border-blue-600 bg-blue-950 px-2 py-1 text-blue-100 hover:bg-blue-900"
            onClick={() => props.onConnect()}
          >
            Connect
          </button>
        </Match>
        <Match when={props.state.connection.status === 'connected' ? props.state.connection : undefined}>
          {(connection) => (
            <>
              <div class="mb-3 flex items-center gap-2 text-neutral-400">
                <span>Connected</span>
                <Show when={connection().accountLabel}>
                  {(accountLabel) => <span class="truncate text-neutral-200">· {accountLabel()}</span>}
                </Show>
                <button
                  type="button"
                  class="ml-auto text-neutral-400 hover:text-white"
                  onClick={() => props.onDisconnect()}
                >
                  Disconnect
                </button>
              </div>
              <label class="mb-2 block text-neutral-300">
                <span class="mb-1 block">Machine label</span>
                <input
                  type="text"
                  class="h-7 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-neutral-100 outline-none focus:border-blue-500"
                  aria-label="Backup machine label"
                  placeholder="For example: work or home"
                  value={props.state.configuration.machineLabel}
                  onInput={(event) =>
                    props.onConfigurationChange({
                      ...props.state.configuration,
                      machineLabel: event.currentTarget.value
                    })
                  }
                />
              </label>
              <label class="mb-3 flex items-start gap-2 text-neutral-300">
                <input
                  type="checkbox"
                  class="mt-0.5"
                  aria-label="Automatic daily cloud backups"
                  checked={props.state.configuration.automaticBackups}
                  onChange={(event) =>
                    props.onConfigurationChange({
                      ...props.state.configuration,
                      automaticBackups: event.currentTarget.checked
                    })
                  }
                />
                <span>Create an automatic backup when the newest daily copy is at least 24 hours old.</span>
              </label>
              <div class="mb-3 flex gap-2 border-b border-neutral-700 pb-3">
                <button
                  type="button"
                  class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                  onClick={() => props.onSaveConfiguration()}
                >
                  Save preferences
                </button>
                <button
                  type="button"
                  class="rounded border border-blue-600 bg-blue-950 px-2 py-1 text-blue-100 hover:bg-blue-900"
                  aria-label="Create cloud backup"
                  onClick={() => props.onCreate()}
                >
                  Backup now
                </button>
              </div>
              <Show
                when={props.state.backups.length > 0}
                fallback={<p class="py-2 text-neutral-400">No cloud backups yet.</p>}
              >
                <ol class="space-y-2">
                  <For each={props.state.backups}>
                    {(backup) => (
                      <li
                        class="rounded border border-neutral-700 bg-neutral-950 p-2"
                        data-cloud-backup-id={backup.backupId}
                      >
                        <div class="mb-2 min-w-0">
                          <time
                            class="block truncate text-neutral-200"
                            datetime={new Date(backup.createdAt).toISOString()}
                            title={new Date(backup.createdAt).toISOString()}
                          >
                            {formatSnapshotTime(backup.createdAt)}
                          </time>
                          <span class="block text-neutral-400">
                            {backup.mode === 'automatic' ? 'Automatic' : 'Manual'}
                            {backup.machineLabel ? ` · ${backup.machineLabel}` : ''}
                          </span>
                          <span class="block text-neutral-500">
                            {backup.nodeCount} {backup.nodeCount === 1 ? 'node' : 'nodes'} ·{' '}
                            {formatCloudBackupSize(backup.sizeBytes)}
                          </span>
                        </div>
                        <div class="flex gap-2">
                          <button
                            type="button"
                            class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                            aria-label={`Open cloud backup from ${formatSnapshotTime(backup.createdAt)}`}
                            onClick={() => props.onOpen(backup.backupId)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                            aria-label={`Restore cloud backup from ${formatSnapshotTime(backup.createdAt)}`}
                            onClick={() => props.onRestore(backup.backupId)}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            class="rounded border border-red-800 px-2 py-1 text-red-300 hover:bg-red-950"
                            aria-label={`Delete cloud backup from ${formatSnapshotTime(backup.createdAt)}`}
                            onClick={() => props.onDelete(backup.backupId)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    )}
                  </For>
                </ol>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </>
  );
}

function CloudBackupAttemptStatus(props: { attempt: ExplorerCloudBackupAttempt }) {
  const indicator = () => cloudBackupAttemptIndicator(props.attempt);
  return (
    <p
      class="mb-3 flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-300"
      role="status"
      data-cloud-backup-attempt={props.attempt.status}
    >
      <span
        class={[
          'h-2 w-2 flex-none rounded-full',
          {
            'bg-neutral-500': indicator().tone === 'none',
            'bg-emerald-500': indicator().tone === 'success',
            'bg-red-500': indicator().tone === 'failure'
          }
        ]}
        aria-hidden="true"
      />
      {indicator().label}
    </p>
  );
}

/** Color tone and description of a cloud-backup attempt, shown as a strip on toolbar buttons. */
export type CloudBackupAttemptIndicator = Readonly<{
  tone: ExplorerCloudBackupAttempt['status'];
  label: string;
}>;

/** Describes the latest cloud-backup attempt for the toolbar strip and the Cloud panel. */
export function cloudBackupAttemptIndicator(attempt: ExplorerCloudBackupAttempt): CloudBackupAttemptIndicator {
  switch (attempt.status) {
    case 'none':
      return { tone: 'none', label: 'No cloud backup attempt this browser session' };
    case 'success':
      return {
        tone: 'success',
        label: `Last ${attempt.mode} cloud backup succeeded · ${formatSnapshotTime(attempt.attemptedAt)}`
      };
    case 'failure':
      return {
        tone: 'failure',
        label: `Last ${attempt.mode} cloud backup failed · ${attempt.message}`
      };
    default: {
      const exhaustiveAttempt: never = attempt;
      return exhaustiveAttempt;
    }
  }
}

function formatCloudBackupSize(sizeBytes: number): string {
  if (sizeBytes < 1_024) {
    return `${sizeBytes} B`;
  }
  return `${(sizeBytes / 1_024).toFixed(sizeBytes < 10_240 ? 1 : 0)} KB`;
}

function formatCloudBackupError(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Cloud backups could not be updated.';
}
