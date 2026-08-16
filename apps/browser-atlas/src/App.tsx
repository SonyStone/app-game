import { createVirtualNestedList } from '@app-game/solid-virtual';
import type { Accessor, JSX } from 'solid-js';
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js';
import type { DocumentExplorerBackend } from './backends/document/createDocumentExplorerBackend';
import { createDocumentExplorerBackend } from './backends/document/createDocumentExplorerBackend';
import type {
  ExplorerBackend,
  ExplorerCloudBackupAttempt,
  ExplorerCloudBackupConfiguration,
  ExplorerCloudBackupStatus,
  ExplorerCloudBackupSummary,
  ExplorerCommand,
  ExplorerDeleteTarget,
  ExplorerDeletedItemSummary,
  ExplorerImportTarget,
  ExplorerTreeSnapshotSummary,
  PersistentItemReference,
  PersistentItemTarget,
  PersistentMovePlacement,
  PersistentOrganizerPlacement
} from './explorer/backend';
import {
  readExplorerClipboard,
  serializeClipboardText,
  writeExplorerClipboard
} from './explorer/clipboard';
import { affectedSources, createExplorerDragAndDrop } from './explorer/createExplorerDragAndDrop';
import type { ExplorerOrganizerKind } from './explorer/createExplorerDragAndDrop';
import { createExplorerSources } from './explorer/createExplorerSources';
import { ExplorerTreeRow } from './explorer/ExplorerTreeRow';
import {
  createExplorerDocumentSnapshot,
  downloadExplorerHtml,
  downloadExplorerDocument,
  downloadExplorerSourceText,
  readExplorerFile
} from './explorer/files';
import type { ExplorerHtmlRow } from './explorer/files';
import type { ExplorerSourceId, ExplorerTreeNode } from './explorer/model';
import { equalExplorerTreeNodes, EXPLORER_SOURCES, getExplorerChildren } from './explorer/model';
import type { PortableExplorerNode } from './explorer/portable';
import { createPortableExplorerNode, portableChildren, portableVisibleChildren } from './explorer/portable';
import { BrowserAtlasAboutDialog, BrowserAtlasHelpDialog } from './help/BrowserAtlasInfoDialog';
import { createTreeKeyboardNavigation } from './tree-view/createTreeKeyboardNavigation';
import type {
  TreeKeyboardMoveDirection,
  TreeKeyboardOrganizerRequest
} from './tree-view/createTreeKeyboardNavigation';
import { createTreeScrollRestoration } from './tree-view/createTreeScrollRestoration';
import { createTreeView } from './tree-view/createTreeView';
import type { TreeExpansionSnapshot, TreeViewItem } from './tree-view/createTreeView';
import { TreeDropIndicator } from './tree-view/TreeDropIndicator';
import { TreeSelectionIndicator } from './tree-view/TreeSelectionIndicator';
import { TreeView } from './tree-view/TreeView';
import type { TreeCollapsedSummary } from './tree-view/TreeView';
import {
  DEFAULT_BROWSER_ATLAS_SETTINGS,
  readBrowserAtlasSettings,
  subscribeBrowserAtlasSettings,
  writeBrowserAtlasSettings,
  type BrowserAtlasAppearanceSettings,
  type BrowserAtlasColorOverride,
  type BrowserAtlasSettings
} from './settings';
import './browser-atlas.css';

/** Props for the shared browser and website explorer composition. */
export type BrowserAtlasProps = {
  /** Primary live, fixture, or remote backend shown when the application opens. */
  backend: ExplorerBackend;
  /** User-facing name for the primary backend. Defaults to `Browser`. */
  backendLabel?: string;
  /** Additional independent browser identities available in both pane selectors. */
  additionalBrowserBackends?: readonly BrowserAtlasBackendOption[];
};

/** One secondary live or simulated browser exposed beside the primary backend. */
export type BrowserAtlasBackendOption = Readonly<{
  id: string;
  label: string;
  backend: ExplorerBackend;
}>;

/** Renders the explorer with a live backend and one drop-loaded document per pane. */
export function BrowserAtlas(props: BrowserAtlasProps) {
  let leftPaneController: ExplorerPaneController | null = null;
  let rightPaneController: ExplorerPaneController | null = null;
  let pendingBrowserActionWindowId = readRequestedBrowserWindowId();
  const instanceId = createInstanceId();
  const leftDocument = createDocumentExplorerBackend();
  const rightDocument = createDocumentExplorerBackend();
  const [leftDocumentLabel, setLeftDocumentLabel] = createSignal('Left file');
  const [rightDocumentLabel, setRightDocumentLabel] = createSignal('Right file');
  const [operationError, setOperationError] = createSignal<string | null>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [infoDialog, setInfoDialog] = createSignal<BrowserAtlasInfoDialogKind | null>(null);
  const [settings, setSettings] = createSignal<BrowserAtlasSettings>(DEFAULT_BROWSER_ATLAS_SETTINGS);
  const [clipboardMemory, setClipboardMemory] = createSignal<ExplorerClipboardMemory>(null);
  const [rootOperationDialog, setRootOperationDialog] = createSignal<ExplorerOperationDialogState | null>(null);
  const clipboard = { read: clipboardMemory, write: setClipboardMemory } satisfies ExplorerClipboardController;
  const browserBackend = createBrowserBinding(`${instanceId}:browser`, props.backendLabel ?? 'Browser', props.backend);
  const additionalBrowserBackends = (props.additionalBrowserBackends ?? []).map((option) =>
    createBrowserBinding(`${instanceId}:browser:${option.id}`, option.label, option.backend)
  );
  const leftFileBackend = createDocumentBinding(
    `${instanceId}:left-file`,
    leftDocumentLabel,
    setLeftDocumentLabel,
    leftDocument
  );
  const rightFileBackend = createDocumentBinding(
    `${instanceId}:right-file`,
    rightDocumentLabel,
    setRightDocumentLabel,
    rightDocument
  );
  const backends: readonly ExplorerBackendBinding[] = [
    browserBackend,
    ...additionalBrowserBackends,
    leftFileBackend,
    rightFileBackend
  ];
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
      class="h-screen min-h-0 overflow-hidden bg-neutral-950 text-neutral-100 print:h-auto print:overflow-visible print:bg-white print:text-black"
    >
      <header class="relative flex h-8 items-center border-b border-neutral-700 px-2 print:hidden">
        <h1 class="text-sm font-medium">Browser Atlas</h1>
        <button
          type="button"
          class="ml-auto h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          title="Open Browser Atlas in a standalone window"
          onClick={openStandaloneWindow}
        >
          Pop out
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          aria-haspopup="dialog"
          onClick={() => openInfoDialog('about')}
        >
          About
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          aria-haspopup="dialog"
          onClick={() => openInfoDialog('help')}
        >
          Help
        </button>
        <button
          type="button"
          class="h-6 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
          aria-expanded={settingsOpen()}
          onClick={() => {
            setInfoDialog(null);
            setSettingsOpen((open) => !open);
          }}
        >
          Settings
        </button>
        <Show when={settingsOpen()}>
          <BrowserAtlasSettingsPanel
            settings={settings()}
            onChange={updateSetting}
            onAppearanceChange={(appearance) => updateSetting('appearance', appearance)}
          />
        </Show>
      </header>

      <div class="flex h-[calc(100vh-2rem)] min-h-0 print:block print:h-auto print:overflow-visible">
        <ExplorerPane
          paneId="left"
          initialBackendId={browserBackend.id}
          initialSource="explore"
          label="Left explorer pane"
          backends={backends}
          ownedDocument={leftFileBackend}
          dragAndDrop={dragAndDrop}
          clipboard={clipboard}
          settings={settings}
          cloneLabel="Clone →"
          registerController={(controller) => {
            leftPaneController = controller;
            if (controller && pendingBrowserActionWindowId) {
              controller.revealBrowserWindow(pendingBrowserActionWindowId);
              pendingBrowserActionWindowId = null;
            }
          }}
          onCloneView={(view) => rightPaneController?.applyClone(view)}
          onCommand={executeCommand}
          onError={showOperationError}
        />
        <ExplorerPane
          paneId="right"
          initialBackendId={browserBackend.id}
          initialSource="bookmarks"
          label="Right explorer pane"
          backends={backends}
          ownedDocument={rightFileBackend}
          dragAndDrop={dragAndDrop}
          clipboard={clipboard}
          settings={settings}
          cloneLabel="← Clone"
          registerController={(controller) => {
            rightPaneController = controller;
          }}
          onCloneView={(view) => leftPaneController?.applyClone(view)}
          onCommand={executeCommand}
          onError={showOperationError}
        />
      </div>

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
    const binding = backends.find((candidate) => candidate.id === backendId);
    if (!binding) {
      throw new Error('The destination backend is no longer available.');
    }
    if (!binding.backend.capabilities.commands[command.kind]) {
      throw new Error(`${binding.label()} cannot execute ${command.kind}.`);
    }
    await binding.backend.execute(command);
    for (const source of affectedSources(command)) {
      binding.sources.refresh(source);
    }
  }

  function canMoveAcrossBrowserBackends(sourceBackendId: string, targetBackendId: string): boolean {
    const source = backends.find((candidate) => candidate.id === sourceBackendId);
    const target = backends.find((candidate) => candidate.id === targetBackendId);
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

  function updateSetting<TKey extends keyof BrowserAtlasSettings>(
    key: TKey,
    value: BrowserAtlasSettings[TKey]
  ): void {
    const nextSettings = { ...settings(), [key]: value } satisfies BrowserAtlasSettings;
    setSettings(nextSettings);
    void writeBrowserAtlasSettings(nextSettings).catch(showOperationError);
  }

  function revealBrowserActionWindow(windowId: string): void {
    if (leftPaneController) {
      leftPaneController.revealBrowserWindow(windowId);
    } else {
      pendingBrowserActionWindowId = windowId;
    }
  }

  function openStandaloneWindow(): void {
    const runtime = getBrowserActionRuntime();
    if (runtime) {
      void runtime
        .sendMessage({ kind: 'open-browser-atlas-standalone' })
        .catch(showOperationError);
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

  function openInfoDialog(kind: BrowserAtlasInfoDialogKind): void {
    setSettingsOpen(false);
    setInfoDialog(kind);
  }
}

type BrowserAtlasInfoDialogKind = 'help' | 'about';

function BrowserAtlasSettingsPanel(props: {
  settings: BrowserAtlasSettings;
  onChange: <TKey extends keyof BrowserAtlasSettings>(key: TKey, value: BrowserAtlasSettings[TKey]) => void;
  onAppearanceChange: (appearance: BrowserAtlasAppearanceSettings) => void;
}) {
  return (
    <div
      class="absolute top-8 right-2 z-40 max-h-[calc(100vh-2.5rem)] w-80 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 p-3 text-xs shadow-xl"
      role="dialog"
      aria-label="Browser Atlas settings"
    >
      <SettingsCheckbox
        label="Follow the focused browser window"
        description="Scroll the primary Explore pane when focus changes outside it."
        checked={props.settings.autoFollowFocusedWindow}
        onChange={(checked) => props.onChange('autoFollowFocusedWindow', checked)}
      />
      <SettingsCheckbox
        label="Activate with one click"
        description="Otherwise live and saved tabs/windows activate on double click."
        checked={props.settings.oneClickActivation}
        onChange={(checked) => props.onChange('oneClickActivation', checked)}
      />
      <SettingsCheckbox
        label="Open Browser Atlas on startup"
        description="Opens the extension explorer after Chromium starts."
        checked={props.settings.openOnStartup}
        onChange={(checked) => props.onChange('openOnStartup', checked)}
      />
      <SettingsCheckbox
        label="Nest new tabs under their opener"
        description="Tree Style Tabs: preserve which live tab opened each new tab."
        checked={props.settings.nestNewTabsUnderOpener}
        onChange={(checked) => props.onChange('nestNewTabsUnderOpener', checked)}
      />
      <SettingsCheckbox
        label="Restore saved window position and size"
        description="Open retained windows at their last known screen bounds."
        checked={props.settings.restoreWindowsInOriginalBounds}
        onChange={(checked) => props.onChange('restoreWindowsInOriginalBounds', checked)}
      />
      <div class="mb-3 border-t border-neutral-700 pt-3 font-medium text-neutral-200">Appearance</div>
      <SettingsCheckbox
        label="Use light background"
        description="Use the original extension's experimental light color scheme."
        checked={props.settings.appearance.lightBackground}
        onChange={(checked) => updateAppearance('lightBackground', checked)}
      />
      <SettingsColorOverride
        label="Saved tab"
        value={props.settings.appearance.savedTab}
        onChange={(value) => updateAppearance('savedTab', value)}
      />
      <SettingsColorOverride
        label="Open tab"
        value={props.settings.appearance.openTab}
        onChange={(value) => updateAppearance('openTab', value)}
      />
      <SettingsColorOverride
        label="Active tab"
        value={props.settings.appearance.activeTab}
        onChange={(value) => updateAppearance('activeTab', value)}
      />
      <SettingsColorOverride
        label="Note"
        value={props.settings.appearance.note}
        onChange={(value) => updateAppearance('note', value)}
      />
    </div>
  );

  function updateAppearance<TKey extends keyof BrowserAtlasAppearanceSettings>(
    key: TKey,
    value: BrowserAtlasAppearanceSettings[TKey]
  ): void {
    props.onAppearanceChange({ ...props.settings.appearance, [key]: value });
  }
}

function SettingsCheckbox(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="mb-3 flex cursor-pointer gap-2 last:mb-0">
      <input
        type="checkbox"
        class="mt-0.5"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span>
        <span class="block text-neutral-100">{props.label}</span>
        <span class="block text-neutral-400">{props.description}</span>
      </span>
    </label>
  );
}

function SettingsColorOverride(props: {
  label: string;
  value: BrowserAtlasColorOverride;
  onChange: (value: BrowserAtlasColorOverride) => void;
}) {
  return (
    <div class="mb-3 flex items-center gap-2 last:mb-0">
      <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-neutral-100">
        <input
          type="checkbox"
          checked={props.value.enabled}
          aria-label={`Override ${props.label.toLocaleLowerCase()} color`}
          onChange={(event) => props.onChange({ ...props.value, enabled: event.currentTarget.checked })}
        />
        <span>Override {props.label.toLocaleLowerCase()} color</span>
      </label>
      <input
        type="color"
        class="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
        aria-label={`${props.label} color`}
        value={props.value.color}
        onInput={(event) => props.onChange({ ...props.value, color: event.currentTarget.value })}
      />
    </div>
  );
}

type ExplorerSources = ReturnType<typeof createExplorerSources>;
type ExplorerDragAndDrop = ReturnType<typeof createExplorerDragAndDrop>;

type ExplorerClipboardMemory = Readonly<{
  items: readonly PortableExplorerNode[];
  plainText: string;
}> | null;

type ExplorerClipboardController = Readonly<{
  read: Accessor<ExplorerClipboardMemory>;
  write: (memory: ExplorerClipboardMemory) => void;
}>;

type ExplorerBackendBinding = BrowserBackendBinding | DocumentBackendBinding;

type BrowserBackendBinding = {
  kind: 'browser';
  id: string;
  label: Accessor<string>;
  backend: ExplorerBackend;
  sources: ExplorerSources;
};

type DocumentBackendBinding = {
  kind: 'document';
  id: string;
  label: Accessor<string>;
  setLabel: (label: string) => void;
  backend: ExplorerBackend;
  sources: ExplorerSources;
  document: DocumentExplorerBackend;
};

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

type SnapshotHistoryState =
  | Readonly<{ status: 'closed' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; snapshots: readonly ExplorerTreeSnapshotSummary[] }>
  | Readonly<{ status: 'error'; message: string }>;

type DeletionHistoryState =
  | Readonly<{ status: 'closed' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; items: readonly ExplorerDeletedItemSummary[] }>
  | Readonly<{ status: 'error'; message: string }>;

type CloudBackupPanelState =
  | Readonly<{ status: 'closed' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      status: 'ready';
      connection: ExplorerCloudBackupStatus;
      configuration: ExplorerCloudBackupConfiguration;
      backups: readonly ExplorerCloudBackupSummary[];
      attempt: ExplorerCloudBackupAttempt;
    }>
  | Readonly<{ status: 'error'; message: string }>;

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

function ExplorerPane(props: {
  paneId: 'left' | 'right';
  initialBackendId: string;
  initialSource: ExplorerSourceId;
  label: string;
  backends: readonly ExplorerBackendBinding[];
  ownedDocument: DocumentBackendBinding;
  dragAndDrop: ExplorerDragAndDrop;
  clipboard: ExplorerClipboardController;
  settings: Accessor<BrowserAtlasSettings>;
  cloneLabel: string;
  registerController: (controller: ExplorerPaneController | null) => void;
  onCloneView: (view: ExplorerPaneClone) => void;
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
  const [selectedBackendId, setSelectedBackendId] = createSignal(props.initialBackendId);
  const [selectedSource, setSelectedSource] = createSignal<ExplorerSourceId>(props.initialSource);
  const [expandAllUndo, setExpandAllUndo] = createSignal<ExpandAllUndo | null>(null);
  const [contextMenu, setContextMenu] = createSignal<ExplorerContextMenuState | null>(null);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchIndex, setSearchIndex] = createSignal(0);
  const [printDocument, setPrintDocument] = createSignal<ExplorerPrintDocument | null>(null);
  const [snapshotHistory, setSnapshotHistory] = createSignal<SnapshotHistoryState>({ status: 'closed' });
  const [deletionHistory, setDeletionHistory] = createSignal<DeletionHistoryState>({ status: 'closed' });
  const [cloudBackupPanel, setCloudBackupPanel] = createSignal<CloudBackupPanelState>({ status: 'closed' });
  const [cloudBackupAttempt, setCloudBackupAttempt] = createSignal<ExplorerCloudBackupAttempt>({ status: 'none' });
  const [pendingClone, setPendingClone] = createSignal<ExplorerPaneClone | null>(null);
  const [pendingBrowserWindowReveal, setPendingBrowserWindowReveal] = createSignal<string | null>(null);
  const [operationDialog, setOperationDialog] = createSignal<ExplorerOperationDialogState | null>(null);
  const selectedBackend = () =>
    props.backends.find((backend) => backend.id === selectedBackendId()) ?? props.backends[0] ?? props.ownedDocument;
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
    return query
      ? tree.visibleItems().filter((item) => explorerNodeSearchText(item.item).includes(query))
      : [];
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
  const navigation = createTreeKeyboardNavigation({
    tree,
    scrollTo: (item) => virtualTree.scrollTo(item),
    onActivate(node, alternative) {
      void activateNode(node, alternative);
    },
    onEdit(node) {
      if (node.kind === 'message') {
        return;
      }
      if (
        savedOrganizerId(node) ||
        node.reference.kind === 'window' ||
        node.reference.kind === 'saved-window'
      ) {
        void editPersistentItemTitle(node);
        return;
      }
      if (node.kind === 'link' && (node.reference.kind === 'tab' || node.reference.kind === 'saved-tab')) {
        editInlineTabNote(node);
      }
    },
    onSaveClose(node) {
      if (
        node.kind !== 'message' &&
        (node.reference.kind === 'tab' || node.reference.kind === 'window')
      ) {
        const item = findTreeItemPath(tree.children(), (candidate) => candidate.item.id === node.id).at(-1);
        handleNodeAction(node, item);
      }
    },
    onDelete(node) {
      if (node.kind !== 'message') {
        const item = findTreeItemPath(tree.children(), (candidate) => candidate.item.id === node.id).at(-1);
        if (item) {
          handleNodeDelete(node, item);
        }
      }
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
      void backupFromKeyboard();
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
  const scrollRestoration = createTreeScrollRestoration({
    key: () => `browser-atlas:tree-scroll:v2:${props.paneId}:${selectedBackendId()}:${selectedSource()}`,
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
  props.registerController({ applyClone, revealBrowserWindow });
  createEffect(() => {
    const clone = pendingClone();
    if (
      !clone ||
      selectedBackendId() !== clone.backendId ||
      selectedSource() !== clone.source ||
      selectedBackend().sources.tree(clone.source) === undefined
    ) {
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
  });
  createEffect(() => {
    const windowId = pendingBrowserWindowReveal();
    const backend = selectedBackend();
    if (
      !windowId ||
      selectedBackendId() !== props.initialBackendId ||
      selectedSource() !== 'explore' ||
      backend.sources.loading('explore')
    ) {
      return;
    }
    const path = browserWindowPath(windowId);
    const browserWindow = path.at(-1);
    if (!browserWindow) {
      return;
    }
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
  });
  createEffect(() => {
    selectedBackendId();
    selectedSource();
    setSnapshotHistory({ status: 'closed' });
    setDeletionHistory({ status: 'closed' });
    setCloudBackupPanel({ status: 'closed' });
  });
  createEffect(() => {
    const backendId = selectedBackendId();
    const cloudBackups = selectedBackend().backend.cloudBackups;
    setCloudBackupAttempt({ status: 'none' });
    if (!cloudBackups) {
      return;
    }
    void cloudBackups.lastAttempt().then((attempt) => {
      if (selectedBackendId() === backendId) {
        setCloudBackupAttempt(attempt);
      }
    }).catch(() => undefined);
  });
  createEffect(() => {
    const focusedWindowId = focusedBrowserWindowId();
    if (focusedWindowId === null || focusedWindowId === observedFocusedWindowId) {
      return;
    }
    const hadObservedWindow = observedFocusedWindowId !== null;
    observedFocusedWindowId = focusedWindowId;
    if (!hadObservedWindow || props.paneId !== 'left' || !props.settings().autoFollowFocusedWindow) {
      return;
    }
    if (suppressedFocusedWindowId === focusedWindowId) {
      suppressedFocusedWindowId = null;
      return;
    }
    revealFocusedWindow(false);
  });
  onCleanup(() => {
    props.registerController(null);
    if (scrollHistoryTimer !== undefined) {
      clearTimeout(scrollHistoryTimer);
    }
  });
  return (
    <section
      class="relative flex min-w-0 flex-1 flex-col border-r border-neutral-700 last:border-r-0 print:block print:border-0 print:overflow-visible"
      aria-label={props.label}
      onKeyDown={handlePaneKeyboardShortcut}
    >
      <div class="flex h-8 flex-none items-center gap-1 border-b border-neutral-700 bg-neutral-900 px-1 print:hidden">
        <select
          class="h-6 max-w-32 min-w-0 rounded border border-neutral-700 bg-neutral-950 px-1 text-xs text-neutral-200"
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
                aria-selected={selectedSource() === source.id}
                class="h-7 border border-b-0 px-2 text-xs"
                classList={{
                  'border-neutral-600 bg-neutral-800 text-white': selectedSource() === source.id,
                  'border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100':
                    selectedSource() !== source.id
                }}
                onClick={() => setSelectedSource(source.id)}
              >
                {source.label}
              </button>
            )}
          </For>
        </div>

        <div class="ml-auto flex h-7 min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
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
              dragProps={canCreateWindowAtPlacement()
                ? props.dragAndDrop.windowDragProps(selectedBackendId())
                : undefined}
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
            <PaneAction title="Save and close all other browser windows" label="Save all" onClick={saveCloseAllWindows} />
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
              onClick={toggleDeletionHistory}
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
              onClick={toggleSnapshotHistory}
            />
          </Show>
          <Show when={canUseCloudBackups()}>
            <PaneAction
              title="Manage manual and automatic remote tree backups"
              label="Cloud"
              indicator={cloudBackupAttemptIndicator(cloudBackupAttempt())}
              onClick={toggleCloudBackupPanel}
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
          <PaneAction title="Scroll up to the previous open window (W)" label="Prev window" onClick={scrollToPreviousOpenWindow} />
          <PaneAction title="Undo the last tree scroll (S)" label="Undo scroll" onClick={undoScroll} />
          <PaneAction title="Clone this view into the other pane (C)" label={props.cloneLabel} onClick={cloneView} />
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

      <Show when={snapshotHistory().status !== 'closed'}>
        <LocalSnapshotHistoryPanel
          state={snapshotHistory()}
          onRetry={() => void loadSnapshotHistory()}
          onOpen={(createdAt) => void openTreeSnapshot(createdAt)}
          onRestore={(createdAt) => void restoreTreeSnapshot(createdAt)}
          onClose={() => setSnapshotHistory({ status: 'closed' })}
        />
      </Show>
      <Show when={deletionHistory().status !== 'closed'}>
        <DeletedItemsHistoryPanel
          state={deletionHistory()}
          onRetry={() => void loadDeletionHistory()}
          onRestore={(deletionId) => void restoreDeletedItem(deletionId)}
          onClose={() => setDeletionHistory({ status: 'closed' })}
        />
      </Show>
      <Show when={cloudBackupPanel().status !== 'closed'}>
        <CloudBackupPanel
          providerName={selectedBackend().backend.cloudBackups?.providerName ?? 'Cloud'}
          state={cloudBackupPanel()}
          onRetry={() => void loadCloudBackupPanel()}
          onConnect={() => void connectCloudBackups()}
          onDisconnect={() => void disconnectCloudBackups()}
          onConfigurationChange={updateCloudBackupConfigurationDraft}
          onSaveConfiguration={() => void saveCloudBackupConfiguration()}
          onCreate={() => void createCloudBackup()}
          onOpen={(backupId) => void openCloudBackup(backupId)}
          onRestore={(backupId) => void restoreCloudBackup(backupId)}
          onDelete={(backupId) => void deleteCloudBackup(backupId)}
          onClose={() => setCloudBackupPanel({ status: 'closed' })}
        />
      </Show>

      <Show when={searchOpen()}>
        <div class="flex h-8 flex-none items-center gap-1 border-b border-neutral-700 bg-neutral-900 px-2 print:hidden" role="search">
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
          <button type="button" class="h-6 px-1 text-neutral-400 hover:text-white" title="Previous match" onClick={() => selectSearchMatch(-1)}>↑</button>
          <button type="button" class="h-6 px-1 text-neutral-400 hover:text-white" title="Next match" onClick={() => selectSearchMatch(1)}>↓</button>
          <button type="button" class="h-6 px-1 text-neutral-400 hover:text-white" title="Close search" onClick={closeSearch}>×</button>
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
        onPointerDown={scrollRestoration.onUserInteraction}
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
          <TreeView
            virtual={virtualTree}
            isProtected={(item) => item.item.kind !== 'message' && item.item.protectedFromClose === true}
            collapsedSummary={(item) => createExplorerCollapsedSummary(item.item)}
            rowProps={(item) => ({
              ...props.dragAndDrop.rowProps(item.item, selectedBackendId()),
              ...navigation.rowProps(item),
              onContextMenu: (event) => handleRowContextMenu(event, item)
            })}
            rowClass={(item) =>
              props.dragAndDrop.canDrag(item.item) ? 'cursor-grab active:cursor-grabbing' : undefined
            }
          >
            {(item) => (
              <>
                <TreeSelectionIndicator selected={navigation.isSelected(item)} focused={navigation.isFocused(item)} />
                <ExplorerTreeRow
                  node={item.item}
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
      </div>

      <Show when={contextMenu()}>
        {(menu) => (
          <ExplorerContextMenu
            x={menu().x}
            y={menu().y}
            sections={contextMenuSections(menu().item)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>
      <Show when={operationDialog()}>
        {(dialog) => (
          <ExplorerOperationDialog
            state={dialog()}
            onCancel={() => closeOperationDialog(null)}
            onConfirm={(value) => closeOperationDialog(value)}
          />
        )}
      </Show>
      <Show when={printDocument()}>
        {(document) => <ExplorerPrintView title={document().title} rows={document().rows} />}
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

  function confirmOperation(
    title: string,
    message: string,
    confirmLabel: string,
    danger = false
  ): Promise<boolean> {
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
      root
        ? portableVisibleChildren(
            root,
            new Map(tree.visibleItems().map((item) => [item.id, item.isExpanded]))
          )
        : []
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
    const destination = tree.visibleItems().findLast((item, index) =>
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
        if (props.paneId === 'left') {
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
        if (props.paneId === 'left') {
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
      void props
        .onCommand(selectedBackendId(), { kind: 'rename-persistent-item', item, title })
        .catch(props.onError);
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

  function canCreateWindow(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['create-window'];
  }

  function canCreateWindowAtPlacement(): boolean {
    return (
      selectedSource() === 'explore' &&
      selectedBackend().backend.capabilities.commands['create-window-at-placement']
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
    void props.onCommand(selectedBackendId(), {
      kind: 'create-google-doc-at-placement',
      placement: { kind: 'tree-end' }
    }).catch(props.onError);
  }

  function canCreateSavedOrganizer(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['create-saved-organizer'];
  }

  function canSaveCloseAllWindows(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.capabilities.commands['save-close-all-windows'];
  }

  async function saveCloseAllWindows(): Promise<void> {
    if (!await confirmOperation(
      'Save and close all windows?',
      'Every browser window except this Browser Atlas window will be saved and closed.',
      'Save and close'
    )) {
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
    void undoTreeAndRefreshHistory();
  }

  function canRedoTree(): boolean {
    return canUseUndoHistory() && selectedBackend().backend.undoHistory?.canRedo() === true;
  }

  function redoTree(): void {
    void redoTreeAndRefreshHistory();
  }

  async function redoTreeAndRefreshHistory(): Promise<void> {
    try {
      await props.onCommand(selectedBackendId(), { kind: 'redo-persistent-tree' });
      if (deletionHistory().status !== 'closed') {
        await loadDeletionHistory();
      }
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  async function undoTreeAndRefreshHistory(): Promise<void> {
    try {
      await props.onCommand(selectedBackendId(), { kind: 'undo-persistent-tree' });
      if (deletionHistory().status !== 'closed') {
        await loadDeletionHistory();
      }
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  function canBrowseDeletedItems(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.deletions !== undefined;
  }

  function toggleDeletionHistory(): void {
    if (deletionHistory().status !== 'closed') {
      setDeletionHistory({ status: 'closed' });
      return;
    }
    setSnapshotHistory({ status: 'closed' });
    setCloudBackupPanel({ status: 'closed' });
    void loadDeletionHistory();
  }

  async function loadDeletionHistory(): Promise<void> {
    const history = selectedBackend().backend.deletions;
    if (!history) {
      setDeletionHistory({ status: 'error', message: 'This data source does not expose deleted items.' });
      return;
    }
    setDeletionHistory({ status: 'loading' });
    try {
      setDeletionHistory({ status: 'ready', items: await history.list() });
    } catch (reason: unknown) {
      setDeletionHistory({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'Deleted items could not be loaded.'
      });
    }
  }

  async function restoreDeletedItem(deletionId: string): Promise<void> {
    const history = selectedBackend().backend.deletions;
    if (!history) {
      return;
    }
    setDeletionHistory({ status: 'loading' });
    try {
      await history.restore(deletionId);
      selectedBackend().sources.refresh('explore');
      setDeletionHistory({ status: 'ready', items: await history.list() });
    } catch (reason: unknown) {
      setDeletionHistory({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'The selected deleted item could not be restored.'
      });
    }
  }

  function runDeleteCommand(command: Extract<ExplorerCommand, { kind: 'delete-tree-item' }>): void {
    void props
      .onCommand(selectedBackendId(), command)
      .then(() => deletionHistory().status === 'closed' ? undefined : loadDeletionHistory())
      .catch(props.onError);
  }

  function canUseLocalSnapshots(): boolean {
    const backend = selectedBackend().backend;
    const commands = backend.capabilities.commands;
    return (
      selectedSource() === 'explore' &&
      commands['create-tree-snapshot'] &&
      commands['restore-latest-tree-snapshot'] &&
      backend.snapshots !== undefined
    );
  }

  function createTreeSnapshot(): void {
    void createTreeSnapshotAndRefreshHistory();
  }

  async function createTreeSnapshotAndRefreshHistory(): Promise<void> {
    try {
      await props.onCommand(selectedBackendId(), { kind: 'create-tree-snapshot' });
      if (snapshotHistory().status !== 'closed') {
        await loadSnapshotHistory();
      }
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  async function restoreLatestTreeSnapshot(): Promise<void> {
    if (!await confirmOperation(
      'Restore latest local backup?',
      'The current saved tree will be replaced with the latest local snapshot.',
      'Restore',
      true
    )) {
      return;
    }
    await props
      .onCommand(selectedBackendId(), { kind: 'restore-latest-tree-snapshot' })
      .then(() => snapshotHistory().status === 'closed' ? undefined : loadSnapshotHistory())
      .catch(props.onError);
  }

  function toggleSnapshotHistory(): void {
    if (snapshotHistory().status !== 'closed') {
      setSnapshotHistory({ status: 'closed' });
      return;
    }
    setDeletionHistory({ status: 'closed' });
    setCloudBackupPanel({ status: 'closed' });
    void loadSnapshotHistory();
  }

  async function loadSnapshotHistory(): Promise<void> {
    const history = selectedBackend().backend.snapshots;
    if (!history) {
      setSnapshotHistory({ status: 'error', message: 'This data source does not expose local backups.' });
      return;
    }
    setSnapshotHistory({ status: 'loading' });
    try {
      setSnapshotHistory({ status: 'ready', snapshots: await history.list() });
    } catch (reason: unknown) {
      setSnapshotHistory({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'Local backups could not be loaded.'
      });
    }
  }

  async function restoreTreeSnapshot(createdAt: number): Promise<void> {
    const history = selectedBackend().backend.snapshots;
    if (!history) {
      return;
    }
    if (!await confirmOperation(
      'Restore local backup?',
      `The current saved tree will be replaced with the backup from ${formatSnapshotTime(createdAt)}.`,
      'Restore',
      true
    )) {
      return;
    }
    setSnapshotHistory({ status: 'loading' });
    try {
      await history.restore(createdAt);
      selectedBackend().sources.refresh('explore');
      setSnapshotHistory({ status: 'ready', snapshots: await history.list() });
    } catch (reason: unknown) {
      setSnapshotHistory({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'The selected backup could not be restored.'
      });
    }
  }

  async function openTreeSnapshot(createdAt: number): Promise<void> {
    const history = selectedBackend().backend.snapshots;
    if (!history) {
      return;
    }
    setSnapshotHistory({ status: 'loading' });
    try {
      const document = await history.read(createdAt);
      props.ownedDocument.document.replaceDocument(document);
      props.ownedDocument.setLabel(document.title);
      setSelectedBackendId(props.ownedDocument.id);
      setSelectedSource('explore');
      setSnapshotHistory({ status: 'closed' });
    } catch (reason: unknown) {
      setSnapshotHistory({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'The selected backup could not be opened.'
      });
    }
  }

  function canUseCloudBackups(): boolean {
    return selectedSource() === 'explore' && selectedBackend().backend.cloudBackups !== undefined;
  }

  async function backupFromKeyboard(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (selectedSource() !== 'explore' || !cloudBackups) {
      if (canUseLocalSnapshots()) {
        await createTreeSnapshotAndRefreshHistory();
      }
      return;
    }

    try {
      const connection = await cloudBackups.status();
      if (connection.status === 'connected') {
        await createCloudBackup();
        return;
      }
      if (connection.status === 'disconnected') {
        setSnapshotHistory({ status: 'closed' });
        setDeletionHistory({ status: 'closed' });
        await loadCloudBackupPanel();
        return;
      }
      if (canUseLocalSnapshots()) {
        await createTreeSnapshotAndRefreshHistory();
      }
    } catch (reason: unknown) {
      if (canUseLocalSnapshots()) {
        await createTreeSnapshotAndRefreshHistory();
      } else {
        props.onError(reason);
      }
    }
  }

  function toggleCloudBackupPanel(): void {
    if (cloudBackupPanel().status !== 'closed') {
      setCloudBackupPanel({ status: 'closed' });
      return;
    }
    setSnapshotHistory({ status: 'closed' });
    setDeletionHistory({ status: 'closed' });
    void loadCloudBackupPanel();
  }

  async function loadCloudBackupPanel(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups) {
      setCloudBackupPanel({ status: 'error', message: 'This data source does not expose cloud backups.' });
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      const [connection, configuration, attempt] = await Promise.all([
        cloudBackups.status(),
        cloudBackups.configuration(),
        cloudBackups.lastAttempt()
      ]);
      const backups = connection.status === 'connected' ? await cloudBackups.list() : [];
      const refreshedAttempt = await cloudBackups.lastAttempt();
      setCloudBackupAttempt(refreshedAttempt.status === 'none' ? attempt : refreshedAttempt);
      setCloudBackupPanel({
        status: 'ready',
        connection,
        configuration,
        backups,
        attempt: refreshedAttempt.status === 'none' ? attempt : refreshedAttempt
      });
    } catch (reason: unknown) {
      await refreshCloudBackupAttempt();
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  async function refreshCloudBackupAttempt(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups) {
      return;
    }
    try {
      setCloudBackupAttempt(await cloudBackups.lastAttempt());
    } catch {
      // The provider error remains primary when its optional session-status read is unavailable.
    }
  }

  async function connectCloudBackups(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups) {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      await cloudBackups.connect();
      await loadCloudBackupPanel();
    } catch (reason: unknown) {
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  async function disconnectCloudBackups(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups) {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      await cloudBackups.disconnect();
      await loadCloudBackupPanel();
    } catch (reason: unknown) {
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  function updateCloudBackupConfigurationDraft(configuration: ExplorerCloudBackupConfiguration): void {
    const state = cloudBackupPanel();
    if (state.status === 'ready') {
      setCloudBackupPanel({ ...state, configuration });
    }
  }

  async function saveCloudBackupConfiguration(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    const state = cloudBackupPanel();
    if (!cloudBackups || state.status !== 'ready') {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      await cloudBackups.configure(state.configuration);
      await loadCloudBackupPanel();
    } catch (reason: unknown) {
      await refreshCloudBackupAttempt();
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  async function createCloudBackup(): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    const state = cloudBackupPanel();
    if (!cloudBackups) {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      if (state.status === 'ready') {
        await cloudBackups.configure(state.configuration);
      }
      await cloudBackups.create('manual');
      await loadCloudBackupPanel();
    } catch (reason: unknown) {
      await refreshCloudBackupAttempt();
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  async function restoreCloudBackup(backupId: string): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups || !await confirmOperation(
      'Restore cloud backup?',
      'The current saved tree will be replaced with this cloud backup.',
      'Restore',
      true
    )) {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      await cloudBackups.restore(backupId);
      selectedBackend().sources.refresh('explore');
      await loadCloudBackupPanel();
    } catch (reason: unknown) {
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  async function openCloudBackup(backupId: string): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups) {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      const document = await cloudBackups.read(backupId);
      props.ownedDocument.document.replaceDocument(document);
      props.ownedDocument.setLabel(document.title);
      setSelectedBackendId(props.ownedDocument.id);
      setSelectedSource('explore');
      setCloudBackupPanel({ status: 'closed' });
    } catch (reason: unknown) {
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
    }
  }

  async function deleteCloudBackup(backupId: string): Promise<void> {
    const cloudBackups = selectedBackend().backend.cloudBackups;
    if (!cloudBackups || !await confirmOperation(
      'Delete cloud backup?',
      'This cloud backup will be permanently deleted.',
      'Delete',
      true
    )) {
      return;
    }
    setCloudBackupPanel({ status: 'loading' });
    try {
      await cloudBackups.delete(backupId);
      await loadCloudBackupPanel();
    } catch (reason: unknown) {
      setCloudBackupPanel({ status: 'error', message: formatCloudBackupError(reason) });
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
    setSelectedBackendId(props.initialBackendId);
    setSelectedSource('explore');
    setPendingBrowserWindowReveal(windowId);
    const backend = props.backends.find((candidate) => candidate.id === props.initialBackendId);
    backend?.sources.refresh('explore');
  }

  function browserWindowPath(windowId: string): readonly TreeViewItem<ExplorerTreeNode>[] {
    return findTreeItemPath(
      tree.children(),
      (item) =>
        item.item.kind === 'group' &&
        item.item.reference.kind === 'window' &&
        item.item.reference.id === windowId
    );
  }

  function focusedWindowPath(): readonly TreeViewItem<ExplorerTreeNode>[] {
    return findTreeItemPath(
      tree.children(),
      (item) =>
        item.item.kind === 'group' &&
        item.item.reference.kind === 'window' &&
        item.item.reference.focused
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
    const items = [
      source,
      ...(!item.isExpanded ? nestedPersistentOrganizerReferences(item.children()) : [])
    ];
    void props
      .onCommand(selectedBackendId(), { kind: 'flatten-persistent-tabs', items })
      .catch(props.onError);
    return true;
  }

  async function createOrganizer(
    itemKind: CreateSavedOrganizerCommand['itemKind'],
    requestedPlacement?: PersistentOrganizerPlacement
  ): Promise<void> {
    const selectedNode = navigation.selectedItem();
    const target = selectedNode && selectedNode.kind !== 'message' ? persistentTargetForNode(selectedNode) : ROOT_TARGET;
    const placement = requestedPlacement ?? { kind: 'inside', target, position: 'last' };
    const defaultValue = itemKind === 'group' ? 'New group' : itemKind === 'note' ? 'New note' : '';
    const requestedTitle = itemKind === 'separator'
      ? ''
      : await requestOperationText(`Create ${itemKind}`, defaultValue, 'Create');
    if (requestedTitle !== null) {
      const command = createSavedOrganizerCommand(itemKind, placement, requestedTitle);
      await props.onCommand(selectedBackendId(), command).catch(props.onError);
    }
  }

  function editInlineTabNote(node: Extract<ExplorerTreeNode, { kind: 'link' }>): void {
    const existingNote = node.children.find(
      (child) => child.kind === 'link' && child.reference.kind === 'saved-note'
    );
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
      props.ownedDocument.document.replaceDocument(document);
      props.ownedDocument.setLabel(file.name);
      setSelectedBackendId(props.ownedDocument.id);
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
    navigation.focus(item);
    setContextMenu({
      x: Math.max(0, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH)),
      y: Math.max(0, Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_MIN_VISIBLE_HEIGHT)),
      item
    });
  }

  function handleClipboardCopy(event: ClipboardEvent): void {
    writeSelectedNodeToClipboard(event);
  }

  function handleClipboardCut(event: ClipboardEvent): void {
    const node = navigation.selectedItem();
    const target = node && node.kind !== 'message' ? deleteTargetForNode(node) : undefined;
    if (
      !target ||
      !selectedBackend().backend.capabilities.commands['delete-tree-item'] ||
      !writeSelectedNodeToClipboard(event)
    ) {
      return;
    }
    navigation.clearSelection();
    runDeleteCommand({ kind: 'delete-tree-item', target, mode: 'subtree' });
  }

  function writeSelectedNodeToClipboard(event: ClipboardEvent): boolean {
    const node = navigation.selectedItem();
    const clipboardData = event.clipboardData;
    if (!node || !clipboardData) {
      return false;
    }
    const portableNode = createPortableExplorerNode(node);
    if (!portableNode) {
      return false;
    }
    if (!writeExplorerClipboard(clipboardData, [portableNode])) {
      return false;
    }
    rememberClipboardItems([portableNode]);
    event.preventDefault();
    event.stopPropagation();
    return true;
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
      clipboardActions.push({ label: 'Copy hierarchy', shortcut: 'Ctrl/Cmd+C', run: () => copyContextNode(node) });
    }
    if (deleteTargetForNode(node) && selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      clipboardActions.push({ label: 'Cut hierarchy', shortcut: 'Ctrl/Cmd+X', run: () => cutContextNode(node) });
    }
    if (
      selectedBackend().backend.capabilities.commands['import-items'] &&
      clipboardImportTarget(node, selectedBackend())
    ) {
      clipboardActions.push({ label: 'Paste as last child', shortcut: 'Ctrl/Cmd+V', run: () => void pasteContextNode(node) });
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

    const organizerActions = canCreateSavedOrganizer()
      ? createContextOrganizerActions(node)
      : [];
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

  function createContextGlobalActions(): ExplorerContextMenuAction[] {
    return [
      ...(canUndoTree()
        ? [{ label: 'Undo tree change', shortcut: 'Ctrl/Cmd+Z', run: undoTree }]
        : []),
      ...(canRedoTree()
        ? [{ label: 'Redo tree change', shortcut: 'Ctrl/Cmd+Shift+Z', run: redoTree }]
        : []),
      { label: 'Scroll up to previous open window', shortcut: 'W', run: scrollToPreviousOpenWindow },
      { label: 'Undo tree scroll', shortcut: 'S', run: undoScroll },
      { label: 'Clone view into other pane', shortcut: 'C', run: cloneView },
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
        ? [{ label: request.label, shortcut: request.shortcut, run: () => moveItemFromKeyboard(node, request.direction) }]
        : []
    );
  }

  function createContextUtilityActions(item: TreeViewItem<ExplorerTreeNode>): ExplorerContextMenuAction[] {
    const node = item.item;
    if (
      node.kind === 'message' ||
      !selectedBackend().backend.capabilities.commands['reposition-persistent-item']
    ) {
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

  function copyContextNode(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): void {
    const portableNode = createPortableExplorerNode(node);
    if (!portableNode) {
      return;
    }
    rememberClipboardItems([portableNode]);
    void writeSystemClipboardText(serializeClipboardText([portableNode])).catch(() => undefined);
  }

  function cutContextNode(node: Exclude<ExplorerTreeNode, { kind: 'message' }>): void {
    const target = deleteTargetForNode(node);
    const portableNode = createPortableExplorerNode(node);
    if (!target || !portableNode || !selectedBackend().backend.capabilities.commands['delete-tree-item']) {
      return;
    }
    rememberClipboardItems([portableNode]);
    void writeSystemClipboardText(serializeClipboardText([portableNode])).catch(() => undefined);
    navigation.clearSelection();
    runDeleteCommand({ kind: 'delete-tree-item', target, mode: 'subtree' });
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
    return error() ? (
      <TreeStatus tone="error">{formatError(error())}</TreeStatus>
    ) : (
      <TreeStatus>Loading data…</TreeStatus>
    );
  }
}

type ExplorerContextMenuState = Readonly<{
  x: number;
  y: number;
  item: TreeViewItem<ExplorerTreeNode>;
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
          props.onConfirm(props.state.kind === 'prompt' ? input?.value ?? '' : true);
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
            class="h-8 rounded px-3 text-xs font-medium text-white"
            classList={{
              'bg-red-700 hover:bg-red-600': props.state.kind === 'confirm' && props.state.danger,
              'bg-blue-700 hover:bg-blue-600': props.state.kind === 'prompt' || !props.state.danger
            }}
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
        tabIndex={-1}
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
            <section
              class="py-1"
              classList={{ 'border-t border-neutral-700': sectionIndex() > 0 }}
              aria-label={section.label}
            >
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
        x: Math.max(CONTEXT_MENU_VIEWPORT_GAP, Math.min(props.x, window.innerWidth - bounds.width - CONTEXT_MENU_VIEWPORT_GAP)),
        y: Math.max(CONTEXT_MENU_VIEWPORT_GAP, Math.min(props.y, window.innerHeight - bounds.height - CONTEXT_MENU_VIEWPORT_GAP))
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
  return [
    node.title,
    node.kind === 'link' ? node.url : '',
    node.kind === 'link' ? node.description : ''
  ].join('\n').toLocaleLowerCase();
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
    accessibleLabel:
      `Hidden: ${statistics.nodes} nodes, ${statistics.liveWindows} live windows, ${statistics.liveTabs} live tabs`,
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
        statistics.liveTabs +
        descendants.liveTabs +
        (child.kind === 'link' && child.reference.kind === 'tab' ? 1 : 0)
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
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
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
): ExplorerCommand | undefined {
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

function persistentTargetForNode(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>
): PersistentItemTarget {
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
    return [
      ...(ownReference ? [ownReference] : []),
      ...nestedPersistentOrganizerReferences(item.children())
    ];
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

function persistentReferenceForTreeItem(
  item: TreeViewItem<ExplorerTreeNode>
): PersistentItemReference | undefined {
  return item.item.kind === 'message'
    ? undefined
    : persistentItemReference(persistentTargetForNode(item.item));
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

function deleteTargetForNode(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>
): ExplorerDeleteTarget | undefined {
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
  const canPromoteChildren =
    target.kind === 'live-tab' || target.kind === 'live-window' || target.kind === 'saved';
  return canPromoteChildren && item.childCount > 0 && item.isExpanded
    ? 'promote-children'
    : 'subtree';
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

/** Renders a compact action used by an explorer pane toolbar. */
function DeletedItemsHistoryPanel(props: {
  state: DeletionHistoryState;
  onRetry: () => void;
  onRestore: (deletionId: string) => void;
  onClose: () => void;
}) {
  return (
    <aside
      class="absolute top-8 right-2 z-30 max-h-[calc(100%-2.5rem)] w-80 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 p-3 text-xs shadow-xl print:hidden"
      role="dialog"
      aria-label="Deleted items history"
    >
      <div class="mb-2 flex items-center gap-2 border-b border-neutral-700 pb-2">
        <h2 class="font-medium text-neutral-100">Deleted items</h2>
        <button
          type="button"
          class="ml-auto px-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label="Close deleted items history"
          onClick={props.onClose}
        >
          ×
        </button>
      </div>
      <Switch>
        <Match when={props.state.status === 'loading'}>
          <p class="py-2 text-neutral-400" role="status">Loading deleted items…</p>
        </Match>
        <Match when={props.state.status === 'error' ? props.state : undefined}>
          {(state) => (
            <div role="alert">
              <p class="mb-2 text-red-300">{state().message}</p>
              <button
                type="button"
                class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                onClick={props.onRetry}
              >
                Retry
              </button>
            </div>
          )}
        </Match>
        <Match when={props.state.status === 'ready' ? props.state : undefined}>
          {(state) => (
            <Show
              when={state().items.length > 0}
              fallback={<p class="py-2 text-neutral-400">No deleted hierarchies yet.</p>}
            >
              <ol class="space-y-2">
                <For each={state().items}>
                  {(item) => (
                    <li
                      class="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 p-2"
                      data-deletion-id={item.deletionId}
                    >
                      <div class="min-w-0 flex-1">
                        <span class="block truncate text-neutral-200" title={item.title}>{item.title}</span>
                        <span class="block text-neutral-400">
                          {item.itemKind} · {item.nodeCount} {item.nodeCount === 1 ? 'node' : 'nodes'}
                        </span>
                        <span class="block text-neutral-500">
                          {formatDeletionTime(item.deletedAt)} · {item.mode === 'subtree' ? 'complete hierarchy' : 'children retained'}
                        </span>
                      </div>
                      <button
                        type="button"
                        class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                        aria-label={`Restore deleted ${item.title}`}
                        onClick={() => props.onRestore(item.deletionId)}
                      >
                        Restore
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          )}
        </Match>
      </Switch>
    </aside>
  );
}

function formatDeletionTime(deletedAt: number): string {
  return deletedAt > 0 ? formatSnapshotTime(deletedAt) : 'Unknown deletion time';
}

function LocalSnapshotHistoryPanel(props: {
  state: SnapshotHistoryState;
  onRetry: () => void;
  onOpen: (createdAt: number) => void;
  onRestore: (createdAt: number) => void;
  onClose: () => void;
}) {
  return (
    <aside
      class="absolute top-8 right-2 z-30 max-h-[calc(100%-2.5rem)] w-80 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 p-3 text-xs shadow-xl print:hidden"
      role="dialog"
      aria-label="Local backup history"
    >
      <div class="mb-2 flex items-center gap-2 border-b border-neutral-700 pb-2">
        <h2 class="font-medium text-neutral-100">Local backups</h2>
        <button
          type="button"
          class="ml-auto px-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label="Close local backup history"
          onClick={props.onClose}
        >
          ×
        </button>
      </div>
      <Switch>
        <Match when={props.state.status === 'loading'}>
          <p class="py-2 text-neutral-400" role="status">Loading local backups…</p>
        </Match>
        <Match when={props.state.status === 'error' ? props.state : undefined}>
          {(state) => (
            <div role="alert">
              <p class="mb-2 text-red-300">{state().message}</p>
              <button
                type="button"
                class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                onClick={props.onRetry}
              >
                Retry
              </button>
            </div>
          )}
        </Match>
        <Match when={props.state.status === 'ready' ? props.state : undefined}>
          {(state) => (
            <Show
              when={state().snapshots.length > 0}
              fallback={<p class="py-2 text-neutral-400">No local backups yet.</p>}
            >
              <ol class="space-y-2">
                <For each={state().snapshots}>
                  {(snapshot) => (
                    <li
                      class="rounded border border-neutral-700 bg-neutral-950 p-2"
                      data-created-at={snapshot.createdAt}
                    >
                      <div class="mb-2 min-w-0">
                        <time
                          class="block truncate text-neutral-200"
                          dateTime={new Date(snapshot.createdAt).toISOString()}
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
                          onClick={() => props.onOpen(snapshot.createdAt)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                          aria-label={`Restore backup from ${formatSnapshotTime(snapshot.createdAt)}`}
                          onClick={() => props.onRestore(snapshot.createdAt)}
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
        </Match>
      </Switch>
    </aside>
  );
}

function formatSnapshotTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(createdAt);
}

/** Renders provider-neutral cloud connection, scheduling, retention, and recovery controls. */
function CloudBackupPanel(props: {
  providerName: string;
  state: CloudBackupPanelState;
  onRetry: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigurationChange: (configuration: ExplorerCloudBackupConfiguration) => void;
  onSaveConfiguration: () => void;
  onCreate: () => void;
  onOpen: (backupId: string) => void;
  onRestore: (backupId: string) => void;
  onDelete: (backupId: string) => void;
  onClose: () => void;
}) {
  return (
    <aside
      class="absolute top-8 right-2 z-30 max-h-[calc(100%-2.5rem)] w-96 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 p-3 text-xs shadow-xl print:hidden"
      role="dialog"
      aria-label={`${props.providerName} backups`}
    >
      <div class="mb-2 flex items-center gap-2 border-b border-neutral-700 pb-2">
        <h2 class="font-medium text-neutral-100">{props.providerName} backups</h2>
        <button
          type="button"
          class="ml-auto px-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label="Close cloud backups"
          onClick={props.onClose}
        >
          ×
        </button>
      </div>
      <Switch>
        <Match when={props.state.status === 'loading'}>
          <p class="py-2 text-neutral-400" role="status">Loading cloud backups…</p>
        </Match>
        <Match when={props.state.status === 'error' ? props.state : undefined}>
          {(state) => (
            <div role="alert">
              <p class="mb-2 text-red-300">{state().message}</p>
              <button
                type="button"
                class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                onClick={props.onRetry}
              >
                Retry
              </button>
            </div>
          )}
        </Match>
        <Match when={props.state.status === 'ready' ? props.state : undefined}>
          {(state) => (
            <CloudBackupReadyPanel
              state={state()}
              onConnect={props.onConnect}
              onDisconnect={props.onDisconnect}
              onConfigurationChange={props.onConfigurationChange}
              onSaveConfiguration={props.onSaveConfiguration}
              onCreate={props.onCreate}
              onOpen={props.onOpen}
              onRestore={props.onRestore}
              onDelete={props.onDelete}
            />
          )}
        </Match>
      </Switch>
    </aside>
  );
}

function CloudBackupReadyPanel(props: {
  state: Extract<CloudBackupPanelState, { status: 'ready' }>;
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
            onClick={props.onConnect}
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
                onClick={props.onDisconnect}
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
                onClick={props.onSaveConfiguration}
              >
                Save preferences
              </button>
              <button
                type="button"
                class="rounded border border-blue-600 bg-blue-950 px-2 py-1 text-blue-100 hover:bg-blue-900"
                aria-label="Create cloud backup"
                onClick={props.onCreate}
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
                          dateTime={new Date(backup.createdAt).toISOString()}
                          title={new Date(backup.createdAt).toISOString()}
                        >
                          {formatSnapshotTime(backup.createdAt)}
                        </time>
                        <span class="block text-neutral-400">
                          {backup.mode === 'automatic' ? 'Automatic' : 'Manual'}
                          {backup.machineLabel ? ` · ${backup.machineLabel}` : ''}
                        </span>
                        <span class="block text-neutral-500">
                          {backup.nodeCount} {backup.nodeCount === 1 ? 'node' : 'nodes'} · {formatCloudBackupSize(backup.sizeBytes)}
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
        class="h-2 w-2 flex-none rounded-full"
        classList={{
          'bg-neutral-500': indicator().tone === 'none',
          'bg-emerald-500': indicator().tone === 'success',
          'bg-red-500': indicator().tone === 'failure'
        }}
        aria-hidden="true"
      />
      {indicator().label}
    </p>
  );
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

type PaneActionIndicator = Readonly<{
  tone: ExplorerCloudBackupAttempt['status'];
  label: string;
}>;

function cloudBackupAttemptIndicator(attempt: ExplorerCloudBackupAttempt): PaneActionIndicator {
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

function PaneAction(props: {
  title: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  dragProps?: JSX.ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  indicator?: PaneActionIndicator | undefined;
}) {
  return (
    <button
      {...props.dragProps}
      type="button"
      class="h-6 flex-none px-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
      classList={{
        'cursor-grab active:cursor-grabbing': props.dragProps?.draggable === true,
        'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-neutral-400': props.disabled === true
      }}
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
            class="ml-1 inline-block h-1.5 w-3 rounded-sm align-middle"
            classList={{
              'bg-neutral-500': indicator().tone === 'none',
              'bg-emerald-500': indicator().tone === 'success',
              'bg-red-500': indicator().tone === 'failure'
            }}
            aria-hidden="true"
          />
        )}
      </Show>
    </button>
  );
}

function TreeStatus(props: { children: string; tone?: 'muted' | 'error' }) {
  return (
    <p
      class="p-3 text-xs"
      classList={{ 'text-neutral-400': props.tone !== 'error', 'text-red-400': props.tone === 'error' }}
    >
      {props.children}
    </p>
  );
}

function createBrowserBinding(id: string, label: string, backend: ExplorerBackend): BrowserBackendBinding {
  return { kind: 'browser', id, label: () => label, backend, sources: createExplorerSources(backend) };
}

function createDocumentBinding(
  id: string,
  label: Accessor<string>,
  setLabel: (label: string) => void,
  document: DocumentExplorerBackend
): DocumentBackendBinding {
  return {
    kind: 'document',
    id,
    label,
    setLabel,
    backend: document.backend,
    sources: createExplorerSources(document.backend),
    document
  };
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
