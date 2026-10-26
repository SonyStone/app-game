import { createVirtualNestedList } from '@app-game/solid-virtual';
import { createEventBus } from '@solid-primitives/event-bus';
import type { JSX } from '@solidjs/web';
import { Portal } from '@solidjs/web';
import { Dock, type PanelId } from 'solid-dock';
import type { Accessor } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  createTrackedEffect,
  For,
  mapArray,
  onCleanup,
  onSettled,
  Show,
  untrack
} from 'solid-js';
import { createDocumentExplorerBackend } from './backends/document/createDocumentExplorerBackend';
import styles from './App.module.css';
import type {
  ExplorerBackend,
  ExplorerBatchableCommand,
  ExplorerCloudBackupAttempt,
  ExplorerCommand,
  ExplorerDeleteTarget,
  ExplorerImportTarget,
  PersistentItemReference,
  PersistentItemTarget,
  PersistentMovePlacement,
  PersistentOrganizerPlacement
} from './explorer/backend';
import { batchExplorerCommands } from './explorer/backend';
import type { BrowserBackendBinding, DocumentBackendBinding, ExplorerBackendBinding } from './explorer/bindings';
import { createBrowserBinding, createDocumentBinding } from './explorer/bindings';
import { readExplorerClipboard, serializeClipboardText, writeExplorerClipboard } from './explorer/clipboard';
import type { ExplorerOrganizerKind } from './explorer/createExplorerDragAndDrop';
import { affectedSources, createExplorerDragAndDrop } from './explorer/createExplorerDragAndDrop';
import { createMetroTreeLines } from './explorer/createMetroTreeLines';
import { ExplorerTreeRow } from './explorer/ExplorerTreeRow';
import type { ExplorerHtmlRow } from './explorer/files';
import {
  createExplorerDocumentSnapshot,
  downloadExplorerDocument,
  downloadExplorerHtml,
  downloadExplorerSourceText,
  readExplorerFile
} from './explorer/files';
import type { ExplorerSourceId, ExplorerTreeNode } from './explorer/model';
import { equalExplorerTreeNodes, EXPLORER_SOURCES, getExplorerChildren } from './explorer/model';
import type { ExplorerDocument, PortableExplorerNode } from './explorer/portable';
import { createPortableExplorerNode, portableChildren, portableVisibleChildren } from './explorer/portable';
import { BrowserAtlasAboutDialog, BrowserAtlasHelpDialog } from './help/BrowserAtlasInfoDialog';
import { cloudBackupAttemptIndicator, type CloudBackupAttemptIndicator, CloudBackupsPanel } from './panels/CloudBackupsPanel';
import { DeletedItemsPanel } from './panels/DeletedItemsPanel';
import { LocalBackupsPanel } from './panels/LocalBackupsPanel';
import {
  type BackendChange,
  canBrowseDeletedItems as canBackendBrowseDeletedItems,
  canUseCloudBackups as canBackendUseCloudBackups,
  canUseLocalSnapshots as canBackendUseLocalSnapshots
} from './panels/ServicePanelFrame';
import { SettingsPanel } from './panels/SettingsPanel';
import {
  DEFAULT_BROWSER_ATLAS_SETTINGS,
  readBrowserAtlasSettings,
  subscribeBrowserAtlasSettings,
  writeBrowserAtlasSettings,
  type BrowserAtlasSettings
} from './settings';
import type { TreeKeyboardMoveDirection, TreeKeyboardOrganizerRequest } from './tree-view/createTreeKeyboardNavigation';
import { createTreeKeyboardNavigation } from './tree-view/createTreeKeyboardNavigation';
import { createTreeMarqueeSelection } from './tree-view/createTreeMarqueeSelection';
import { createTreePathHighlight } from './tree-view/createTreePathHighlight';
import { createTreeScrollRestoration } from './tree-view/createTreeScrollRestoration';
import { createTreeSelection } from './tree-view/createTreeSelection';
import type { TreeExpansionSnapshot, TreeViewItem } from './tree-view/createTreeView';
import { createTreeView } from './tree-view/createTreeView';
import { TreeDropIndicator } from './tree-view/TreeDropIndicator';
import { TreeFocusIndicator } from './tree-view/TreeFocusIndicator';
import { TreeMarquee } from './tree-view/TreeMarquee';
import { TreeSelectionHighlight } from './tree-view/TreeSelectionHighlight';
import { classicTreeConnector, TreeAnchorBox } from './tree-view/treeLines';
import type { TreeCollapsedSummary } from './tree-view/TreeView';
import { TreeView } from './tree-view/TreeView';
import { createWorkspace } from './workspace/createWorkspace';
import { type BackendKey, documentBackendKey, PRIMARY_BROWSER_KEY, type ServicePanelKind } from './workspace/layout';
import { PrimaryExplorerButton, WorkspaceDock } from './workspace/WorkspaceDock';

/** Props for the shared browser and website explorer composition. */
export type BrowserAtlasProps = {
  /** Primary live, fixture, or remote backend shown when the application opens. */
  backend: ExplorerBackend;
  /** User-facing name for the primary backend. Defaults to `Browser`. */
  backendLabel?: string;
  /** Additional independent browser identities available in every explorer's selector. */
  additionalBrowserBackends?: readonly BrowserAtlasBackendOption[];
};

/** One secondary live or simulated browser exposed beside the primary backend. */
export type BrowserAtlasBackendOption = Readonly<{
  id: string;
  label: string;
  backend: ExplorerBackend;
}>;

/**
 * Renders the docked workspace: any number of explorers, each with its own
 * document, plus the Deleted, Backups, Cloud and Settings panels. The layout and
 * every explorer's view are stored between sessions; documents are not, so an
 * explorer that showed one reopens on the primary browser's Explore.
 */
export function BrowserAtlas(props: BrowserAtlasProps) {
  const explorerControllers = new Map<PanelId, ExplorerPaneController>();
  const pendingClones = new Map<PanelId, ExplorerPaneClone>();
  const pendingDocuments = new Map<PanelId, ExplorerDocument>();
  let pendingBrowserActionWindowId = readRequestedBrowserWindowId();
  const instanceId = createInstanceId();
  // Explorer menus, dialogs and print views render here: inside a dock panel they would be clipped,
  // stacked below neighbouring panels, and offset by the panel's transform.
  const overlayLayer = document.createElement('div');
  const [operationError, setOperationError] = createSignal<string | null>(null);
  const [infoDialog, setInfoDialog] = createSignal<BrowserAtlasInfoDialogKind | null>(null);
  const [settings, setSettings] = createSignal<BrowserAtlasSettings>(DEFAULT_BROWSER_ATLAS_SETTINGS);
  const [clipboardMemory, setClipboardMemory] = createSignal<ExplorerClipboardMemory>(null);
  const [rootOperationDialog, setRootOperationDialog] = createSignal<ExplorerOperationDialogState | null>(null);
  const clipboard = { read: clipboardMemory, write: setClipboardMemory } satisfies ExplorerClipboardController;
  const primaryBrowser = createBrowserBinding(
    `${instanceId}:browser`,
    PRIMARY_BROWSER_KEY,
    props.backendLabel ?? 'Browser',
    props.backend
  );
  const additionalBrowsers = (props.additionalBrowserBackends ?? []).map((option) =>
    createBrowserBinding(`${instanceId}:browser:${option.id}`, `browser:${option.id}`, option.label, option.backend)
  );
  const browsers: readonly BrowserBackendBinding[] = [primaryBrowser, ...additionalBrowsers];
  const deletionBrowsers = browsers.filter((browser) => canBackendBrowseDeletedItems(browser.backend));
  const snapshotBrowsers = browsers.filter((browser) => canBackendUseLocalSnapshots(browser.backend));
  const cloudBrowsers = browsers.filter((browser) => canBackendUseCloudBackups(browser.backend));
  const workspace = createWorkspace({
    knownBrowsers: browsers.map((browser) => browser.key),
    onError: showOperationError
  });
  // Each explorer owns one document for files and opened backups; it lives as long as the explorer.
  const documents = mapArray(workspace.explorerIds, createExplorerDocument);
  const backends = createMemo((): ExplorerBackendBindings => [primaryBrowser, ...additionalBrowsers, ...documents()]);
  const backendChanges = createEventBus<BackendChange>();
  const dragAndDrop = createExplorerDragAndDrop({
    onCommand: executeCommand,
    canMoveAcrossBackends: canMoveAcrossBrowserBackends,
    createOrganizerCommand: requestDraggedOrganizerCommand
  });
  void readBrowserAtlasSettings().then(setSettings).catch(showOperationError);
  onCleanup(subscribeBrowserAtlasSettings(setSettings));
  onCleanup(subscribeBrowserActionWindowReveal(revealBrowserActionWindow));

  return (
    <main
      data-browser-atlas-theme={settings().appearance.lightBackground ? 'light' : 'dark'}
      class={`${styles.theme} h-screen min-h-0 overflow-hidden bg-neutral-950 text-neutral-100 print:h-auto print:overflow-visible print:bg-white print:text-black`}
    >
      <header class="relative flex h-8 items-center border-b border-neutral-700 px-2 print:hidden">
        <h1 class="text-sm font-medium">Browser Atlas</h1>
        <button
          type="button"
          class="ml-auto h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          title="Open another explorer panel on the browser's Explore tree"
          onClick={openExplorer}
        >
          New explorer
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          title="Open Browser Atlas in a standalone window"
          onClick={openStandaloneWindow}
        >
          Pop out
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          aria-haspopup="dialog"
          onClick={() => setInfoDialog('about')}
        >
          About
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          aria-haspopup="dialog"
          onClick={() => setInfoDialog('help')}
        >
          Help
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          title="Show or hide the Settings panel"
          aria-pressed={workspace.isVisible('settings') ? 'true' : 'false'}
          onClick={() => workspace.toggleUtilityPanel('settings')}
        >
          Settings
        </button>
      </header>

      <Show when={workspace.ready()}>
        <WorkspaceDock
          state={workspace.dock()}
          setState={workspace.setDock}
          class="h-[calc(100vh-2rem)] print:hidden"
          onClose={workspace.closePanel}
          tabAccessory={(panelId) => (
            <Show when={workspace.explorer(panelId)}>
              <PrimaryExplorerButton
                primary={workspace.primaryExplorer() === panelId}
                onSelect={() => workspace.setPrimary(panelId)}
              />
            </Show>
          )}
          empty={
            <button
              type="button"
              class="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
              onClick={openExplorer}
            >
              Open an explorer
            </button>
          }
          panels={
            <>
              <For each={workspace.explorerIds()}>
                {(panelId) => (
                  <Dock.Panel id={panelId} title={explorerTitle(panelId)}>
                    <ExplorerPane
                      panelId={panelId}
                      label={`Explorer ${workspace.explorer(panelId)?.number ?? ''}`}
                      primary={workspace.primaryExplorer() === panelId}
                      primaryBackendId={primaryBrowser.id}
                      backendId={backendIdOf(workspace.explorer(panelId)?.backend)}
                      source={workspace.explorer(panelId)?.source ?? 'explore'}
                      backends={backends()}
                      dragAndDrop={dragAndDrop}
                      clipboard={clipboard}
                      settings={settings}
                      overlayMount={overlayLayer}
                      registerController={(controller) => registerExplorerController(panelId, controller)}
                      onBackendChange={(backendId) =>
                        workspace.setExplorerView(panelId, { backend: backendKeyOf(backendId) })
                      }
                      onSourceChange={(source) => workspace.setExplorerView(panelId, { source })}
                      onOpenDocument={(document, label) => openDocumentInExplorer(panelId, document, label)}
                      onCloneView={(view) => cloneExplorerView(panelId, view)}
                      onToggleServicePanel={toggleServicePanel}
                      onBackup={(backendId) => void backupFromKeyboard(backendId)}
                      onCommand={executeCommand}
                      onError={showOperationError}
                    />
                  </Dock.Panel>
                )}
              </For>
              <Dock.Panel id="deleted" title="Deleted items">
                <DeletedItemsPanel
                  browser={serviceBrowser('deleted')}
                  browsers={deletionBrowsers}
                  onBrowserChange={(browserId) => workspace.setServiceBackend('deleted', backendKeyOf(browserId))}
                  changes={backendChanges}
                />
              </Dock.Panel>
              <Dock.Panel id="backups" title="Local backups">
                <LocalBackupsPanel
                  browser={serviceBrowser('backups')}
                  browsers={snapshotBrowsers}
                  onBrowserChange={(browserId) => workspace.setServiceBackend('backups', backendKeyOf(browserId))}
                  changes={backendChanges}
                  confirm={confirmOperation}
                  onOpenDocument={(document) => openDocumentInNewExplorer(document, 'backups')}
                />
              </Dock.Panel>
              <Dock.Panel id="cloud" title="Cloud backups">
                <CloudBackupsPanel
                  browser={serviceBrowser('cloud')}
                  browsers={cloudBrowsers}
                  onBrowserChange={(browserId) => workspace.setServiceBackend('cloud', backendKeyOf(browserId))}
                  changes={backendChanges}
                  confirm={confirmOperation}
                  onOpenDocument={(document) => openDocumentInNewExplorer(document, 'cloud')}
                />
              </Dock.Panel>
              <Dock.Panel id="settings" title="Settings">
                <SettingsPanel settings={settings()} onChange={updateSetting} onResetLayout={workspace.reset} />
              </Dock.Panel>
            </>
          }
        />
      </Show>
      {overlayLayer}

      <Show when={infoDialog() === 'help'}>
        <BrowserAtlasHelpDialog onClose={() => setInfoDialog(null)} />
      </Show>
      <Show when={infoDialog() === 'about'}>
        <BrowserAtlasAboutDialog onClose={() => setInfoDialog(null)} />
      </Show>
      <Show when={rootOperationDialog()}>
        {(dialog) => (
          <ExplorerOperationDialog
            state={dialog()}
            onCancel={() => closeRootOperationDialog(null)}
            onConfirm={(value) => closeRootOperationDialog(value)}
          />
        )}
      </Show>

      <Show when={dragAndDrop.feedback()}>{(feedback) => <TreeDropIndicator feedback={feedback()} />}</Show>
      <Show when={dragAndDrop.dropping()}>
        <div class="fixed right-3 bottom-3 z-50 rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-xs">
          Updating explorer data…
        </div>
      </Show>
      <Show when={dragAndDrop.error() ?? operationError()}>
        {(error) => (
          <div
            class="fixed right-3 bottom-3 z-50 flex max-w-md items-center gap-3 rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-100"
            role="alert"
          >
            <span>{error()}</span>
            <button
              type="button"
              class="text-red-300 hover:text-white"
              onClick={() => {
                dragAndDrop.dismissError();
                setOperationError(null);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </Show>
    </main>
  );

  async function executeCommand(backendId: string, command: ExplorerCommand): Promise<void> {
    const binding = backends().find((candidate) => candidate.id === backendId);
    if (!binding) {
      throw new Error('The destination backend is no longer available.');
    }
    const kinds =
      command.kind === 'batch' ? ['batch' as const, ...command.commands.map(({ kind }) => kind)] : [command.kind];
    const unsupportedKind = kinds.find((kind) => !binding.backend.capabilities.commands[kind]);
    if (unsupportedKind) {
      throw new Error(`${binding.label()} cannot execute ${unsupportedKind}.`);
    }
    await binding.backend.execute(command);
    for (const source of affectedSources(command)) {
      binding.sources.refresh(source);
    }
    backendChanges.emit({ backendId, change: command.kind });
  }

  function canMoveAcrossBrowserBackends(sourceBackendId: string, targetBackendId: string): boolean {
    const source = backends().find((candidate) => candidate.id === sourceBackendId);
    const target = backends().find((candidate) => candidate.id === targetBackendId);
    return source?.kind === 'browser' && target?.kind === 'browser';
  }

  async function requestDraggedOrganizerCommand(
    itemKind: ExplorerOrganizerKind,
    placement: PersistentOrganizerPlacement
  ): Promise<CreateSavedOrganizerCommand | null> {
    if (itemKind === 'separator') {
      return createDefaultSavedOrganizerCommand(itemKind, placement);
    }
    const title = await new Promise<string | null>((resolve) => {
      setRootOperationDialog({
        kind: 'prompt',
        title: `Create ${itemKind}`,
        initialValue: itemKind === 'group' ? 'New group' : 'New note',
        confirmLabel: 'Create',
        resolve
      });
    });
    return title === null ? null : createSavedOrganizerCommand(itemKind, placement, title);
  }

  function confirmOperation(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      setRootOperationDialog({ kind: 'confirm', title, message, confirmLabel, danger, resolve });
    });
  }

  function closeRootOperationDialog(value: string | boolean | null): void {
    const dialog = rootOperationDialog();
    if (!dialog) {
      return;
    }
    setRootOperationDialog(null);
    if (dialog.kind === 'prompt') {
      dialog.resolve(typeof value === 'string' ? value.trim() : null);
    } else {
      dialog.resolve(value === true);
    }
  }

  function showOperationError(reason: unknown): void {
    setOperationError(reason instanceof Error ? reason.message : 'The file operation could not be completed.');
  }

  function updateSetting<TKey extends keyof BrowserAtlasSettings>(key: TKey, value: BrowserAtlasSettings[TKey]): void {
    const nextSettings = { ...settings(), [key]: value } satisfies BrowserAtlasSettings;
    setSettings(nextSettings);
    void writeBrowserAtlasSettings(nextSettings).catch(showOperationError);
  }

  function openExplorer(): void {
    workspace.addExplorer(() => ({ backend: PRIMARY_BROWSER_KEY, source: 'explore' }));
  }

  /** Opens a new explorer to the right of `panelId` with the same view, see {@link ExplorerPaneClone}. */
  function cloneExplorerView(panelId: PanelId, view: ExplorerPaneClone): void {
    const cloneId = workspace.addExplorer(() => ({ backend: backendKeyOf(view.backendId), source: view.source }), {
      beside: panelId,
      edge: 'right'
    });
    pendingClones.set(cloneId, view);
  }

  /** Loads `document` into the explorer's own document and shows it there. */
  function openDocumentInExplorer(panelId: PanelId, document: ExplorerDocument, label: string): void {
    const binding = documents().find((candidate) => candidate.key === documentBackendKey(panelId));
    if (!binding) {
      return;
    }
    binding.document.replaceDocument(document);
    binding.setLabel(label);
    workspace.setExplorerView(panelId, { backend: binding.key });
  }

  /** Opens a backup read by a service panel in a new explorer to the left of that panel. */
  function openDocumentInNewExplorer(document: ExplorerDocument, servicePanelId: PanelId): void {
    workspace.addExplorer(
      (panelId) => {
        pendingDocuments.set(panelId, document);
        return { backend: documentBackendKey(panelId), source: 'explore' };
      },
      { beside: servicePanelId, edge: 'left' }
    );
  }

  /** Document of a new explorer: empty, or the backup it was opened for. Runs under the explorer's owner. */
  function createExplorerDocument(panelId: PanelId): DocumentBackendBinding {
    const initialDocument = pendingDocuments.get(panelId);
    pendingDocuments.delete(panelId);
    const key = documentBackendKey(panelId);
    const number = untrack(() => workspace.explorer(panelId)?.number);
    return createDocumentBinding(
      `${instanceId}:${key}`,
      key,
      initialDocument?.title ?? `File ${number ?? ''}`,
      createDocumentExplorerBackend(initialDocument)
    );
  }

  function explorerTitle(panelId: PanelId): string {
    const explorer = workspace.explorer(panelId);
    const binding = backends().find((candidate) => candidate.key === explorer?.backend) ?? primaryBrowser;
    const source = EXPLORER_SOURCES.find((candidate) => candidate.id === explorer?.source);
    return `${binding.label()} · ${source?.label ?? ''}`;
  }

  function backendIdOf(key: BackendKey | undefined): string {
    return backends().find((binding) => binding.key === key)?.id ?? primaryBrowser.id;
  }

  function backendKeyOf(backendId: string): BackendKey {
    return backends().find((binding) => binding.id === backendId)?.key ?? PRIMARY_BROWSER_KEY;
  }

  /** Browser a service panel shows: the chosen one while it offers the feature, else the first that does. */
  function serviceBrowser(kind: ServicePanelKind): BrowserBackendBinding | undefined {
    const candidates = kind === 'deleted' ? deletionBrowsers : kind === 'backups' ? snapshotBrowsers : cloudBrowsers;
    const key = workspace.serviceBackend(kind);
    return candidates.find((browser) => browser.key === key) ?? candidates[0];
  }

  /**
   * Toolbar action of an explorer: hides the service panel when it is visible and
   * already shows `backendId`, otherwise shows it for that browser.
   */
  function toggleServicePanel(kind: ServicePanelKind, backendId: string): void {
    const key = backendKeyOf(backendId);
    if (workspace.isVisible(kind) && serviceBrowser(kind)?.key === key) {
      workspace.closePanel(kind);
      return;
    }
    showServicePanel(kind, backendId);
  }

  function showServicePanel(kind: ServicePanelKind, backendId: string): void {
    workspace.setServiceBackend(kind, backendKeyOf(backendId));
    workspace.showUtilityPanel(kind);
  }

  /**
   * Ctrl/Cmd+B in an explorer showing Explore: a cloud backup when the browser is
   * connected, the Cloud panel when it can connect, otherwise a local snapshot.
   */
  async function backupFromKeyboard(backendId: string): Promise<void> {
    const binding = backends().find((candidate) => candidate.id === backendId);
    if (!binding) {
      return;
    }
    const createSnapshot = () => executeCommand(backendId, { kind: 'create-tree-snapshot' });
    const canSnapshot = canBackendUseLocalSnapshots(binding.backend);
    const cloudBackups = binding.backend.cloudBackups;
    if (binding.kind !== 'browser' || !cloudBackups) {
      if (canSnapshot) {
        await createSnapshot().catch(showOperationError);
      }
      return;
    }

    try {
      const connection = await cloudBackups.status();
      if (connection.status === 'connected') {
        await cloudBackups.create('manual').catch(showOperationError);
        await binding.cloudAttempt.refresh();
        showServicePanel('cloud', backendId);
        backendChanges.emit({ backendId, change: 'cloud-backup' });
        return;
      }
      if (connection.status === 'disconnected') {
        showServicePanel('cloud', backendId);
        return;
      }
      if (canSnapshot) {
        await createSnapshot();
      }
    } catch (reason: unknown) {
      if (canSnapshot) {
        await createSnapshot().catch(showOperationError);
      } else {
        showOperationError(reason);
      }
    }
  }

  /**
   * Tracks mounted explorers. A new explorer receives its pending clone; the
   * primary one receives a window reveal requested before it mounted.
   */
  function registerExplorerController(panelId: PanelId, controller: ExplorerPaneController | null): void {
    if (!controller) {
      explorerControllers.delete(panelId);
      return;
    }

    explorerControllers.set(panelId, controller);
    const clone = pendingClones.get(panelId);
    if (clone) {
      pendingClones.delete(panelId);
      controller.applyClone(clone);
    }
    if (pendingBrowserActionWindowId && workspace.primaryExplorer() === panelId) {
      const windowId = pendingBrowserActionWindowId;
      pendingBrowserActionWindowId = null;
      workspace.activate(panelId);
      controller.revealBrowserWindow(windowId);
    }
  }

  /** Shows a window in the primary explorer, opening an explorer first when none is open. */
  function revealBrowserActionWindow(windowId: string): void {
    const panelId = workspace.primaryExplorer();
    const controller = panelId === undefined ? undefined : explorerControllers.get(panelId);
    if (panelId === undefined || !controller) {
      pendingBrowserActionWindowId = windowId;
      if (panelId === undefined && workspace.ready()) {
        openExplorer();
      }
      return;
    }
    workspace.activate(panelId);
    controller.revealBrowserWindow(windowId);
  }

  function openStandaloneWindow(): void {
    const runtime = getBrowserActionRuntime();
    if (runtime) {
      void runtime.sendMessage({ kind: 'open-browser-atlas-standalone' }).catch(showOperationError);
      return;
    }
    const url = new URL(globalThis.location.href);
    url.searchParams.delete('focusWindowId');
    const popup = window.open(
      url.href,
      'browser-atlas-standalone',
      `popup=yes,width=${STANDALONE_WINDOW_WIDTH},height=${STANDALONE_WINDOW_HEIGHT}`
    );
    if (!popup) {
      showOperationError(new Error('The browser blocked the standalone Browser Atlas window.'));
      return;
    }
    popup.focus();
  }
}

type BrowserAtlasInfoDialogKind = 'help' | 'about';

type ExplorerDragAndDrop = ReturnType<typeof createExplorerDragAndDrop>;

/** Backends every explorer can show: the primary browser first, then other browsers and explorer documents. */
type ExplorerBackendBindings = readonly [BrowserBackendBinding, ...ExplorerBackendBinding[]];

type ExplorerClipboardMemory = Readonly<{
  items: readonly PortableExplorerNode[];
  plainText: string;
}> | null;

type ExplorerClipboardController = Readonly<{
  read: Accessor<ExplorerClipboardMemory>;
  write: (memory: ExplorerClipboardMemory) => void;
}>;

/** View copied into a new explorer by Clone: backend, source, expanded branches and scroll position. */
type ExplorerPaneClone = Readonly<{
  backendId: string;
  source: ExplorerSourceId;
  expansion: TreeExpansionSnapshot;
  scrollTop: number;
}>;

type ExplorerPaneController = Readonly<{
  applyClone: (view: ExplorerPaneClone) => void;
  revealBrowserWindow: (windowId: string) => void;
}>;

type ExplorerOperationDialogState =
  | Readonly<{
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (confirmed: boolean) => void;
    }>
  | Readonly<{
      kind: 'prompt';
      title: string;
      initialValue: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }>;

/**
 * One explorer panel: toolbar, search and the virtual tree of the selected backend
 * and source. The view is controlled: `backendId` and `source` come from the
 * workspace layout and changes are reported through `onBackendChange` and
 * `onSourceChange`. Only the `primary` explorer follows the focused browser window.
 */
function ExplorerPane(props: {
  /** Dock panel id; keys the stored scroll positions. */
  panelId: string;
  /** Accessible name of the explorer's region, `Explorer <number>`. */
  label: string;
  primary: boolean;
  /** Browser that window reveals switch to. */
  primaryBackendId: string;
  backendId: string;
  source: ExplorerSourceId;
  backends: ExplorerBackendBindings;
  dragAndDrop: ExplorerDragAndDrop;
  clipboard: ExplorerClipboardController;
  settings: Accessor<BrowserAtlasSettings>;
  /** Element that context menus, dialogs and print views render into. */
  overlayMount: Element;
  registerController: (controller: ExplorerPaneController | null) => void;
  onBackendChange: (backendId: string) => void;
  onSourceChange: (source: ExplorerSourceId) => void;
  /** Loads a file into this explorer's own document and shows it. */
  onOpenDocument: (document: ExplorerDocument, label: string) => void;
  /** Requests a new explorer with this view (C). */
  onCloneView: (view: ExplorerPaneClone) => void;
  /** Deleted, Backups and Cloud toolbar actions for the selected browser. */
  onToggleServicePanel: (kind: ServicePanelKind, backendId: string) => void;
  /** Ctrl/Cmd+B on the selected backend's Explore tree. */
  onBackup: (backendId: string) => void;
  onCommand: (backendId: string, command: ExplorerCommand) => Promise<void>;
  onError: (reason: unknown) => void;
}) {
  let fileInput: HTMLInputElement | undefined;
  let searchInput: HTMLInputElement | undefined;
  let scrollHistoryTimer: number | undefined;
  let ignoreScrollHistory = false;
  let observedFocusedWindowId: string | null = null;
  let suppressedFocusedWindowId: string | null = null;
  const scrollHistoryByContext = new Map<string, number[]>();
  const [scrollElement, setScrollElement] = createSignal<HTMLDivElement>();
  const selectedBackendId = () => props.backendId;
  const setSelectedBackendId = (backendId: string) => props.onBackendChange(backendId);
  const selectedSource = () => props.source;
  const setSelectedSource = (source: ExplorerSourceId) => props.onSourceChange(source);
  const [expandAllUndo, setExpandAllUndo] = createSignal<ExpandAllUndo | null>(null);
  const [contextMenu, setContextMenu] = createSignal<ExplorerContextMenuState | null>(null);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchIndex, setSearchIndex] = createSignal(0);
  const [printDocument, setPrintDocument] = createSignal<ExplorerPrintDocument | null>(null);
  const [pendingClone, setPendingClone] = createSignal<ExplorerPaneClone | null>(null);
  const [pendingBrowserWindowReveal, setPendingBrowserWindowReveal] = createSignal<string | null>(null);
  const [operationDialog, setOperationDialog] = createSignal<ExplorerOperationDialogState | null>(null);
  const selectedBackend = (): ExplorerBackendBinding =>
    props.backends.find((backend) => backend.id === selectedBackendId()) ?? props.backends[0];
  const cloudBackupAttempt = (): ExplorerCloudBackupAttempt => {
    const binding = selectedBackend();
    return binding.kind === 'browser' ? binding.cloudAttempt.attempt() : { status: 'none' };
  };
  const focusedBrowserWindowId = createMemo(() => {
    if (selectedSource() !== 'explore' || selectedBackend().kind !== 'browser') {
      return null;
    }
    const root = selectedBackend().sources.tree('explore');
    return root ? findFocusedExplorerWindowId(root) : null;
  });
  const tree = createTreeView<ExplorerTreeNode>({
    items: () => {
      const root = selectedBackend().sources.tree(selectedSource());
      return root ? [root] : [];
    },
    getId: (node) => node.id,
    getChildren: getExplorerChildren,
    isItemEqual: equalExplorerTreeNodes,
    isInitiallyExpanded: (node) => node.kind === 'message' || !node.defaultCollapsed
  });
  const searchMatches = createMemo(() => {
    const query = searchQuery().trim().toLocaleLowerCase();
    return query ? tree.visibleItems().filter((item) => explorerNodeSearchText(item.item).includes(query)) : [];
  });
  const virtualTree = createVirtualNestedList({
    items: tree.children,
    elementRef: scrollElement,
    itemHeight: TREE_ROW_HEIGHT,
    getChildren: (item) => item.children(),
    isExpanded: (item) => item.isExpanded,
    overscan: TREE_OVERSCAN,
    gap: 0
  });
  const backgroundDropProps = createMemo(() => {
    const root = tree.children()[0];
    return root ? props.dragAndDrop.dropZoneProps(root.item, selectedBackendId()) : undefined;
  });
  const selection = createTreeSelection({ tree });
  const navigation = createTreeKeyboardNavigation({
    tree,
    selection,
    // Ctrl/Cmd/Shift+click on a link title opens it elsewhere, as in Tabs Outliner.
    acceptsSelectionModifiers: (event) => !(event.target instanceof Element && event.target.closest('a[href]')),
    scrollTo: (item) => virtualTree.scrollTo(item),
    onActivate(node, alternative) {
      void activateNode(node, alternative);
    },
    onEdit(node) {
      if (node.kind === 'message') {
        return;
      }
      if (savedOrganizerId(node) || node.reference.kind === 'window' || node.reference.kind === 'saved-window') {
        void editPersistentItemTitle(node);
        return;
      }
      if (node.kind === 'link' && (node.reference.kind === 'tab' || node.reference.kind === 'saved-tab')) {
        editInlineTabNote(node);
      }
    },
    onSaveClose(nodes) {
      saveCloseNodes(nodes);
    },
    onDelete(nodes) {
      deleteNodes(nodes);
    },
    onUndo() {
      if (canUndoTree()) {
        undoTree();
      }
    },
    onRedo() {
      if (canRedoTree()) {
        redoTree();
      }
    },
    onSaveAll() {
      if (canSaveCloseAllWindows()) {
        saveCloseAllWindows();
      }
    },
    onBackup() {
      backupFromKeyboard();
    },
    onScrollPreviousWindow() {
      scrollToPreviousOpenWindow();
    },
    onUndoScroll() {
      undoScroll();
    },
    onCloneView() {
      cloneView();
    },
    onInsertOrganizer(node, request) {
      return insertOrganizerFromKeyboard(node, request);
    },
    onMoveItem(node, direction) {
      return moveItemFromKeyboard(node, direction);
    },
    onFlatten(node) {
      return flattenTabsFromKeyboard(node);
    }
  });
  const pathHighlight = createTreePathHighlight({
    tree,
    fallbackTarget: navigation.focusedId,
    enabled: () => props.settings().appearance.pathHighlight
  });
  const metroLines = createMetroTreeLines({
    tree,
    storageScope: () => `${selectedBackend().kind}:${selectedBackend().label()}:${selectedSource()}`,
    path: pathHighlight
  });
  const marquee = createTreeMarqueeSelection({
    tree,
    selection,
    element: scrollElement,
    rowHeight: TREE_ROW_HEIGHT,
    dragsFromEmptySpace: (item) => selection.isSelected(item) && props.dragAndDrop.canDrag(item.item),
    onFinish(item) {
      if (item) {
        navigation.focus(item, 'keep');
      }
    }
  });
  const scrollRestoration = createTreeScrollRestoration({
    key: () => `browser-atlas:tree-scroll:v2:${props.panelId}:${selectedBackendId()}:${selectedSource()}`,
    ready: () => {
      const sources = selectedBackend().sources;
      return (
        !sources.loading(selectedSource()) &&
        sources.error(selectedSource()) === undefined &&
        sources.tree(selectedSource()) !== undefined
      );
    },
    defaultPosition: () => (selectedSource() === 'explore' ? 'end' : 'start')
  });
  // The owner may answer registration with a pending reveal, which writes pane state; Solid forbids
  // writes during setup, so register only after the first settled render.
  onSettled(() => {
    props.registerController({ applyClone, revealBrowserWindow });

    return () => props.registerController(null);
  });
  // A clone is applied once the pane shows the cloned view and its tree has loaded. A split
  // compute/effect pair also sees a clone requested in the same flush as the view switch.
  createEffect(
    () => {
      const clone = pendingClone();
      return clone &&
        selectedBackendId() === clone.backendId &&
        selectedSource() === clone.source &&
        selectedBackend().sources.tree(clone.source) !== undefined
        ? clone
        : null;
    },
    (clone) => {
      if (!clone) {
        return;
      }

      tree.applyExpansion(clone.expansion);
      setPendingClone(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const element = scrollElement();
          if (!element) {
            return;
          }
          scrollRestoration.onUserInteraction();
          element.scrollTo({ top: clone.scrollTop });
        });
      });
    }
  );
  // Tracks the request before the pane registers, so a reveal requested from the first settle is seen.
  createEffect(
    () => {
      const windowId = pendingBrowserWindowReveal();
      if (
        !windowId ||
        selectedBackendId() !== props.primaryBackendId ||
        selectedSource() !== 'explore' ||
        selectedBackend().sources.loading('explore')
      ) {
        return null;
      }

      const path = browserWindowPath(windowId);
      return path.length > 0 ? { windowId, path } : null;
    },
    (reveal) => {
      if (!reveal) {
        return;
      }

      const { windowId, path } = reveal;
      setPendingBrowserWindowReveal(null);
      for (const ancestor of path.slice(0, -1)) {
        ancestor.setExpanded(true);
      }
      requestAnimationFrame(() => {
        const refreshedWindow = browserWindowPath(windowId).at(-1);
        if (!refreshedWindow) {
          return;
        }
        virtualTree.scrollTo(refreshedWindow, { align: 'start' });
        navigation.focus(refreshedWindow);
      });
    }
  );
  createTrackedEffect(() => {
    const focusedWindowId = focusedBrowserWindowId();
    if (focusedWindowId === null || focusedWindowId === observedFocusedWindowId) {
      return;
    }
    const hadObservedWindow = observedFocusedWindowId !== null;
    observedFocusedWindowId = focusedWindowId;
    if (!hadObservedWindow || !props.primary || !props.settings().autoFollowFocusedWindow) {
      return;
    }
    if (suppressedFocusedWindowId === focusedWindowId) {
      suppressedFocusedWindowId = null;
      return;
    }
    revealFocusedWindow(false);
  });
  onCleanup(() => {
    if (scrollHistoryTimer !== undefined) {
      clearTimeout(scrollHistoryTimer);
    }
  });
  return (
    <section
      class="relative flex h-full min-w-0 flex-col bg-neutral-950 print:block print:overflow-visible"
      aria-label={props.label}
      onKeyDown={handlePaneKeyboardShortcut}
    >
      <div class="flex h-8 flex-none items-center gap-1 overflow-x-auto border-b border-neutral-700 bg-neutral-900 px-1 [scrollbar-width:none] print:hidden">
        <select
          class="h-6 max-w-32 min-w-16 rounded border border-neutral-700 bg-neutral-950 px-1 text-xs text-neutral-200"
          aria-label="Explorer data source"
          value={selectedBackendId()}
          onChange={(event) => setSelectedBackendId(event.currentTarget.value)}
        >
          <For each={props.backends}>{(backend) => <option value={backend.id}>{backend.label()}</option>}</For>
        </select>

        <div class="flex h-full items-end gap-0.5" role="tablist">
          <For each={EXPLORER_SOURCES}>
            {(source) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedSource() === source.id ? 'true' : 'false'}
                class={[
                  'h-7 border border-b-0 px-2 text-xs',
                  {
                    'border-neutral-600 bg-neutral-800 text-white': selectedSource() === source.id,
                    'border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100':
                      selectedSource() !== source.id
                  }
                ]}
                onClick={() => setSelectedSource(source.id)}
              >
                {source.label}
              </button>
            )}
          </For>
        </div>

        <div class="ml-auto flex h-7 min-w-16 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          <input
            ref={(element) => {
              fileInput = element;
            }}
            class="hidden"
            type="file"
            accept=".tree,.json,.txt,.html,application/json,text/plain,text/html"
            onChange={handleFileInputChange}
          />
          <PaneAction
            title="Open a Browser Atlas JSON, structural HTML, or URL text file"
            label="Open"
            onClick={() => fileInput?.click()}
          />
          <PaneAction
            title="Export all collections as Browser Atlas JSON"
            label="JSON"
            onClick={() => void exportDocument()}
          />
          <PaneAction
            title={`Export ${selectedSource()} URLs as text`}
            label="URLs"
            onClick={() => void exportSource()}
          />
          <Show when={canCreateWindow()}>
            <PaneAction
              title="Open a new browser window; drag it to place it precisely"
              label="Window"
              dragProps={
                canCreateWindowAtPlacement() ? props.dragAndDrop.windowDragProps(selectedBackendId()) : undefined
              }
              onClick={createWindow}
            />
          </Show>
          <Show when={canCreateGoogleDoc()}>
            <PaneAction
              title="Create a protected Google document; drag it to place it precisely"
              label="Doc"
              dragProps={props.dragAndDrop.googleDocDragProps(selectedBackendId())}
              onClick={createGoogleDoc}
            />
          </Show>
          <Show when={canCreateSavedOrganizer()}>
            <PaneAction
              title="Create a saved group; drag it to place it precisely"
              label="Group"
              dragProps={props.dragAndDrop.organizerDragProps('group', selectedBackendId())}
              onClick={() => createOrganizer('group')}
            />
            <PaneAction
              title="Create a saved note; drag it to place it precisely"
              label="Note"
              dragProps={props.dragAndDrop.organizerDragProps('note', selectedBackendId())}
              onClick={() => createOrganizer('note')}
            />
            <PaneAction
              title="Create a saved separator; drag it to place it precisely"
              label="Rule"
              dragProps={props.dragAndDrop.organizerDragProps('separator', selectedBackendId())}
              onClick={() => createOrganizer('separator')}
            />
          </Show>
          <Show when={canSaveCloseAllWindows()}>
            <PaneAction
              title="Save and close all other browser windows"
              label="Save all"
              onClick={saveCloseAllWindows}
            />
          </Show>
          <Show when={canUseUndoHistory()}>
            <PaneAction
              title="Undo the latest persistent tree change"
              label="Undo"
              disabled={!canUndoTree()}
              onClick={undoTree}
            />
            <PaneAction
              title="Redo the latest undone persistent tree change"
              label="Redo"
              disabled={!canRedoTree()}
              onClick={redoTree}
            />
          </Show>
          <Show when={canBrowseDeletedItems()}>
            <PaneAction
              title="Browse and restore deleted hierarchies"
              label="Deleted"
              onClick={() => props.onToggleServicePanel('deleted', selectedBackendId())}
            />
          </Show>
          <Show when={canUseLocalSnapshots()}>
            <PaneAction title="Create a local tree snapshot" label="Backup" onClick={createTreeSnapshot} />
            <PaneAction
              title="Restore the latest local tree snapshot"
              label="Restore backup"
              onClick={restoreLatestTreeSnapshot}
            />
            <PaneAction
              title="Browse and restore local tree snapshots"
              label="Backups"
              onClick={() => props.onToggleServicePanel('backups', selectedBackendId())}
            />
          </Show>
          <Show when={canUseCloudBackups()}>
            <PaneAction
              title="Manage manual and automatic remote tree backups"
              label="Cloud"
              indicator={cloudBackupAttemptIndicator(cloudBackupAttempt())}
              onClick={() => props.onToggleServicePanel('cloud', selectedBackendId())}
            />
          </Show>
          <PaneAction
            title={canUndoExpandAll() ? 'Restore the previous collapsed branches' : 'Expand all collapsed branches'}
            label={canUndoExpandAll() ? 'Undo expand' : 'Expand all'}
            onClick={toggleExpandAll}
          />
          <Show when={canFocusCurrentWindow()}>
            <PaneAction title="Focus the current browser window" label="Current" onClick={focusCurrentWindow} />
          </Show>
          <PaneAction
            title="Scroll up to the previous open window (W)"
            label="Prev window"
            onClick={scrollToPreviousOpenWindow}
          />
          <PaneAction title="Undo the last tree scroll (S)" label="Undo scroll" onClick={undoScroll} />
          <PaneAction title="Clone this view into a new explorer (C)" label="Clone" onClick={cloneView} />
          <button
            type="button"
            class="h-6 flex-none px-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
            title="Refresh from the selected backend"
            aria-label={`Refresh ${selectedSource()}`}
            onClick={() => selectedBackend().sources.refresh(selectedSource())}
          >
            ↻
          </button>
        </div>
      </div>

      <Show when={searchOpen()}>
        <div
          class="flex h-8 flex-none items-center gap-1 border-b border-neutral-700 bg-neutral-900 px-2 print:hidden"
          role="search"
        >
          <input
            ref={(element) => {
              searchInput = element;
            }}
            type="search"
            class="h-6 min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none focus:border-blue-500"
            aria-label="Find visible nodes"
            placeholder="Find visible nodes"
            value={searchQuery()}
            onInput={(event) => updateSearchQuery(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <span class="w-12 text-center text-[0.65rem] text-neutral-400" role="status">
            {searchMatches().length === 0 ? '0 / 0' : `${searchIndex() + 1} / ${searchMatches().length}`}
          </span>
          <button
            type="button"
            class="h-6 px-1 text-neutral-400 hover:text-white"
            title="Previous match"
            onClick={() => selectSearchMatch(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            class="h-6 px-1 text-neutral-400 hover:text-white"
            title="Next match"
            onClick={() => selectSearchMatch(1)}
          >
            ↓
          </button>
          <button
            type="button"
            class="h-6 px-1 text-neutral-400 hover:text-white"
            title="Close search"
            onClick={closeSearch}
          >
            ×
          </button>
        </div>
      </Show>

      <div
        ref={(element) => {
          setScrollElement(element);
          scrollRestoration.setElementRef(element);
        }}
        class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto print:hidden"
        role="tabpanel"
        style={{ 'overflow-anchor': 'none' }}
        onScroll={handleTreeScroll}
        onWheel={scrollRestoration.onUserInteraction}
        onPointerDown={(event) => {
          scrollRestoration.onUserInteraction();
          marquee.onPointerDown(event);
        }}
        onPointerOver={pathHighlight.onPointerOver}
        onPointerLeave={pathHighlight.onPointerLeave}
        onFocusIn={pathHighlight.onFocusIn}
        onFocusOut={pathHighlight.onFocusOut}
        onTouchStart={scrollRestoration.onUserInteraction}
        onKeyDown={scrollRestoration.onUserInteraction}
        onDragEnter={handlePaneDragEnter}
        onDragOver={handlePaneDragOver}
        onDragLeave={handlePaneDragLeave}
        onDrop={handlePaneDrop}
        onCopy={handleClipboardCopy}
        onCut={handleClipboardCut}
        onPaste={handleClipboardPaste}
      >
        <Show when={selectedBackend().sources.tree(selectedSource())} fallback={<UnavailableTreeStatus />}>
          <TreeSelectionHighlight runs={selection.selectedRuns()} rowHeight={TREE_ROW_HEIGHT} virtual={virtualTree} />
          <TreeView
            virtual={virtualTree}
            isProtected={(item) => item.item.kind !== 'message' && item.item.protectedFromClose === true}
            collapsedSummary={(item) => createExplorerCollapsedSummary(item.item)}
            connector={(item) =>
              props.settings().appearance.treeStyle === 'metro'
                ? metroLines.connector(item)
                : classicTreeConnector(pathHighlight.state(item))
            }
            anchor={(item) =>
              props.settings().appearance.treeStyle === 'metro' ? (
                metroLines.anchor(item)
              ) : (
                <TreeAnchorBox
                  expanded={item.childCount > 0 ? item.isExpanded : undefined}
                  protected={item.item.kind !== 'message' && item.item.protectedFromClose === true}
                  highlighted={pathHighlight.state(item) === 'path'}
                />
              )
            }
            rowProps={(item) => ({
              ...props.dragAndDrop.rowProps(item.item, selectedBackendId(), () => dragNodesFor(item)),
              ...navigation.rowProps(item),
              'data-tree-path': pathHighlight.state(item),
              onContextMenu: (event) => handleRowContextMenu(event, item)
            })}
            rowClass={(item) =>
              props.dragAndDrop.canDrag(item.item) ? 'cursor-grab active:cursor-grabbing' : undefined
            }
          >
            {(item) => (
              <>
                <TreeFocusIndicator focused={navigation.isFocused(item)} selected={navigation.isSelected(item)} />
                <ExplorerTreeRow
                  node={item.item}
                  selected={navigation.isSelected(item)}
                  activateOnSingleClick={props.settings().oneClickActivation}
                  appearance={props.settings().appearance}
                  onActivate={(node, alternativeRestore) => void activateNode(node, alternativeRestore)}
                  onLinkClick={handleLinkClick}
                  onAction={(node) => handleNodeAction(node, item)}
                  onDelete={(node) => handleNodeDelete(node, item)}
                />
              </>
            )}
          </TreeView>
        </Show>
        <Show when={marquee.rect()}>{(rect) => <TreeMarquee rect={rect()} />}</Show>
      </div>

      <Show when={contextMenu()}>
        {(menu) => (
          <Portal mount={props.overlayMount}>
            <ExplorerContextMenu
              x={menu().x}
              y={menu().y}
              sections={menu().multiple ? selectionContextMenuSections() : contextMenuSections(menu().item)}
              onClose={() => setContextMenu(null)}
            />
          </Portal>
        )}
      </Show>
      <Show when={operationDialog()}>
        {(dialog) => (
          <Portal mount={props.overlayMount}>
            <ExplorerOperationDialog
              state={dialog()}
              onCancel={() => closeOperationDialog(null)}
              onConfirm={(value) => closeOperationDialog(value)}
            />
          </Portal>
        )}
      </Show>
      <Show when={printDocument()}>
        {(document) => (
          <Portal mount={props.overlayMount}>
            <ExplorerPrintView title={document().title} rows={document().rows} />
          </Portal>
        )}
      </Show>
    </section>
  );

  function handlePaneKeyboardShortcut(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !isEditableKeyboardTarget(event.target)) {
      if (event.key.toLocaleLowerCase() === 'w') {
        consumeKeyboardShortcut(event);
        scrollToPreviousOpenWindow();
        return;
      }
      if (event.key.toLocaleLowerCase() === 's') {
        consumeKeyboardShortcut(event);
        undoScroll();
        return;
      }
      if (event.key.toLocaleLowerCase() === 'c') {
        consumeKeyboardShortcut(event);
        cloneView();
        return;
      }
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    if (event.key.toLocaleLowerCase() === 'z') {
      consumeKeyboardShortcut(event);
      if (event.shiftKey) {
        redoTree();
      } else {
        undoTree();
      }
      return;
    }
    if (event.key.toLocaleLowerCase() === 'y') {
      consumeKeyboardShortcut(event);
      redoTree();
      return;
    }
    switch (event.key.toLocaleLowerCase()) {
      case 'f':
        consumeKeyboardShortcut(event);
        openSearch();
        break;
      case 'p':
        consumeKeyboardShortcut(event);
        printVisibleTree();
        break;
      case 's':
        consumeKeyboardShortcut(event);
        exportVisibleHtml();
        break;
      default:
        break;
    }
  }

  function openSearch(): void {
    setSearchOpen(true);
    queueMicrotask(() => {
      searchInput?.focus();
      searchInput?.select();
      selectSearchMatchAt(searchIndex());
    });
  }

  function confirmOperation(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      setContextMenu(null);
      setOperationDialog({ kind: 'confirm', title, message, confirmLabel, danger, resolve });
    });
  }

  function requestOperationText(title: string, initialValue: string, confirmLabel: string): Promise<string | null> {
    return new Promise((resolve) => {
      setContextMenu(null);
      setOperationDialog({ kind: 'prompt', title, initialValue, confirmLabel, resolve });
    });
  }

  function closeOperationDialog(value: string | boolean | null): void {
    const dialog = operationDialog();
    if (!dialog) {
      return;
    }
    setOperationDialog(null);
    if (dialog.kind === 'confirm') {
      dialog.resolve(value === true);
    } else {
      dialog.resolve(typeof value === 'string' ? value.trim() : null);
    }
  }

  function closeSearch(): void {
    setSearchOpen(false);
  }

  function updateSearchQuery(query: string): void {
    setSearchQuery(query);
    setSearchIndex(0);
    queueMicrotask(() => selectSearchMatchAt(0));
  }

  function handleSearchKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectSearchMatch(event.shiftKey ? -1 : 1);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
      event.preventDefault();
      searchInput?.select();
    }
  }

  function selectSearchMatch(offset: number): void {
    const matches = searchMatches();
    if (matches.length === 0) {
      return;
    }
    const index = (searchIndex() + offset + matches.length) % matches.length;
    setSearchIndex(index);
    navigation.select(matches[index]!);
    searchInput?.focus();
  }

  function selectSearchMatchAt(requestedIndex: number): void {
    const matches = searchMatches();
    if (matches.length === 0) {
      return;
    }
    const index = Math.min(requestedIndex, matches.length - 1);
    setSearchIndex(index);
    navigation.select(matches[index]!);
  }

  function exportVisibleHtml(): void {
    const root = tree.children()[0]?.item;
    downloadExplorerHtml(
      selectedBackend().label(),
      selectedSource(),
      visibleHtmlRows(),
      root ? portableVisibleChildren(root, new Map(tree.visibleItems().map((item) => [item.id, item.isExpanded]))) : []
    );
  }

  function printVisibleTree(): void {
    setPrintDocument({ title: visibleTreeTitle(), rows: visibleHtmlRows() });
    queueMicrotask(() => {
      window.print();
      setPrintDocument(null);
    });
  }

  function visibleTreeTitle(): string {
    const source = EXPLORER_SOURCES.find((candidate) => candidate.id === selectedSource());
    return `${selectedBackend().label()} · ${source?.label ?? selectedSource()}`;
  }

  function visibleHtmlRows(): ExplorerHtmlRow[] {
    return tree.visibleItems().map(({ depth, item }) => ({
      depth,
      title: item.title,
      url: item.kind === 'link' ? item.url : null,
      description: item.kind === 'link' ? item.description : ''
    }));
  }

  function handleTreeScroll(event: Parameters<typeof scrollRestoration.onScroll>[0]): void {
    scrollRestoration.onScroll(event);
    if (ignoreScrollHistory) {
      return;
    }
    if (scrollHistoryTimer !== undefined) {
      clearTimeout(scrollHistoryTimer);
    }
    const contextKey = expansionContextKey();
    const scrollTop = event.currentTarget.scrollTop;
    scrollHistoryTimer = window.setTimeout(() => {
      scrollHistoryTimer = undefined;
      rememberScrollPosition(scrollTop, contextKey);
    }, SCROLL_HISTORY_SETTLE_TIME_MS);
  }

  function scrollToPreviousOpenWindow(): void {
    const element = scrollElement();
    if (!element) {
      return;
    }
    const currentPosition = element.scrollTop;
    const destination = tree
      .visibleItems()
      .findLast(
        (item, index) =>
          index * TREE_ROW_HEIGHT < currentPosition - 1 &&
          item.item.kind === 'group' &&
          item.item.reference.kind === 'window'
      );
    if (!destination) {
      return;
    }
    scrollRestoration.onUserInteraction();
    rememberScrollPosition(currentPosition);
    virtualTree.scrollTo(destination, { align: 'start' });
  }

  function undoScroll(): void {
    const element = scrollElement();
    if (!element) {
      return;
    }
    if (scrollHistoryTimer !== undefined) {
      clearTimeout(scrollHistoryTimer);
      scrollHistoryTimer = undefined;
    }
    const history = currentScrollHistory();
    while (history.at(-1) === element.scrollTop) {
      history.pop();
    }
    const destination = history.pop();
    if (destination === undefined) {
      return;
    }
    scrollRestoration.onUserInteraction();
    ignoreScrollHistory = true;
    element.scrollTo({ top: destination });
    requestAnimationFrame(() => {
      ignoreScrollHistory = false;
    });
  }

  function rememberScrollPosition(position: number, contextKey = expansionContextKey()): void {
    const history = scrollHistoryByContext.get(contextKey) ?? [];
    if (history.at(-1) === position) {
      return;
    }
    history.push(position);
    if (history.length > MAX_SCROLL_HISTORY_LENGTH) {
      history.shift();
    }
    scrollHistoryByContext.set(contextKey, history);
  }

  function currentScrollHistory(): number[] {
    return scrollHistoryByContext.get(expansionContextKey()) ?? [];
  }

  function cloneView(): void {
    props.onCloneView({
      backendId: selectedBackendId(),
      source: selectedSource(),
      expansion: tree.captureExpansion(),
      scrollTop: scrollElement()?.scrollTop ?? 0
    });
  }

  function applyClone(view: ExplorerPaneClone): void {
    setContextMenu(null);
    setSearchOpen(false);
    setSelectedBackendId(view.backendId);
    setSelectedSource(view.source);
    setPendingClone(view);
  }

  async function activateNode(node: ExplorerTreeNode, alternativeRestore = false): Promise<void> {
    if (node.kind === 'message') {
      return;
    }
    try {
      if (node.reference.kind === 'tab') {
        if (props.primary) {
          suppressedFocusedWindowId = node.reference.windowId;
        }
        await props.onCommand(selectedBackendId(), {
          kind: 'activate-tab',
          tabId: node.reference.id,
          windowId: node.reference.windowId
        });
        return;
      }
      if (node.reference.kind === 'window') {
        if (props.primary) {
          suppressedFocusedWindowId = node.reference.id;
        }
        await props.onCommand(selectedBackendId(), {
          kind: 'activate-window',
          windowId: node.reference.id
        });
        return;
      }
      if (node.reference.kind === 'saved-tab') {
        await props.onCommand(selectedBackendId(), {
          kind: 'restore-saved-tab',
          savedTabId: node.reference.id
        });
        return;
      }
      if (node.reference.kind === 'saved-window') {
        await props.onCommand(selectedBackendId(), {
          kind: alternativeRestore ? 'restore-saved-window-session' : 'restore-saved-window',
          savedWindowId: node.reference.id
        });
        return;
      }
      if (node.reference.kind === 'saved-group') {
        await props.onCommand(selectedBackendId(), {
          kind: 'restore-saved-group',
          savedGroupId: node.reference.id
        });
        return;
      }
      if (node.reference.kind === 'saved-note') {
        handleNodeAction(node);
        return;
      }
      if (node.reference.kind === 'saved-separator') {
        handleNodeAction(node);
        return;
      }
      if (node.kind !== 'link' || !node.url) {
        return;
      }
      window.open(node.url, '_blank', 'noopener');
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  function handleLinkClick(
    node: Extract<ExplorerTreeNode, { kind: 'link' }>,
    event: MouseEvent & { currentTarget: HTMLAnchorElement }
  ): void {
    const openTarget = event.shiftKey
      ? 'new-window'
      : event.ctrlKey || event.metaKey || event.button === 1
        ? 'last-focused-window'
        : undefined;
    if (openTarget && selectedBackend().backend.capabilities.commands['open-link']) {
      event.preventDefault();
      void openLinkWithoutRestoring(node, openTarget);
      return;
    }
    if (node.reference.kind !== 'tab' && node.reference.kind !== 'saved-tab') {
      return;
    }
    event.preventDefault();
    const activatesOnThisClick = props.settings().oneClickActivation ? event.detail === 1 : event.detail >= 2;
    if (!activatesOnThisClick) {
      return;
    }
    void activateNode(node);
  }

  async function openLinkWithoutRestoring(
    node: Extract<ExplorerTreeNode, { kind: 'link' }>,
    target: Extract<ExplorerCommand, { kind: 'open-link' }>['target']
  ): Promise<void> {
    if (!node.url) {
      return;
    }
    try {
      await props.onCommand(selectedBackendId(), {
        kind: 'open-link',
        url: node.url,
        target,
        nestUnderActiveTab: props.settings().nestNewTabsUnderOpener
      });
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  function handleNodeAction(
    node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
    item?: TreeViewItem<ExplorerTreeNode>
  ): void {
    if (node.reference.kind === 'saved-group' || node.reference.kind === 'saved-note') {
      void editPersistentItemTitle(node);
      return;
    }
    const command = createNodeActionCommand(node, item !== undefined && item.childCount > 0 && !item.isExpanded);
    if (command) {
      void props.onCommand(selectedBackendId(), command).catch(props.onError);
    }
  }

  async function editPersistentItemTitle(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): Promise<void> {
    const item = persistentMoveSourceForNode(node);
    if (!item || !selectedBackend().backend.capabilities.commands['rename-persistent-item']) {
      return;
    }
    const title = await requestOperationText('Rename item', node.title.replace(/ \(focused\)$/u, ''), 'Rename');
    if (title !== null) {
      void props.onCommand(selectedBackendId(), { kind: 'rename-persistent-item', item, title }).catch(props.onError);
    }
  }

  function handleNodeDelete(
    node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
    item: TreeViewItem<ExplorerTreeNode>
  ): void {
    const target = deleteTargetForNode(node);
    if (!target || !selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      return;
    }
    const mode = persistentDeleteMode(target, item);
    navigation.clearSelection();
    runDeleteCommand({ kind: 'delete-tree-item', target, mode });
  }

  /** Nodes a drag from a row carries: the selected hierarchies when the row is selected, else the row alone. */
  function dragNodesFor(item: TreeViewItem<ExplorerTreeNode>): readonly ExplorerTreeNode[] {
    return selection.isSelected(item) ? selection.selectedRoots().map((root) => root.item) : [item.item];
  }

  /**
   * Deletes nodes as one undoable change, each by the single-row rule: a collapsed branch with its
   * hierarchy, an expanded one alone while its children stay. Descendants go before ancestors.
   */
  function deleteNodes(nodes: readonly ExplorerTreeNode[]): void {
    const deletions = nodes.flatMap((node) => {
      const item = node.kind === 'message' ? undefined : treeItemForNode(node);
      const target = node.kind === 'message' ? undefined : deleteTargetForNode(node);
      return item && target ? [{ item, target }] : [];
    });
    const [deletion] = deletions;
    if (deletions.length === 1 && deletion && deletion.item.item.kind !== 'message') {
      handleNodeDelete(deletion.item.item, deletion.item);
      return;
    }
    if (deletions.length === 0 || !selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      return;
    }

    navigation.clearSelection();
    runDeleteCommand(
      batchExplorerCommands(
        deletions
          .map(({ item, target }) => ({
            kind: 'delete-tree-item' as const,
            target,
            mode: persistentDeleteMode(target, item)
          }))
          .reverse()
      )
    );
  }

  /**
   * Saves and closes live tabs and windows as one undoable change. A collapsed branch includes its
   * hidden descendants, as for one row; tabs of a window that closes too are left to the window.
   */
  function saveCloseNodes(nodes: readonly ExplorerTreeNode[]): void {
    const closable = nodes.filter(
      (node): node is Exclude<ExplorerTreeNode, { kind: 'message' }> =>
        node.kind !== 'message' && (node.reference.kind === 'tab' || node.reference.kind === 'window')
    );
    const [node] = closable;
    if (closable.length === 1 && node) {
      handleNodeAction(node, treeItemForNode(node));
      return;
    }

    const closingWindowIds = new Set(
      closable.flatMap((candidate) => (candidate.reference.kind === 'window' ? [candidate.reference.id] : []))
    );
    const commands = closable.flatMap((candidate) => {
      if (candidate.reference.kind === 'tab' && closingWindowIds.has(candidate.reference.windowId)) {
        return [];
      }
      const item = treeItemForNode(candidate);
      const command = createNodeActionCommand(candidate, item !== undefined && item.childCount > 0 && !item.isExpanded);
      return command ? [command] : [];
    });
    if (commands.length > 0) {
      void props.onCommand(selectedBackendId(), batchExplorerCommands(commands)).catch(props.onError);
    }
  }

  function treeItemForNode(node: ExplorerTreeNode): TreeViewItem<ExplorerTreeNode> | undefined {
    return findTreeItemPath(tree.children(), (candidate) => candidate.item.id === node.id).at(-1);
  }

  function canCreateWindow(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['create-window'];
  }

  function canCreateWindowAtPlacement(): boolean {
    return (
      selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['create-window-at-placement']
    );
  }

  function createWindow(): void {
    void props.onCommand(selectedBackendId(), { kind: 'create-window' }).catch(props.onError);
  }

  function canCreateGoogleDoc(): boolean {
    return (
      selectedSource() === 'explore' &&
      selectedBackend().backend.capabilities.commands['create-google-doc-at-placement']
    );
  }

  function createGoogleDoc(): void {
    void props
      .onCommand(selectedBackendId(), {
        kind: 'create-google-doc-at-placement',
        placement: { kind: 'tree-end' }
      })
      .catch(props.onError);
  }

  function canCreateSavedOrganizer(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['create-saved-organizer'];
  }

  function canSaveCloseAllWindows(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['save-close-all-windows'];
  }

  async function saveCloseAllWindows(): Promise<void> {
    if (
      !(await confirmOperation(
        'Save and close all windows?',
        'Every browser window except this Browser Atlas window will be saved and closed.',
        'Save and close'
      ))
    ) {
      return;
    }
    await props.onCommand(selectedBackendId(), { kind: 'save-close-all-windows' }).catch(props.onError);
  }

  function canUndoTree(): boolean {
    return canUseUndoHistory() && selectedBackend().backend.undoHistory?.canUndo() === true;
  }

  function canUseUndoHistory(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['undo-persistent-tree'];
  }

  function undoTree(): void {
    void props.onCommand(selectedBackendId(), { kind: 'undo-persistent-tree' }).catch(props.onError);
  }

  function canRedoTree(): boolean {
    return canUseUndoHistory() && selectedBackend().backend.undoHistory?.canRedo() === true;
  }

  function redoTree(): void {
    void props.onCommand(selectedBackendId(), { kind: 'redo-persistent-tree' }).catch(props.onError);
  }

  function canBrowseDeletedItems(): boolean {
    return selectedSource() === 'explore' && canBackendBrowseDeletedItems(selectedBackend().backend);
  }

  function runDeleteCommand(command: ExplorerCommand): void {
    void props.onCommand(selectedBackendId(), command).catch(props.onError);
  }

  function canUseLocalSnapshots(): boolean {
    return selectedSource() === 'explore' && canBackendUseLocalSnapshots(selectedBackend().backend);
  }

  function createTreeSnapshot(): void {
    void props.onCommand(selectedBackendId(), { kind: 'create-tree-snapshot' }).catch(props.onError);
  }

  async function restoreLatestTreeSnapshot(): Promise<void> {
    if (
      !(await confirmOperation(
        'Restore latest local backup?',
        'The current saved tree will be replaced with the latest local snapshot.',
        'Restore',
        true
      ))
    ) {
      return;
    }
    await props.onCommand(selectedBackendId(), { kind: 'restore-latest-tree-snapshot' }).catch(props.onError);
  }

  function canUseCloudBackups(): boolean {
    return selectedSource() === 'explore' && canBackendUseCloudBackups(selectedBackend().backend);
  }

  function backupFromKeyboard(): void {
    if (selectedSource() === 'explore') {
      props.onBackup(selectedBackendId());
    }
  }

  function canUndoExpandAll(): boolean {
    return expandAllUndo()?.contextKey === expansionContextKey();
  }

  function toggleExpandAll(): void {
    const undo = expandAllUndo();
    if (undo?.contextKey === expansionContextKey()) {
      tree.restoreExpansion(undo.snapshot);
      setExpandAllUndo(null);
      return;
    }
    setExpandAllUndo({ contextKey: expansionContextKey(), snapshot: tree.expandAll() });
  }

  function expansionContextKey(): string {
    return `${selectedBackendId()}:${selectedSource()}`;
  }

  function canFocusCurrentWindow(): boolean {
    return selectedSource() === 'explore' && focusedWindowPath().length > 0;
  }

  function focusCurrentWindow(): void {
    revealFocusedWindow(true);
  }

  function revealFocusedWindow(focus: boolean): void {
    const path = focusedWindowPath();
    const focusedWindow = path.at(-1);
    if (!focusedWindow) {
      return;
    }
    for (const ancestor of path.slice(0, -1)) {
      ancestor.setExpanded(true);
    }
    requestAnimationFrame(() => {
      virtualTree.scrollTo(focusedWindow, { align: 'start' });
      if (focus) {
        navigation.focus(focusedWindow);
      }
    });
  }

  function revealBrowserWindow(windowId: string): void {
    setSelectedBackendId(props.primaryBackendId);
    setSelectedSource('explore');
    setPendingBrowserWindowReveal(windowId);
    const backend = props.backends.find((candidate) => candidate.id === props.primaryBackendId);
    backend?.sources.refresh('explore');
  }

  function browserWindowPath(windowId: string): readonly TreeViewItem<ExplorerTreeNode>[] {
    return findTreeItemPath(
      tree.children(),
      (item) =>
        item.item.kind === 'group' && item.item.reference.kind === 'window' && item.item.reference.id === windowId
    );
  }

  function focusedWindowPath(): readonly TreeViewItem<ExplorerTreeNode>[] {
    return findTreeItemPath(
      tree.children(),
      (item) => item.item.kind === 'group' && item.item.reference.kind === 'window' && item.item.reference.focused
    );
  }

  function insertOrganizerFromKeyboard(node: ExplorerTreeNode, request: TreeKeyboardOrganizerRequest): boolean {
    if (!canCreateSavedOrganizer() || node.kind === 'message') {
      return false;
    }
    const placement = organizerPlacementForNode(node, request.placement);
    if (placement) {
      createOrganizer(request.itemKind, placement);
      return true;
    }
    return false;
  }

  function moveItemFromKeyboard(node: ExplorerTreeNode, direction: TreeKeyboardMoveDirection): boolean {
    if (
      selectedSource() !== 'explore' ||
      node.kind === 'message' ||
      !selectedBackend().backend.capabilities.commands['reposition-persistent-item']
    ) {
      return false;
    }
    const path = findTreeItemPath(tree.children(), (candidate) => candidate.item.id === node.id);
    const item = persistentMoveSource(path, node, direction);
    if (!item) {
      return false;
    }
    const placement = persistentMovePlacement(path, direction);
    if (placement) {
      void props
        .onCommand(selectedBackendId(), { kind: 'reposition-persistent-item', item, placement })
        .catch(props.onError);
    }
    return true;
  }

  function flattenTabsFromKeyboard(node: ExplorerTreeNode): boolean {
    if (
      selectedSource() !== 'explore' ||
      node.kind === 'message' ||
      !selectedBackend().backend.capabilities.commands['flatten-persistent-tabs']
    ) {
      return false;
    }
    const item = findTreeItemPath(tree.children(), (candidate) => candidate.item.id === node.id).at(-1);
    const source = persistentMoveSourceForNode(node);
    if (!item || !source) {
      return false;
    }
    const items = [source, ...(!item.isExpanded ? nestedPersistentOrganizerReferences(item.children()) : [])];
    void props.onCommand(selectedBackendId(), { kind: 'flatten-persistent-tabs', items }).catch(props.onError);
    return true;
  }

  async function createOrganizer(
    itemKind: CreateSavedOrganizerCommand['itemKind'],
    requestedPlacement?: PersistentOrganizerPlacement
  ): Promise<void> {
    const selectedNode = navigation.selectedItem();
    const target =
      selectedNode && selectedNode.kind !== 'message' ? persistentTargetForNode(selectedNode) : ROOT_TARGET;
    const placement = requestedPlacement ?? { kind: 'inside', target, position: 'last' };
    const defaultValue = itemKind === 'group' ? 'New group' : itemKind === 'note' ? 'New note' : '';
    const requestedTitle =
      itemKind === 'separator' ? '' : await requestOperationText(`Create ${itemKind}`, defaultValue, 'Create');
    if (requestedTitle !== null) {
      const command = createSavedOrganizerCommand(itemKind, placement, requestedTitle);
      await props.onCommand(selectedBackendId(), command).catch(props.onError);
    }
  }

  function editInlineTabNote(node: Extract<ExplorerTreeNode, { kind: 'link' }>): void {
    const existingNote = node.children.find((child) => child.kind === 'link' && child.reference.kind === 'saved-note');
    if (existingNote?.kind === 'link') {
      handleNodeAction(existingNote);
      return;
    }
    createOrganizer('note', {
      kind: 'inside',
      target: persistentTargetForNode(node),
      position: 'first'
    });
  }

  async function exportDocument(): Promise<void> {
    try {
      const binding = selectedBackend();
      const document =
        binding.kind === 'document'
          ? binding.document.readDocument()
          : await createExplorerDocumentSnapshot(binding.backend, binding.label());
      downloadExplorerDocument(document);
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  async function exportSource(): Promise<void> {
    try {
      const binding = selectedBackend();
      const source = selectedSource();
      const root = binding.sources.tree(source) ?? (await binding.backend.load(source));
      downloadExplorerSourceText(binding.label(), source, portableChildren(root));
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  async function openFile(file: File): Promise<void> {
    try {
      const document = await readExplorerFile(file);
      props.onOpenDocument(document, file.name);
      if (document.sources[selectedSource()].length === 0) {
        const populatedSource = EXPLORER_SOURCES.find((source) => document.sources[source.id].length > 0);
        if (populatedSource) {
          setSelectedSource(populatedSource.id);
        }
      }
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  function handleFileInputChange(event: Event & { currentTarget: HTMLInputElement }): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) {
      void openFile(file);
    }
  }

  function handleFileDragOver(event: DragEvent & { currentTarget: HTMLDivElement }): void {
    if ([...(event.dataTransfer?.types ?? [])].includes('Files')) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
    }
  }

  function handlePaneDragEnter(event: PaneDragEvent): void {
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDragEnter(event);
    }
  }

  function handlePaneDragOver(event: PaneDragEvent): void {
    if ([...(event.dataTransfer?.types ?? [])].includes('Files')) {
      handleFileDragOver(event);
      return;
    }
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDragOver(event);
    }
  }

  function handlePaneDragLeave(event: PaneDragEvent): void {
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDragLeave(event);
    }
  }

  function handlePaneDrop(event: PaneDragEvent): void {
    const file = event.dataTransfer?.files[0];
    if (file) {
      event.preventDefault();
      event.stopPropagation();
      void openFile(file);
      return;
    }
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDrop(event);
    }
  }

  function handleRowContextMenu(
    event: MouseEvent & { currentTarget: HTMLDivElement },
    item: TreeViewItem<ExplorerTreeNode>
  ): void {
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // As in file managers, a right-click inside a multi-row selection acts on the whole selection.
    const multiple = selection.isSelected(item) && selection.selectedItems().length > 1;
    navigation.focus(item, multiple ? 'keep' : 'replace');
    setContextMenu({
      x: Math.max(0, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH)),
      y: Math.max(0, Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_MIN_VISIBLE_HEIGHT)),
      item,
      multiple
    });
  }

  function handleClipboardCopy(event: ClipboardEvent): void {
    writeSelectedNodeToClipboard(event);
  }

  function handleClipboardCut(event: ClipboardEvent): void {
    const nodes = selectedHierarchies();
    const deletions = cutDeletions(nodes);
    if (!deletions || !writeSelectedNodeToClipboard(event)) {
      return;
    }
    navigation.clearSelection();
    runDeleteCommand(batchExplorerCommands(deletions));
  }

  function writeSelectedNodeToClipboard(event: ClipboardEvent): boolean {
    const portableNodes = selectedHierarchies().flatMap((node) => createPortableExplorerNode(node) ?? []);
    const clipboardData = event.clipboardData;
    if (portableNodes.length === 0 || !clipboardData) {
      return false;
    }
    if (!writeExplorerClipboard(clipboardData, portableNodes)) {
      return false;
    }
    rememberClipboardItems(portableNodes);
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  /** Selected hierarchies in document order, without rows already inside a selected hierarchy. */
  function selectedHierarchies(): Exclude<ExplorerTreeNode, { kind: 'message' }>[] {
    return selection.selectedRoots().flatMap(({ item }) => (item.kind === 'message' ? [] : [item]));
  }

  /** Commands removing complete cut hierarchies, or undefined when any of them cannot be removed. */
  function cutDeletions(
    nodes: readonly Exclude<ExplorerTreeNode, { kind: 'message' }>[]
  ): Extract<ExplorerCommand, { kind: 'delete-tree-item' }>[] | undefined {
    const targets = nodes.map(deleteTargetForNode);
    if (
      targets.length === 0 ||
      !selectedBackend().backend.capabilities.commands['delete-tree-item'] ||
      targets.some((target) => target === undefined)
    ) {
      return undefined;
    }
    return targets.flatMap((target) =>
      target ? [{ kind: 'delete-tree-item' as const, target, mode: 'subtree' as const }] : []
    );
  }

  function handleClipboardPaste(event: ClipboardEvent): void {
    const node = navigation.selectedItem();
    const clipboardData = event.clipboardData;
    if (!node || !clipboardData) {
      return;
    }
    const items = readExplorerClipboard(clipboardData);
    if (!importClipboardItems(node, items)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function rememberClipboardItems(items: readonly PortableExplorerNode[]): void {
    props.clipboard.write({ items, plainText: serializeClipboardText(items) });
  }

  function contextMenuSections(item: TreeViewItem<ExplorerTreeNode>): readonly ExplorerContextMenuSection[] {
    const node = item.item;
    if (node.kind === 'message') {
      return [];
    }

    const clipboardActions: ExplorerContextMenuAction[] = [];
    if (createPortableExplorerNode(node)) {
      clipboardActions.push({ label: 'Copy hierarchy', shortcut: 'Ctrl/Cmd+C', run: () => copyNodes([node]) });
    }
    if (deleteTargetForNode(node) && selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      clipboardActions.push({ label: 'Cut hierarchy', shortcut: 'Ctrl/Cmd+X', run: () => cutNodes([node]) });
    }
    if (
      selectedBackend().backend.capabilities.commands['import-items'] &&
      clipboardImportTarget(node, selectedBackend())
    ) {
      clipboardActions.push({
        label: 'Paste as last child',
        shortcut: 'Ctrl/Cmd+V',
        run: () => void pasteContextNode(node)
      });
    }

    const generalActions: ExplorerContextMenuAction[] = [];
    if (item.childCount > 0) {
      generalActions.push({
        label: item.isExpanded ? 'Collapse hierarchy' : 'Expand hierarchy',
        shortcut: '+ / −',
        run: () => item.toggle()
      });
    }
    const primaryAction = contextPrimaryAction(item);
    if (primaryAction) {
      generalActions.push(primaryAction);
    }
    if (node.reference.kind === 'saved-window') {
      generalActions.push({
        label: 'Restore last saved session',
        shortcut: 'Alt+Space / Alt+Double click',
        run: () => void activateNode(node, true)
      });
    }
    if (node.reference.kind === 'tab') {
      generalActions.push({ label: 'Activate tab', shortcut: 'Space', run: () => void activateNode(node) });
    }
    if (
      node.reference.kind === 'window' ||
      node.reference.kind === 'saved-window' ||
      node.reference.kind === 'saved-group'
    ) {
      generalActions.push({
        label: node.reference.kind === 'saved-group' ? 'Edit group title' : 'Edit window title',
        shortcut: 'F2',
        run: () => void editPersistentItemTitle(node)
      });
    }
    if (node.kind === 'link' && (node.reference.kind === 'tab' || node.reference.kind === 'saved-tab')) {
      generalActions.push({
        label: node.children.some((child) => child.kind === 'link' && child.reference.kind === 'saved-note')
          ? 'Edit inline note'
          : 'Add inline note',
        shortcut: 'F2',
        run: () => editInlineTabNote(node)
      });
    }
    const deleteTarget = deleteTargetForNode(node);
    if (deleteTarget && selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      const deleteMode = persistentDeleteMode(deleteTarget, item);
      generalActions.push({
        label: deleteMode === 'promote-children' ? 'Delete node; keep children' : 'Delete hierarchy',
        shortcut: 'Delete',
        run: () => handleNodeDelete(node, item)
      });
    }

    const organizerActions = canCreateSavedOrganizer() ? createContextOrganizerActions(node) : [];
    const moveActions = createContextMoveActions(item);
    const utilityActions = createContextUtilityActions(item);
    const globalActions = createContextGlobalActions();
    return [
      { label: 'Clipboard', actions: clipboardActions },
      { label: 'General', actions: generalActions },
      { label: 'Notes and organizers', actions: organizerActions },
      { label: 'Move hierarchy', actions: moveActions },
      { label: 'Utilities', actions: utilityActions },
      { label: 'Global', actions: globalActions }
    ].filter((section) => section.actions.length > 0);
  }

  /** Commands for a right-click inside a multi-row selection; each acts on every selected row. */
  function selectionContextMenuSections(): readonly ExplorerContextMenuSection[] {
    const nodes = selection.selectedItems().flatMap(({ item }) => (item.kind === 'message' ? [] : [item]));
    const hierarchies = selectedHierarchies();
    const clipboardActions: ExplorerContextMenuAction[] = [];
    if (hierarchies.some((node) => createPortableExplorerNode(node))) {
      clipboardActions.push({
        label: `Copy ${hierarchies.length} hierarchies`,
        shortcut: 'Ctrl/Cmd+C',
        run: () => copyNodes(hierarchies)
      });
    }
    if (cutDeletions(hierarchies)) {
      clipboardActions.push({
        label: `Cut ${hierarchies.length} hierarchies`,
        shortcut: 'Ctrl/Cmd+X',
        run: () => cutNodes(hierarchies)
      });
    }

    const generalActions: ExplorerContextMenuAction[] = [];
    const closableCount = nodes.filter(
      (node) => node.reference.kind === 'tab' || node.reference.kind === 'window'
    ).length;
    if (closableCount > 0) {
      generalActions.push({
        label: `Save & Close ${closableCount} items`,
        shortcut: 'Backspace',
        run: () => saveCloseNodes(nodes)
      });
    }
    const deletableCount = nodes.filter((node) => deleteTargetForNode(node)).length;
    if (deletableCount > 0 && selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      generalActions.push({
        label: `Delete ${deletableCount} items`,
        shortcut: 'Delete',
        run: () => deleteNodes(nodes)
      });
    }

    return [
      { label: 'Clipboard', actions: clipboardActions },
      { label: 'General', actions: generalActions },
      { label: 'Global', actions: createContextGlobalActions() }
    ].filter((section) => section.actions.length > 0);
  }

  function createContextGlobalActions(): ExplorerContextMenuAction[] {
    return [
      ...(canUndoTree() ? [{ label: 'Undo tree change', shortcut: 'Ctrl/Cmd+Z', run: undoTree }] : []),
      ...(canRedoTree() ? [{ label: 'Redo tree change', shortcut: 'Ctrl/Cmd+Shift+Z', run: redoTree }] : []),
      { label: 'Scroll up to previous open window', shortcut: 'W', run: scrollToPreviousOpenWindow },
      { label: 'Undo tree scroll', shortcut: 'S', run: undoScroll },
      { label: 'Clone view into new explorer', shortcut: 'C', run: cloneView },
      { label: 'Find visible nodes', shortcut: 'Ctrl/Cmd+F', run: openSearch },
      { label: 'Print visible tree', shortcut: 'Ctrl/Cmd+P', run: printVisibleTree },
      { label: 'Export visible tree as HTML', shortcut: 'Ctrl/Cmd+S', run: exportVisibleHtml }
    ];
  }

  function contextPrimaryAction(item: TreeViewItem<ExplorerTreeNode>): ExplorerContextMenuAction | undefined {
    const node = item.item;
    if (node.kind === 'message') {
      return undefined;
    }
    switch (node.reference.kind) {
      case 'tab':
      case 'window':
        return {
          label: item.childCount > 0 && !item.isExpanded ? 'Save & Close hierarchy' : 'Save & Close',
          shortcut: 'Backspace',
          run: () => handleNodeAction(node, item)
        };
      case 'saved-tab':
        return { label: 'Restore tab', shortcut: 'Space', run: () => void activateNode(node) };
      case 'saved-window':
        return { label: 'Restore window', shortcut: 'Space', run: () => handleNodeAction(node) };
      case 'saved-group':
        return { label: 'Open group as window', shortcut: 'Space', run: () => void activateNode(node) };
      case 'saved-note':
        return { label: 'Edit title', shortcut: 'F2', run: () => handleNodeAction(node) };
      case 'saved-separator':
        return { label: 'Change separator style', run: () => handleNodeAction(node) };
      default:
        return undefined;
    }
  }

  function createContextOrganizerActions(
    node: Exclude<ExplorerTreeNode, { kind: 'message' }>
  ): ExplorerContextMenuAction[] {
    const requests = [
      { label: 'Note as parent', shortcut: 'Shift+Insert', itemKind: 'note', placement: 'parent' },
      { label: 'Note as first child', shortcut: 'Alt+Insert', itemKind: 'note', placement: 'first-child' },
      { label: 'Note as last child', shortcut: 'Insert', itemKind: 'note', placement: 'last-child' },
      { label: 'Note above', shortcut: 'Shift+Enter', itemKind: 'note', placement: 'before' },
      { label: 'Note below', shortcut: 'Enter', itemKind: 'note', placement: 'after' },
      { label: 'Note at tree end', shortcut: 'Alt+Enter', itemKind: 'note', placement: 'tree-end' },
      { label: 'Group above', shortcut: 'Shift+G', itemKind: 'group', placement: 'before' },
      { label: 'Separator below', shortcut: 'L', itemKind: 'separator', placement: 'after' }
    ] as const satisfies readonly (ExplorerContextMenuActionLabel & TreeKeyboardOrganizerRequest)[];

    return requests.flatMap((request) =>
      organizerPlacementForNode(node, request.placement)
        ? [{ label: request.label, shortcut: request.shortcut, run: () => insertOrganizerFromKeyboard(node, request) }]
        : []
    );
  }

  function createContextMoveActions(item: TreeViewItem<ExplorerTreeNode>): ExplorerContextMenuAction[] {
    const node = item.item;
    if (
      node.kind === 'message' ||
      !persistentMoveSourceForNode(node) ||
      !selectedBackend().backend.capabilities.commands['reposition-persistent-item']
    ) {
      return [];
    }
    const path = findTreeItemPath(tree.children(), (candidate) => candidate.id === item.id);
    const requests = [
      { label: 'Indent under previous sibling', shortcut: 'Tab', direction: 'indent' },
      { label: 'Move one level out', shortcut: 'Shift+Tab', direction: 'outdent' },
      { label: 'Move up', shortcut: 'Ctrl/Cmd+↑', direction: 'up' },
      { label: 'Move down', shortcut: 'Ctrl/Cmd+↓', direction: 'down' },
      { label: 'Move to first position', shortcut: 'Ctrl/Cmd+Home', direction: 'first' },
      { label: 'Move to last position', shortcut: 'Ctrl/Cmd+End', direction: 'last' }
    ] as const satisfies readonly (ExplorerContextMenuActionLabel & { direction: TreeKeyboardMoveDirection })[];
    return requests.flatMap((request) =>
      persistentMovePlacement(path, request.direction)
        ? [
            {
              label: request.label,
              shortcut: request.shortcut,
              run: () => moveItemFromKeyboard(node, request.direction)
            }
          ]
        : []
    );
  }

  function createContextUtilityActions(item: TreeViewItem<ExplorerTreeNode>): ExplorerContextMenuAction[] {
    const node = item.item;
    if (node.kind === 'message' || !selectedBackend().backend.capabilities.commands['reposition-persistent-item']) {
      return [];
    }
    const path = findTreeItemPath(tree.children(), (candidate) => candidate.id === item.id);
    const actions: ExplorerContextMenuAction[] = [];
    if (node.kind === 'link' && node.url && selectedBackend().backend.capabilities.commands['open-link']) {
      actions.push(
        {
          label: 'Open link in new window',
          shortcut: 'Shift+Click',
          run: () => void openLinkWithoutRestoring(node, 'new-window')
        },
        {
          label: 'Open link in last window',
          shortcut: 'Ctrl/Cmd+Click',
          run: () => void openLinkWithoutRestoring(node, 'last-focused-window')
        }
      );
    }
    if (
      persistentMoveSourceForNode(node) &&
      selectedBackend().backend.capabilities.commands['flatten-persistent-tabs']
    ) {
      actions.push({ label: 'Flatten tabs hierarchy', shortcut: '/', run: () => flattenTabsFromKeyboard(node) });
    }
    if (persistentMoveSource(path, node, 'tree-end')) {
      actions.push({
        label: 'Move containing window/group to tree end',
        shortcut: 'E',
        run: () => moveItemFromKeyboard(node, 'tree-end')
      });
    }
    return actions;
  }

  function copyNodes(nodes: readonly Exclude<ExplorerTreeNode, { kind: 'message' }>[]): void {
    const portableNodes = nodes.flatMap((node) => createPortableExplorerNode(node) ?? []);
    if (portableNodes.length === 0) {
      return;
    }
    rememberClipboardItems(portableNodes);
    void writeSystemClipboardText(serializeClipboardText(portableNodes)).catch(() => undefined);
  }

  function cutNodes(nodes: readonly Exclude<ExplorerTreeNode, { kind: 'message' }>[]): void {
    const deletions = cutDeletions(nodes);
    const portableNodes = nodes.flatMap((node) => createPortableExplorerNode(node) ?? []);
    if (!deletions || portableNodes.length !== nodes.length) {
      return;
    }
    rememberClipboardItems(portableNodes);
    void writeSystemClipboardText(serializeClipboardText(portableNodes)).catch(() => undefined);
    navigation.clearSelection();
    runDeleteCommand(batchExplorerCommands(deletions));
  }

  async function pasteContextNode(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): Promise<void> {
    try {
      const memory = props.clipboard.read();
      const systemText = await readSystemClipboardText().catch(() => undefined);
      const items =
        memory && (systemText === undefined || systemText === memory.plainText)
          ? memory.items
          : systemText === undefined
            ? []
            : readExplorerClipboard(createPlainTextClipboardData(systemText));
      importClipboardItems(node, items);
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  function importClipboardItems(node: ExplorerTreeNode, items: readonly PortableExplorerNode[]): boolean {
    if (items.length === 0 || !selectedBackend().backend.capabilities.commands['import-items']) {
      return false;
    }
    const target = clipboardImportTarget(node, selectedBackend());
    if (!target) {
      return false;
    }
    void props
      .onCommand(selectedBackendId(), { kind: 'import-items', target, index: nodeChildCount(node), items: [...items] })
      .catch(props.onError);
    return true;
  }

  function UnavailableTreeStatus() {
    const error = () => selectedBackend().sources.error(selectedSource());
    return (
      <Show when={error()} fallback={<TreeStatus>Loading data…</TreeStatus>}>
        {(reason) => <TreeStatus tone="error">{formatError(reason())}</TreeStatus>}
      </Show>
    );
  }
}

type ExplorerContextMenuState = Readonly<{
  x: number;
  y: number;
  item: TreeViewItem<ExplorerTreeNode>;
  /** Whether the menu acts on the whole multi-row selection instead of the clicked row alone. */
  multiple: boolean;
}>;

type ExplorerPrintDocument = Readonly<{
  title: string;
  rows: readonly ExplorerHtmlRow[];
}>;

/** Browser Atlas-owned replacement for blocking browser confirm and prompt dialogs. */
function ExplorerOperationDialog(props: {
  state: ExplorerOperationDialogState;
  onCancel: () => void;
  onConfirm: (value: string | boolean) => void;
}) {
  let input: HTMLInputElement | undefined;

  return (
    <div
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 print:hidden"
      data-browser-atlas-operation-dialog
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <form
        class="w-full max-w-sm rounded-md border border-neutral-600 bg-neutral-900 p-4 text-neutral-100 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={props.state.title}
        onSubmit={(event) => {
          event.preventDefault();
          props.onConfirm(props.state.kind === 'prompt' ? (input?.value ?? '') : true);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onCancel();
          }
        }}
      >
        <h2 class="text-sm font-semibold">{props.state.title}</h2>
        <Show when={props.state.kind === 'confirm'}>
          <p class="mt-2 text-xs leading-5 text-neutral-300">
            {(props.state as Extract<ExplorerOperationDialogState, { kind: 'confirm' }>).message}
          </p>
        </Show>
        <Show when={props.state.kind === 'prompt'}>
          <input
            ref={(element) => {
              input = element;
              queueMicrotask(() => {
                element.focus();
                element.select();
              });
            }}
            class="mt-3 h-8 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm outline-none focus:border-blue-500"
            aria-label="Name"
            value={(props.state as Extract<ExplorerOperationDialogState, { kind: 'prompt' }>).initialValue}
          />
        </Show>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="h-8 rounded px-3 text-xs text-neutral-300 hover:bg-neutral-800"
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            class={[
              'h-8 rounded px-3 text-xs font-medium text-white',
              {
                'bg-red-700 hover:bg-red-600': props.state.kind === 'confirm' && props.state.danger,
                'bg-blue-700 hover:bg-blue-600': props.state.kind === 'prompt' || !props.state.danger
              }
            ]}
          >
            {props.state.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Renders every visible model row for printing, independent of tree virtualization. */
function ExplorerPrintView(props: ExplorerPrintDocument) {
  return (
    <article
      class="fixed inset-0 z-[100] hidden overflow-visible bg-white p-8 text-black print:static print:block"
      data-browser-atlas-print
    >
      <h1 class="mb-4 text-xl font-semibold">{props.title}</h1>
      <ol class="m-0 list-none p-0">
        <For each={props.rows}>
          {(row) => (
            <li class="my-1" style={{ 'padding-left': `${Math.max(0, row.depth) * 20}px` }}>
              <Show when={row.url} fallback={<span>{row.title}</span>}>
                {(url) => <a href={url()}>{row.title}</a>}
              </Show>
              <Show when={row.description}>
                <small class="block text-xs text-neutral-600">{row.description}</small>
              </Show>
            </li>
          )}
        </For>
      </ol>
    </article>
  );
}

type ExplorerContextMenuAction = Readonly<{
  label: string;
  shortcut?: string;
  run: () => void;
}>;

type ExplorerContextMenuActionLabel = Readonly<{
  label: string;
  shortcut: string;
}>;

type ExplorerContextMenuSection = Readonly<{
  label: string;
  actions: readonly ExplorerContextMenuAction[];
}>;

/** Renders the keyboard-equivalent commands available for one tree row. */
function ExplorerContextMenu(props: {
  x: number;
  y: number;
  sections: readonly ExplorerContextMenuSection[];
  onClose: () => void;
}) {
  const [position, setPosition] = createSignal({ x: props.x, y: props.y });

  return (
    <>
      <button
        type="button"
        class="fixed inset-0 z-40 cursor-default bg-transparent"
        aria-label="Close tree commands"
        onClick={props.onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onClose();
        }}
      />
      <div
        ref={positionMenu}
        class="fixed z-50 max-h-[calc(100vh-1rem)] w-[17.5rem] overflow-y-auto rounded border border-neutral-600 bg-neutral-900 py-1 text-xs text-neutral-100 shadow-2xl outline-none"
        style={{ left: `${position().x}px`, top: `${position().y}px` }}
        role="menu"
        aria-label="Tree commands"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onClose();
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <For each={props.sections}>
          {(section, sectionIndex) => (
            <section class={['py-1', { 'border-t border-neutral-700': sectionIndex() > 0 }]} aria-label={section.label}>
              <h2 class="px-3 py-1 text-[0.65rem] font-semibold tracking-wide text-neutral-500 uppercase">
                {section.label}
              </h2>
              <For each={section.actions}>
                {(action) => (
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-blue-700 focus:bg-blue-700 focus:outline-none"
                    role="menuitem"
                    onClick={() => {
                      props.onClose();
                      action.run();
                    }}
                  >
                    <span>{action.label}</span>
                    <Show when={action.shortcut}>
                      {(shortcut) => <kbd class="text-[0.65rem] whitespace-nowrap text-neutral-400">{shortcut()}</kbd>}
                    </Show>
                  </button>
                )}
              </For>
            </section>
          )}
        </For>
      </div>
    </>
  );

  function positionMenu(element: HTMLDivElement): void {
    queueMicrotask(() => {
      const bounds = element.getBoundingClientRect();
      setPosition({
        x: Math.max(
          CONTEXT_MENU_VIEWPORT_GAP,
          Math.min(props.x, window.innerWidth - bounds.width - CONTEXT_MENU_VIEWPORT_GAP)
        ),
        y: Math.max(
          CONTEXT_MENU_VIEWPORT_GAP,
          Math.min(props.y, window.innerHeight - bounds.height - CONTEXT_MENU_VIEWPORT_GAP)
        )
      });
      element.focus();
    });
  }
}

type ClipboardTextApi = Readonly<{
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
}>;

async function readSystemClipboardText(): Promise<string> {
  const clipboard = systemClipboardTextApi();
  if (!clipboard) {
    throw new Error('The browser does not expose text clipboard access.');
  }
  return clipboard.readText();
}

async function writeSystemClipboardText(text: string): Promise<void> {
  const clipboard = systemClipboardTextApi();
  if (!clipboard) {
    throw new Error('The browser does not expose text clipboard access.');
  }
  await clipboard.writeText(text);
}

function systemClipboardTextApi(): ClipboardTextApi | undefined {
  const value: unknown = Reflect.get(navigator, 'clipboard');
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'readText') !== 'function' ||
    typeof Reflect.get(value, 'writeText') !== 'function'
  ) {
    return undefined;
  }
  return value as ClipboardTextApi;
}

function createPlainTextClipboardData(text: string) {
  return {
    getData(format: string): string {
      return format === 'text/plain' ? text : '';
    },
    setData(): void {
      // This adapter is read-only; parsing only calls getData.
    }
  };
}

function explorerNodeSearchText(node: ExplorerTreeNode): string {
  if (node.kind === 'message') {
    return node.title.toLocaleLowerCase();
  }
  return [node.title, node.kind === 'link' ? node.url : '', node.kind === 'link' ? node.description : '']
    .join('\n')
    .toLocaleLowerCase();
}

function createExplorerCollapsedSummary(node: ExplorerTreeNode): TreeCollapsedSummary {
  const statistics = countExplorerDescendants(node);
  const segments: TreeCollapsedSummary['segments'][number][] = [];
  if (statistics.nodes !== statistics.liveTabs) {
    segments.push({ text: String(statistics.nodes), title: `${statistics.nodes} hidden nodes` });
  }
  if (statistics.liveWindows > 0) {
    segments.push({ text: `▣${statistics.liveWindows}`, title: `${statistics.liveWindows} live windows` });
  }
  if (statistics.liveTabs > 0) {
    segments.push({ text: `●${statistics.liveTabs}`, title: `${statistics.liveTabs} live tabs` });
  }
  return {
    accessibleLabel: `Hidden: ${statistics.nodes} nodes, ${statistics.liveWindows} live windows, ${statistics.liveTabs} live tabs`,
    segments
  };
}

type ExplorerDescendantStatistics = Readonly<{
  nodes: number;
  liveWindows: number;
  liveTabs: number;
}>;

function countExplorerDescendants(node: ExplorerTreeNode): ExplorerDescendantStatistics {
  if (node.kind === 'message') {
    return EMPTY_EXPLORER_DESCENDANT_STATISTICS;
  }
  return node.children.reduce<ExplorerDescendantStatistics>((statistics, child) => {
    const descendants = countExplorerDescendants(child);
    return {
      nodes: statistics.nodes + 1 + descendants.nodes,
      liveWindows:
        statistics.liveWindows +
        descendants.liveWindows +
        (child.kind === 'group' && child.reference.kind === 'window' ? 1 : 0),
      liveTabs:
        statistics.liveTabs + descendants.liveTabs + (child.kind === 'link' && child.reference.kind === 'tab' ? 1 : 0)
    };
  }, EMPTY_EXPLORER_DESCENDANT_STATISTICS);
}

const EMPTY_EXPLORER_DESCENDANT_STATISTICS = {
  nodes: 0,
  liveWindows: 0,
  liveTabs: 0
} as const satisfies ExplorerDescendantStatistics;

function findFocusedExplorerWindowId(node: ExplorerTreeNode): string | null {
  if (node.kind === 'group' && node.reference.kind === 'window' && node.reference.focused) {
    return node.reference.id;
  }
  if (node.kind === 'message') {
    return null;
  }
  for (const child of node.children) {
    const focusedId = findFocusedExplorerWindowId(child);
    if (focusedId !== null) {
      return focusedId;
    }
  }
  return null;
}

function consumeKeyboardShortcut(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

type ExpandAllUndo = Readonly<{
  contextKey: string;
  snapshot: TreeExpansionSnapshot;
}>;

type CreateSavedOrganizerCommand = Extract<ExplorerCommand, { kind: 'create-saved-organizer' }>;
type SavedOrganizerDraft = Pick<CreateSavedOrganizerCommand, 'itemKind' | 'title' | 'separatorStyle'>;

function createDefaultSavedOrganizerCommand(
  itemKind: ExplorerOrganizerKind,
  placement: PersistentOrganizerPlacement
): CreateSavedOrganizerCommand {
  return createSavedOrganizerCommand(
    itemKind,
    placement,
    itemKind === 'group' ? 'New group' : itemKind === 'note' ? 'New note' : ''
  );
}

function createSavedOrganizerCommand(
  itemKind: ExplorerOrganizerKind,
  placement: PersistentOrganizerPlacement,
  title: string
): CreateSavedOrganizerCommand {
  return { kind: 'create-saved-organizer', ...resolveSavedOrganizerDraft(itemKind, title.trim()), placement };
}

function resolveSavedOrganizerDraft(
  requestedKind: CreateSavedOrganizerCommand['itemKind'],
  requestedTitle: string
): SavedOrganizerDraft {
  if (requestedKind !== 'note') {
    return { itemKind: requestedKind, title: requestedTitle, separatorStyle: 0 };
  }
  const groupTitle = /^2g\s+(.+)$/iu.exec(requestedTitle)?.[1]?.trim();
  if (groupTitle) {
    return { itemKind: 'group', title: groupTitle, separatorStyle: 0 };
  }
  if (/^-{3,}$/u.test(requestedTitle)) {
    return { itemKind: 'separator', title: '', separatorStyle: 0 };
  }
  if (/^={3,}$/u.test(requestedTitle)) {
    return { itemKind: 'separator', title: '', separatorStyle: 1 };
  }
  if (/^\.{3,}$/u.test(requestedTitle)) {
    return { itemKind: 'separator', title: '', separatorStyle: 2 };
  }
  return { itemKind: 'note', title: requestedTitle, separatorStyle: 0 };
}

function createNodeActionCommand(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
  includeDescendants = false
): ExplorerBatchableCommand | undefined {
  switch (node.reference.kind) {
    case 'tab':
      return { kind: 'save-close-tab', tabId: node.reference.id, includeDescendants };
    case 'window':
      return { kind: 'save-close-window', windowId: node.reference.id, includeDescendants };
    case 'saved-tab':
      return { kind: 'restore-saved-tab', savedTabId: node.reference.id };
    case 'saved-window':
      return { kind: 'restore-saved-window', savedWindowId: node.reference.id };
    case 'saved-group':
    case 'saved-note':
      return undefined;
    case 'saved-separator':
      return { kind: 'cycle-saved-separator', itemId: node.reference.id };
    default:
      return undefined;
  }
}

function savedOrganizerId(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): string | undefined {
  switch (node.reference.kind) {
    case 'saved-group':
    case 'saved-note':
    case 'saved-separator':
      return node.reference.id;
    default:
      return undefined;
  }
}

function persistentTargetForNode(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): PersistentItemTarget {
  switch (node.reference.kind) {
    case 'tab':
      return { kind: 'live-tab', tabId: node.reference.id, windowId: node.reference.windowId };
    case 'window':
      return { kind: 'live-window', windowId: node.reference.id };
    case 'saved-tab':
    case 'saved-window':
    case 'saved-group':
    case 'saved-note':
    case 'saved-separator':
      return { kind: 'saved', id: node.reference.id };
    default:
      return ROOT_TARGET;
  }
}

function organizerPlacementForNode(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
  placement: TreeKeyboardOrganizerRequest['placement']
): PersistentOrganizerPlacement | undefined {
  if (placement === 'tree-end') {
    return { kind: 'tree-end' };
  }
  const target = persistentTargetForNode(node);
  if (placement === 'first-child' || placement === 'last-child') {
    return {
      kind: 'inside',
      target,
      position: placement === 'first-child' ? 'first' : 'last'
    };
  }
  const reference = persistentItemReference(target);
  if (!reference) {
    return undefined;
  }
  if (placement === 'parent') {
    return { kind: 'parent', target: reference };
  }
  return { kind: 'sibling', target: reference, position: placement };
}

function persistentItemReference(target: PersistentItemTarget): PersistentItemReference | undefined {
  return target.kind === 'root' ? undefined : target;
}

function persistentMoveSourceForNode(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>
): PersistentItemReference | undefined {
  switch (node.reference.kind) {
    case 'tab':
      return { kind: 'live-tab', tabId: node.reference.id, windowId: node.reference.windowId };
    case 'window':
      return { kind: 'live-window', windowId: node.reference.id };
    case 'saved-tab':
    case 'saved-window':
    case 'saved-group':
    case 'saved-note':
    case 'saved-separator':
      return { kind: 'saved', id: node.reference.id };
    default:
      return undefined;
  }
}

function persistentMoveSource(
  path: readonly TreeViewItem<ExplorerTreeNode>[],
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
  direction: TreeKeyboardMoveDirection
): PersistentItemReference | undefined {
  if (direction !== 'tree-end') {
    return persistentMoveSourceForNode(node);
  }
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const candidate = path[index]?.item;
    if (!candidate || candidate.kind === 'message') {
      continue;
    }
    switch (candidate.reference.kind) {
      case 'window':
      case 'saved-window':
      case 'saved-group':
        return persistentMoveSourceForNode(candidate);
      default:
        break;
    }
  }
  return undefined;
}

function nestedPersistentOrganizerReferences(
  items: readonly TreeViewItem<ExplorerTreeNode>[]
): PersistentItemReference[] {
  return items.flatMap((item): PersistentItemReference[] => {
    const node = item.item;
    const ownReference =
      node.kind !== 'message' &&
      (node.reference.kind === 'window' ||
        node.reference.kind === 'saved-window' ||
        node.reference.kind === 'saved-group')
        ? persistentMoveSourceForNode(node)
        : undefined;
    return [...(ownReference ? [ownReference] : []), ...nestedPersistentOrganizerReferences(item.children())];
  });
}

function persistentMovePlacement(
  path: readonly TreeViewItem<ExplorerTreeNode>[],
  direction: TreeKeyboardMoveDirection
): PersistentMovePlacement | undefined {
  if (direction === 'tree-end') {
    return { kind: 'tree-end' };
  }
  const item = path.at(-1);
  const parent = path.at(-2);
  if (!item || !parent || item.item.kind === 'message' || parent.item.kind === 'message') {
    return undefined;
  }
  const siblings = parent.children();
  const index = siblings.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) {
    return undefined;
  }

  switch (direction) {
    case 'indent': {
      const previousSibling = siblings[index - 1];
      const target = previousSibling && persistentReferenceForTreeItem(previousSibling);
      return target ? { kind: 'inside', target, position: 'last' } : undefined;
    }
    case 'outdent': {
      const target = persistentReferenceForTreeItem(parent);
      return target ? { kind: 'sibling', target, position: 'after' } : undefined;
    }
    case 'up': {
      const anchor = siblings[index - 1] ?? parent;
      const target = persistentReferenceForTreeItem(anchor);
      return target ? { kind: 'sibling', target, position: 'before' } : undefined;
    }
    case 'down': {
      const anchor = findNextSiblingOrAncestorSibling(path);
      const target = anchor && persistentReferenceForTreeItem(anchor);
      return target ? { kind: 'sibling', target, position: 'after' } : undefined;
    }
    case 'first':
      return index === 0
        ? undefined
        : { kind: 'inside', target: persistentTargetForNode(parent.item), position: 'first' };
    case 'last':
      return index === siblings.length - 1
        ? undefined
        : { kind: 'inside', target: persistentTargetForNode(parent.item), position: 'last' };
    default: {
      const exhaustiveDirection: never = direction;
      return exhaustiveDirection;
    }
  }
}

function persistentReferenceForTreeItem(item: TreeViewItem<ExplorerTreeNode>): PersistentItemReference | undefined {
  return item.item.kind === 'message' ? undefined : persistentItemReference(persistentTargetForNode(item.item));
}

function findNextSiblingOrAncestorSibling(
  path: readonly TreeViewItem<ExplorerTreeNode>[]
): TreeViewItem<ExplorerTreeNode> | undefined {
  for (let level = path.length - 1; level > 0; level -= 1) {
    const current = path[level];
    const parent = path[level - 1];
    if (!current || !parent) {
      continue;
    }
    const siblings = parent.children();
    const index = siblings.findIndex((candidate) => candidate.id === current.id);
    const nextSibling = siblings[index + 1];
    if (nextSibling) {
      return nextSibling;
    }
  }
  return undefined;
}

function clipboardImportTarget(
  node: ExplorerTreeNode,
  binding: ExplorerBackendBinding
): ExplorerImportTarget | undefined {
  if (node.kind === 'message') {
    return undefined;
  }
  if (node.kind === 'group') {
    switch (node.reference.kind) {
      case 'source':
        if (binding.kind === 'document') {
          return { kind: 'document', source: node.source, parentId: null };
        }
        if (node.source === 'explore') {
          return { kind: 'persistent', target: ROOT_TARGET };
        }
        return binding.backend.capabilities.commands['move-document-node']
          ? { kind: 'document', source: node.source, parentId: null }
          : undefined;
      case 'window':
        return { kind: 'persistent', target: { kind: 'live-window', windowId: node.reference.id } };
      case 'saved-items':
        return { kind: 'persistent', target: ROOT_TARGET };
      case 'saved-window':
      case 'saved-group':
        return { kind: 'persistent', target: { kind: 'saved', id: node.reference.id } };
      case 'bookmark-folder':
        return { kind: 'bookmark-folder', id: node.reference.id };
      case 'document-group':
        return { kind: 'document', source: node.source, parentId: node.reference.id };
      case 'history-date':
      case 'fixture-group':
        return undefined;
      default: {
        const exhaustiveReference: never = node.reference;
        return exhaustiveReference;
      }
    }
  }

  switch (node.reference.kind) {
    case 'tab':
      return {
        kind: 'persistent',
        target: { kind: 'live-tab', tabId: node.reference.id, windowId: node.reference.windowId }
      };
    case 'saved-tab':
    case 'saved-note':
    case 'saved-separator':
      return { kind: 'persistent', target: { kind: 'saved', id: node.reference.id } };
    case 'document-link':
    case 'document-note':
    case 'document-separator':
      return { kind: 'document', source: node.source, parentId: node.reference.id };
    case 'bookmark':
    case 'history':
    case 'fixture-link':
      return undefined;
    default: {
      const exhaustiveReference: never = node.reference;
      return exhaustiveReference;
    }
  }
}

function deleteTargetForNode(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): ExplorerDeleteTarget | undefined {
  if (node.kind === 'group') {
    switch (node.reference.kind) {
      case 'window':
        return { kind: 'live-window', id: node.reference.id };
      case 'saved-window':
      case 'saved-group':
        return { kind: 'saved', id: node.reference.id };
      case 'bookmark-folder':
        return node.reference.parentId === null
          ? undefined
          : { kind: 'bookmark', id: node.reference.id, itemKind: 'folder' };
      case 'document-group':
        return {
          kind: 'document',
          source: node.source,
          nodeId: node.reference.id,
          parentId: node.reference.parentId
        };
      case 'source':
      case 'saved-items':
      case 'history-date':
      case 'fixture-group':
        return undefined;
      default: {
        const exhaustiveReference: never = node.reference;
        return exhaustiveReference;
      }
    }
  }

  switch (node.reference.kind) {
    case 'tab':
      return { kind: 'live-tab', id: node.reference.id };
    case 'saved-tab':
    case 'saved-note':
    case 'saved-separator':
      return { kind: 'saved', id: node.reference.id };
    case 'bookmark':
      return { kind: 'bookmark', id: node.reference.id, itemKind: 'bookmark' };
    case 'document-link':
    case 'document-note':
    case 'document-separator':
      return {
        kind: 'document',
        source: node.source,
        nodeId: node.reference.id,
        parentId: node.reference.parentId
      };
    case 'history':
    case 'fixture-link':
      return undefined;
    default: {
      const exhaustiveReference: never = node.reference;
      return exhaustiveReference;
    }
  }
}

function persistentDeleteMode(
  target: ExplorerDeleteTarget,
  item: TreeViewItem<ExplorerTreeNode>
): Extract<ExplorerCommand, { kind: 'delete-tree-item' }>['mode'] {
  const canPromoteChildren = target.kind === 'live-tab' || target.kind === 'live-window' || target.kind === 'saved';
  return canPromoteChildren && item.childCount > 0 && item.isExpanded ? 'promote-children' : 'subtree';
}

function nodeChildCount(node: ExplorerTreeNode): number {
  return node.kind === 'message' ? 0 : node.children.length;
}

function findTreeItemPath<T>(
  items: readonly TreeViewItem<T>[],
  predicate: (item: TreeViewItem<T>) => boolean
): readonly TreeViewItem<T>[] {
  for (const item of items) {
    if (predicate(item)) {
      return [item];
    }
    const descendantPath = findTreeItemPath(item.children(), predicate);
    if (descendantPath.length > 0) {
      return [item, ...descendantPath];
    }
  }
  return [];
}

type PaneDragEvent = DragEvent & { currentTarget: HTMLDivElement; target: Element };

/** Renders a compact action used by an explorer toolbar. */
function PaneAction(props: {
  title: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  dragProps?: JSX.ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  indicator?: CloudBackupAttemptIndicator | undefined;
}) {
  return (
    <button
      {...props.dragProps}
      type="button"
      class={[
        'h-6 flex-none px-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white',
        {
          'cursor-grab active:cursor-grabbing': props.dragProps?.draggable === 'true',
          'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-neutral-400': props.disabled === true
        }
      ]}
      title={props.title}
      disabled={props.disabled}
      aria-description={props.indicator?.label}
      data-action-status={props.indicator?.tone}
      onClick={props.onClick}
    >
      {props.label}
      <Show when={props.indicator}>
        {(indicator) => (
          <span
            class={[
              'ml-1 inline-block h-1.5 w-3 rounded-sm align-middle',
              {
                'bg-neutral-500': indicator().tone === 'none',
                'bg-emerald-500': indicator().tone === 'success',
                'bg-red-500': indicator().tone === 'failure'
              }
            ]}
            aria-hidden="true"
          />
        )}
      </Show>
    </button>
  );
}

function TreeStatus(props: { children: string; tone?: 'muted' | 'error' }) {
  return (
    <p class={['p-3 text-xs', { 'text-neutral-400': props.tone !== 'error', 'text-red-400': props.tone === 'error' }]}>
      {props.children}
    </p>
  );
}

/** Receives source-window reveal requests sent when the extension action is clicked. */
function subscribeBrowserActionWindowReveal(listener: (windowId: string) => void): () => void {
  const runtime = getBrowserActionRuntime();
  if (!runtime) {
    return () => undefined;
  }
  const handleMessage = (message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'kind' in message &&
      message.kind === 'reveal-browser-window' &&
      'windowId' in message &&
      typeof message.windowId === 'string'
    ) {
      listener(message.windowId);
    }
  };
  runtime.onMessage.addListener(handleMessage);
  return () => runtime.onMessage.removeListener(handleMessage);
}

type BrowserActionRuntime = Readonly<{
  sendMessage: (message: unknown) => Promise<unknown>;
  onMessage: Readonly<{
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  }>;
}>;

function getBrowserActionRuntime(): BrowserActionRuntime | null {
  const candidate: unknown = Reflect.get(globalThis, 'chrome');
  if (typeof candidate !== 'object' || candidate === null || !('runtime' in candidate)) {
    return null;
  }
  const runtime: unknown = candidate.runtime;
  if (
    typeof runtime !== 'object' ||
    runtime === null ||
    !('onMessage' in runtime) ||
    !('sendMessage' in runtime) ||
    typeof runtime.sendMessage !== 'function'
  ) {
    return null;
  }
  const onMessage: unknown = runtime.onMessage;
  if (
    typeof onMessage !== 'object' ||
    onMessage === null ||
    !('addListener' in onMessage) ||
    !('removeListener' in onMessage) ||
    typeof onMessage.addListener !== 'function' ||
    typeof onMessage.removeListener !== 'function'
  ) {
    return null;
  }
  return { onMessage, sendMessage: runtime.sendMessage.bind(runtime) } as BrowserActionRuntime;
}

/** Allows the localhost mock and a newly opened extension tab to request an initial window reveal. */
function readRequestedBrowserWindowId(): string | null {
  try {
    return new URL(globalThis.location.href).searchParams.get('focusWindowId')?.trim() || null;
  } catch {
    return null;
  }
}

function createInstanceId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Explorer data could not be loaded.';
}

const TREE_ROW_HEIGHT = 20;
const ROOT_TARGET = { kind: 'root' } as const satisfies PersistentItemTarget;
const TREE_OVERSCAN = 400;
const CONTEXT_MENU_WIDTH = 280;
const CONTEXT_MENU_MIN_VISIBLE_HEIGHT = 160;
const CONTEXT_MENU_VIEWPORT_GAP = 8;
const SCROLL_HISTORY_SETTLE_TIME_MS = 250;
const MAX_SCROLL_HISTORY_LENGTH = 50;
const STANDALONE_WINDOW_WIDTH = 900;
const STANDALONE_WINDOW_HEIGHT = 900;
