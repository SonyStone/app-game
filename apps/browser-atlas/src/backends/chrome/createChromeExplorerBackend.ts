import type { ExplorerBackend, ExplorerCommand } from '../../explorer/backend';
import { FULL_EXPLORER_CAPABILITIES } from '../../explorer/backend';
import type {
  ExplorerSourceId,
  SavedParentKind,
  ExplorerTreeGroupNode,
  ExplorerTreeLinkNode,
  ExplorerTreeNode
} from '../../explorer/model';
import type { PortableExplorerNode } from '../../explorer/portable';
import { portableNodeTitle } from '../../explorer/portable';
import { createExplorerSourceRoot } from '../../explorer/treeFactories';
import { findPersistentTreeLocation } from '../../persistent-tree/model';
import { createInternalChromeTab } from './tabCreation';
import {
  commandTracksPersistentTreeHistory,
  createPersistentTreeUndoHistory,
  recordClosedLiveHistoryNodes
} from '../../persistent-tree/createPersistentTreeUndoHistory';
import { withPersistentTreeMutationLock } from './treeMutationLock';
import {
  loadSavedWindowMarkers,
  SAVED_WINDOW_MARKERS_STORAGE_KEY,
  type SavedWindowMarker
} from './windowMarkers';
import { createGoogleDriveBackups } from './googleDriveBackups';
import {
  createGoogleDocAtPlacement,
  applyPersistentTreeHistorySnapshot,
  createWindowAtPlacement,
  createSavedOrganizer,
  createLocalTreeSnapshot,
  cycleSavedSeparator,
  deleteLiveTab,
  deleteLiveWindow,
  deleteSavedOrganizer,
  flattenPersistentTabs,
  importPersistentItems,
  listDeletedSavedItems,
  listLocalTreeSnapshots,
  readLocalTreeSnapshot,
  readPersistentTreeHistorySnapshot,
  preserveClosedLiveWindow,
  reconcileMovedLiveTab,
  loadSavedItems,
  moveSavedItem,
  repositionPersistentItem,
  moveLiveTabInTree,
  renamePersistentItem,
  restoreSavedTab,
  restoreSavedGroup,
  restoreSavedItemIntoWindow,
  restoreSavedWindow,
  restoreLatestLocalTreeSnapshot,
  restoreDeletedSavedItem,
  restoreLocalTreeSnapshot,
  saveAndCloseAllWindows,
  saveAndCloseTab,
  saveAndCloseWindow,
  SAVED_ITEMS_STORAGE_KEY,
  type SavedGroupRecord,
  type SavedItemRecord,
  type SavedNoteRecord,
  type SavedSeparatorRecord,
  type SavedTabRecord,
  type SavedWindowRecord
} from './savedItems';

/** Creates an explorer backend backed entirely by privileged Chrome extension APIs. */
export function createChromeExplorerBackend(chromeApi: typeof chrome = requireChromeApi()): ExplorerBackend {
  const undoHistory = createPersistentTreeUndoHistory((snapshot) =>
    applyPersistentTreeHistorySnapshot(chromeApi, snapshot)
  );
  return {
    capabilities: FULL_EXPLORER_CAPABILITIES,
    load: (source) => loadTree(chromeApi, source),
    subscribe: (listener) => subscribeToChrome(chromeApi, listener),
    execute: (command) => executeChromeCommand(chromeApi, command, undoHistory),
    undoHistory,
    snapshots: {
      list: () => listLocalTreeSnapshots(chromeApi),
      read: (createdAt) => readLocalTreeSnapshot(chromeApi, createdAt),
      restore: (createdAt) => restoreLocalTreeSnapshot(chromeApi, createdAt)
    },
    deletions: {
      list: () => listDeletedSavedItems(chromeApi),
      restore: (deletionId) => restoreDeletedSavedItem(chromeApi, deletionId)
    },
    cloudBackups: createGoogleDriveBackups(chromeApi)
  };
}

async function loadTree(chromeApi: typeof chrome, source: ExplorerSourceId): Promise<ExplorerTreeNode> {
  switch (source) {
    case 'explore':
      return loadExploreTree(chromeApi);
    case 'bookmarks':
      return loadBookmarksTree(chromeApi);
    case 'history':
      return loadHistoryTree(chromeApi);
    default: {
      const exhaustiveSource: never = source;
      return exhaustiveSource;
    }
  }
}

function subscribeToChrome(chromeApi: typeof chrome, listener: (source: ExplorerSourceId) => void): () => void {
  const refreshExplore = () => listener('explore');
  const refreshBookmarks = () => listener('bookmarks');
  const refreshHistory = () => listener('history');

  chromeApi.tabs.onActivated.addListener(refreshExplore);
  chromeApi.tabs.onAttached.addListener(refreshExplore);
  chromeApi.tabs.onCreated.addListener(refreshExplore);
  chromeApi.tabs.onDetached.addListener(refreshExplore);
  chromeApi.tabs.onMoved.addListener(refreshExplore);
  chromeApi.tabs.onRemoved.addListener(refreshExplore);
  chromeApi.tabs.onReplaced.addListener(refreshExplore);
  chromeApi.tabs.onUpdated.addListener(refreshExplore);
  chromeApi.windows.onCreated.addListener(refreshExplore);
  chromeApi.windows.onFocusChanged.addListener(refreshExplore);
  chromeApi.windows.onRemoved.addListener(refreshExplore);
  const refreshSavedItems = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (
      (areaName === 'local' && changes[SAVED_ITEMS_STORAGE_KEY]) ||
      (areaName === 'session' && changes[SAVED_WINDOW_MARKERS_STORAGE_KEY])
    ) {
      refreshExplore();
    }
  };
  chromeApi.storage.onChanged.addListener(refreshSavedItems);

  chromeApi.bookmarks.onChanged.addListener(refreshBookmarks);
  chromeApi.bookmarks.onChildrenReordered.addListener(refreshBookmarks);
  chromeApi.bookmarks.onCreated.addListener(refreshBookmarks);
  chromeApi.bookmarks.onImportEnded.addListener(refreshBookmarks);
  chromeApi.bookmarks.onMoved.addListener(refreshBookmarks);
  chromeApi.bookmarks.onRemoved.addListener(refreshBookmarks);

  chromeApi.history.onVisited.addListener(refreshHistory);
  chromeApi.history.onVisitRemoved.addListener(refreshHistory);

  return () => {
    chromeApi.tabs.onActivated.removeListener(refreshExplore);
    chromeApi.tabs.onAttached.removeListener(refreshExplore);
    chromeApi.tabs.onCreated.removeListener(refreshExplore);
    chromeApi.tabs.onDetached.removeListener(refreshExplore);
    chromeApi.tabs.onMoved.removeListener(refreshExplore);
    chromeApi.tabs.onRemoved.removeListener(refreshExplore);
    chromeApi.tabs.onReplaced.removeListener(refreshExplore);
    chromeApi.tabs.onUpdated.removeListener(refreshExplore);
    chromeApi.windows.onCreated.removeListener(refreshExplore);
    chromeApi.windows.onFocusChanged.removeListener(refreshExplore);
    chromeApi.windows.onRemoved.removeListener(refreshExplore);
    chromeApi.storage.onChanged.removeListener(refreshSavedItems);

    chromeApi.bookmarks.onChanged.removeListener(refreshBookmarks);
    chromeApi.bookmarks.onChildrenReordered.removeListener(refreshBookmarks);
    chromeApi.bookmarks.onCreated.removeListener(refreshBookmarks);
    chromeApi.bookmarks.onImportEnded.removeListener(refreshBookmarks);
    chromeApi.bookmarks.onMoved.removeListener(refreshBookmarks);
    chromeApi.bookmarks.onRemoved.removeListener(refreshBookmarks);

    chromeApi.history.onVisited.removeListener(refreshHistory);
    chromeApi.history.onVisitRemoved.removeListener(refreshHistory);
  };
}

async function executeChromeCommand(
  chromeApi: typeof chrome,
  command: ExplorerCommand,
  undoHistory: ReturnType<typeof createPersistentTreeUndoHistory>
): Promise<void> {
  await withPersistentTreeMutationLock(async () => {
    if (command.kind === 'undo-persistent-tree') {
      await undoHistory.undo();
      return;
    }
    if (command.kind === 'redo-persistent-tree') {
      await undoHistory.redo();
      return;
    }
    const tracksHistory = commandTracksPersistentTreeHistory(command);
    let beforeSnapshot: Awaited<ReturnType<typeof readPersistentTreeHistorySnapshot>> | undefined;
    if (tracksHistory) {
      const moveSource = command.kind === 'move-tab'
        ? {
            tabId: readNumericId(command.tabId, 'tab'),
            windowId: readNumericId(command.sourceWindowId, 'window'),
            index: command.sourceIndex
          }
        : undefined;
      beforeSnapshot = await readPersistentTreeHistorySnapshot(chromeApi, moveSource);
      undoHistory.capture(beforeSnapshot);
    }
    await executeChromeCommandUnlocked(chromeApi, command);
    if (tracksHistory) {
      if (!beforeSnapshot) {
        throw new Error('Browser Atlas did not capture the initial persistent-tree history state.');
      }
      const moveDestination = command.kind === 'move-tab'
        ? {
            tabId: readNumericId(command.tabId, 'tab'),
            windowId: readNumericId(command.targetWindowId, 'window'),
            index: command.targetIndex
          }
        : undefined;
      const afterSnapshot = await readPersistentTreeHistorySnapshot(chromeApi, moveDestination);
      undoHistory.capture(recordClosedLiveHistoryNodes(beforeSnapshot, afterSnapshot));
    }
  });
}

async function executeChromeCommandUnlocked(chromeApi: typeof chrome, command: ExplorerCommand): Promise<void> {
  switch (command.kind) {
    case 'activate-tab':
      await chromeApi.tabs.update(readNumericId(command.tabId, 'tab'), { active: true });
      await chromeApi.windows.update(readNumericId(command.windowId, 'window'), { focused: true });
      return;
    case 'activate-window':
      await chromeApi.windows.update(readNumericId(command.windowId, 'window'), { focused: true });
      return;
    case 'create-window':
      await chromeApi.windows.create({ focused: true, type: 'normal' });
      return;
    case 'create-window-at-placement':
      await createWindowAtPlacement(chromeApi, command.placement);
      return;
    case 'create-google-doc-at-placement':
      await createGoogleDocAtPlacement(chromeApi, command.placement);
      return;
    case 'create-tree-snapshot':
      await createLocalTreeSnapshot(chromeApi);
      return;
    case 'restore-latest-tree-snapshot':
      await restoreLatestLocalTreeSnapshot(chromeApi);
      return;
    case 'delete-tree-item':
      await deleteChromeTreeItem(chromeApi, command.target, command.mode);
      return;
    case 'save-close-tab':
      await saveAndCloseTab(chromeApi, readNumericId(command.tabId, 'tab'), command.includeDescendants);
      return;
    case 'save-close-window':
      await saveAndCloseWindow(chromeApi, readNumericId(command.windowId, 'window'), command.includeDescendants);
      return;
    case 'save-close-all-windows': {
      const currentTab = await chromeApi.tabs.getCurrent();
      await saveAndCloseAllWindows(chromeApi, currentTab?.windowId);
      return;
    }
    case 'restore-saved-tab':
      await restoreSavedTab(chromeApi, command.savedTabId);
      return;
    case 'restore-saved-window':
      await restoreSavedWindow(chromeApi, command.savedWindowId);
      return;
    case 'restore-saved-window-session':
      await restoreSavedWindow(chromeApi, command.savedWindowId, 'last-session');
      return;
    case 'restore-saved-group':
      await restoreSavedGroup(chromeApi, command.savedGroupId);
      return;
    case 'create-saved-organizer':
      await createSavedOrganizer(
        chromeApi,
        command.itemKind,
        command.placement,
        command.title,
        command.separatorStyle
      );
      return;
    case 'rename-persistent-item':
      await renamePersistentItem(chromeApi, command.item, command.title);
      return;
    case 'cycle-saved-separator':
      await cycleSavedSeparator(chromeApi, command.itemId);
      return;
    case 'delete-saved-organizer':
      await deleteSavedOrganizer(chromeApi, command.itemId, command.mode);
      return;
    case 'undo-persistent-tree':
    case 'redo-persistent-tree':
      throw new Error('Undo and Redo must be handled by the persistent-tree history controller.');
    case 'move-saved-item':
      await moveSavedItem(chromeApi, command.itemId, command.target, command.targetIndex);
      return;
    case 'reposition-persistent-item':
      await repositionPersistentItem(chromeApi, command.item, command.placement);
      return;
    case 'flatten-persistent-tabs':
      await flattenPersistentTabs(chromeApi, command.items);
      return;
    case 'move-tab':
      await moveTabWithRetry(chromeApi, readNumericId(command.tabId, 'tab'), {
        windowId: readNumericId(command.targetWindowId, 'window'),
        index: command.targetIndex
      });
      await reconcileMovedLiveTab(chromeApi, readNumericId(command.tabId, 'tab'));
      await reconcileClosedMoveSourceWindow(chromeApi, readNumericId(command.sourceWindowId, 'window'));
      return;
    case 'move-tab-to-new-window':
      await moveTabToNewWindow(chromeApi, readNumericId(command.tabId, 'tab'));
      await reconcileMovedLiveTab(chromeApi, readNumericId(command.tabId, 'tab'));
      return;
    case 'move-live-tab-in-tree':
      await moveLiveTabInTree(
        chromeApi,
        readNumericId(command.tabId, 'tab'),
        command.target,
        command.targetIndex
      );
      return;
    case 'restore-saved-item-into-window':
      await restoreSavedItemIntoWindow(
        chromeApi,
        command.itemId,
        readNumericId(command.targetWindowId, 'window'),
        command.targetIndex
      );
      return;
    case 'open-tab':
      await createInternalChromeTab(chromeApi, {
        windowId: readNumericId(command.windowId, 'window'),
        index: command.index,
        url: command.url,
        active: false
      });
      return;
    case 'open-link':
      await openChromeLink(chromeApi, command.url, command.target, command.nestUnderActiveTab);
      return;
    case 'move-bookmark':
      if (
        command.itemKind === 'folder' &&
        (await bookmarkContains(chromeApi, command.bookmarkId, command.targetFolderId))
      ) {
        throw new Error('A bookmark folder cannot be moved into one of its descendants.');
      }
      await chromeApi.bookmarks.move(command.bookmarkId, {
        parentId: command.targetFolderId,
        index: command.targetIndex
      });
      return;
    case 'create-bookmark':
      await chromeApi.bookmarks.create({
        parentId: command.folderId,
        index: command.index,
        title: command.title,
        url: command.url
      });
      return;
    case 'import-items':
      await importChromeItems(chromeApi, command.target, command.index, command.items);
      return;
    case 'move-document-node':
      throw new Error('Chrome cannot move a JSON document node.');
    default: {
      const exhaustiveCommand: never = command;
      throw new Error(`Unsupported explorer command: ${String(exhaustiveCommand)}`);
    }
  }
}

async function reconcileClosedMoveSourceWindow(chromeApi: typeof chrome, sourceWindowId: number): Promise<void> {
  const sourceWindow = await chromeApi.windows.get(sourceWindowId).catch(() => undefined);
  if (!sourceWindow) {
    await preserveClosedLiveWindow(chromeApi, sourceWindowId);
  }
}

async function openChromeLink(
  chromeApi: typeof chrome,
  url: string,
  target: Extract<ExplorerCommand, { kind: 'open-link' }>['target'],
  nestUnderActiveTab: boolean
): Promise<void> {
  switch (target) {
    case 'new-window':
      await chromeApi.windows.create({ focused: true, type: 'normal', url });
      return;
    case 'last-focused-window': {
      const window = await chromeApi.windows.getLastFocused({ windowTypes: ['normal'] });
      if (window.id === undefined) {
        await chromeApi.windows.create({ focused: true, type: 'normal', url });
        return;
      }
      const [activeTab] = nestUnderActiveTab
        ? await chromeApi.tabs.query({ active: true, windowId: window.id })
        : [];
      await chromeApi.tabs.create({
        windowId: window.id,
        url,
        active: true,
        ...(activeTab?.id !== undefined ? { openerTabId: activeTab.id } : {})
      });
      await chromeApi.windows.update(window.id, { focused: true });
      return;
    }
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

async function deleteChromeTreeItem(
  chromeApi: typeof chrome,
  target: Extract<ExplorerCommand, { kind: 'delete-tree-item' }>['target'],
  mode: Extract<ExplorerCommand, { kind: 'delete-tree-item' }>['mode']
): Promise<void> {
  switch (target.kind) {
    case 'live-tab':
      await deleteLiveTab(chromeApi, readNumericId(target.id, 'tab'), mode);
      return;
    case 'live-window':
      await deleteLiveWindow(chromeApi, readNumericId(target.id, 'window'), mode);
      return;
    case 'saved':
      await deleteSavedOrganizer(chromeApi, target.id, mode);
      return;
    case 'bookmark':
      if (target.itemKind === 'folder') {
        await chromeApi.bookmarks.removeTree(target.id);
      } else {
        await chromeApi.bookmarks.remove(target.id);
      }
      return;
    case 'document':
      throw new Error('Chrome cannot delete a JSON document node.');
    default: {
      const exhaustiveTarget: never = target;
      throw new Error(`Unsupported Chrome deletion target: ${String(exhaustiveTarget)}`);
    }
  }
}

async function importChromeItems(
  chromeApi: typeof chrome,
  target: Extract<ExplorerCommand, { kind: 'import-items' }>['target'],
  index: number,
  items: readonly PortableExplorerNode[]
): Promise<void> {
  if (target.kind === 'persistent') {
    await importPersistentItems(chromeApi, target.target, index, items);
    return;
  }
  if (target.kind === 'window') {
    const urls = items.flatMap(collectPortableLinks).map((link) => link.url);
    for (const [offset, url] of urls.entries()) {
      await createInternalChromeTab(chromeApi, {
        windowId: readNumericId(target.id, 'window'),
        index: index + offset,
        url,
        active: false
      });
    }
    return;
  }

  if (target.kind === 'bookmark-folder') {
    for (const [offset, item] of items.entries()) {
      await importChromeBookmark(chromeApi, target.id, index + offset, item);
    }
    return;
  }

  throw new Error('Chrome cannot import into a JSON document destination.');
}

async function importChromeBookmark(
  chromeApi: typeof chrome,
  parentId: string,
  index: number,
  item: PortableExplorerNode
): Promise<void> {
  if (item.kind === 'link' && item.children.length === 0) {
    await chromeApi.bookmarks.create({ parentId, index, title: item.title, url: item.url });
    return;
  }

  const folder = await chromeApi.bookmarks.create({ parentId, index, title: portableNodeTitle(item) });
  let childIndex = 0;
  if (item.kind === 'link') {
    await chromeApi.bookmarks.create({ parentId: folder.id, index: childIndex, title: item.title, url: item.url });
    childIndex += 1;
  }
  for (const child of item.children) {
    await importChromeBookmark(chromeApi, folder.id, childIndex, child);
    childIndex += 1;
  }
}

function collectPortableLinks(node: PortableExplorerNode): Extract<PortableExplorerNode, { kind: 'link' }>[] {
  return [...(node.kind === 'link' ? [node] : []), ...node.children.flatMap(collectPortableLinks)];
}

async function loadExploreTree(chromeApi: typeof chrome): Promise<ExplorerTreeNode> {
  const [windows, savedItems, savedWindowMarkers] = await Promise.all([
    chromeApi.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] }),
    loadSavedItems(chromeApi),
    loadSavedWindowMarkers(chromeApi)
  ]);
  const renderContext = {
    savedItems,
    browserWindowsById: new Map(
      windows.flatMap((browserWindow): readonly [number, chrome.windows.Window][] =>
        browserWindow.id === undefined ? [] : [[browserWindow.id, browserWindow]]
      )
    ),
    browserTabsById: new Map(
      windows.flatMap((browserWindow) =>
        (browserWindow.tabs ?? []).flatMap((tab): readonly [number, chrome.tabs.Tab][] =>
          tab.id === undefined ? [] : [[tab.id, tab]]
        )
      )
    ),
    savedWindowMarkers
  } satisfies ChromeTreeRenderContext;
  const representedWindowIds = new Set<number>();
  const children: ExplorerTreeNode[] = savedItems.flatMap((item, index): readonly ExplorerTreeNode[] => {
    if (!isPersistentLiveWindow(item)) {
      return [];
    }
    const browserWindow = renderContext.browserWindowsById.get(item.binding.windowId);
    if (!browserWindow) {
      return [];
    }
    representedWindowIds.add(item.binding.windowId);
    return [
      createLiveWindowNode(
        chromeApi,
        browserWindow,
        index,
        renderContext,
        item.customTitle === true ? item.title : undefined
      )
    ];
  });
  for (const browserWindow of windows) {
    if (browserWindow.id === undefined || representedWindowIds.has(browserWindow.id)) {
      continue;
    }
    const liveShadow = findPersistentLiveWindow(savedItems, browserWindow.id);
    const location = liveShadow ? findPersistentTreeLocation(savedItems, liveShadow.id) : undefined;
    if (liveShadow && location?.parentId !== null) {
      continue;
    }
    children.push(
      createLiveWindowNode(
        chromeApi,
        browserWindow,
        children.length,
        renderContext,
        liveShadow?.customTitle === true ? liveShadow.title : undefined
      )
    );
  }
  const retainedItems = savedItems.filter((node) => !isPersistentLiveWindow(node));
  if (retainedItems.length > 0) {
    children.push(createSavedItemsGroup(chromeApi, retainedItems, children.length, renderContext));
  }

  return createExplorerSourceRoot('explore', 'Open tabs', children, true);
}

type ChromeTreeRenderContext = Readonly<{
  savedItems: readonly SavedItemRecord[];
  browserWindowsById: ReadonlyMap<number, chrome.windows.Window>;
  browserTabsById: ReadonlyMap<number, chrome.tabs.Tab>;
  savedWindowMarkers: ReadonlyMap<string, SavedWindowMarker>;
}>;

function createLiveWindowNode(
  chromeApi: typeof chrome,
  browserWindow: chrome.windows.Window,
  index: number,
  context: ChromeTreeRenderContext,
  title?: string
): ExplorerTreeGroupNode {
  const windowId = String(browserWindow.id ?? index);
  const liveShadow =
    browserWindow.id === undefined
      ? undefined
      : findPersistentLiveWindow(context.savedItems, browserWindow.id);
  const liveTabs = [...(browserWindow.tabs ?? [])]
    .sort((left, right) => left.index - right.index)
    .flatMap((tab) => {
      const shadowTab = tab.id === undefined ? undefined : findPersistentLiveTab(context.savedItems, tab.id);
      const shadowLocation = shadowTab
        ? findPersistentTreeLocation(context.savedItems, shadowTab.id)
        : undefined;
      if (shadowTab && shadowLocation?.parentId !== liveShadow?.id) {
        return [];
      }
      const persistentChildren = shadowTab
        ? shadowTab.children.map((child, childIndex) =>
            createSavedItemNode(chromeApi, child, childIndex, { id: shadowTab.id, kind: 'tab' }, context)
          )
        : [];
      return [
        createTabNode(
          chromeApi,
          tab,
          persistentChildren,
          tab.index,
          shadowTab?.keepOnClose === true,
          shadowTab ? protectsLiveTab(shadowTab) : false
        )
      ];
    });
  const windowAttachments = (liveShadow?.children ?? []).flatMap((node, attachmentIndex) =>
    isPersistentLiveTab(node)
      ? []
      : [
          createSavedItemNode(
            chromeApi,
            node,
            liveTabs.length + attachmentIndex,
            { id: liveShadow?.id ?? null, kind: 'window' },
            context
          )
        ]
  );

  return {
    id: `explore-window-${windowId}`,
    kind: 'group',
    groupKind: 'window',
    source: 'explore',
    reference: { kind: 'window', id: windowId, focused: browserWindow.focused },
    index,
    draggable: true,
    acceptsDrop: true,
    title: `${title ?? `Window ${index + 1}`}${browserWindow.focused ? ' (focused)' : ''}`,
    children: [...liveTabs, ...windowAttachments],
    defaultCollapsed: false,
    ...(liveShadow && protectsLiveWindow(context.savedItems, liveShadow) ? { protectedFromClose: true } : {})
  };
}

type LiveWindowRecord = SavedWindowRecord & Readonly<{
  binding: { state: 'live'; windowId: number; focused: boolean };
}>;

function findPersistentLiveWindow(nodes: readonly SavedItemRecord[], windowId: number): LiveWindowRecord | undefined {
  for (const node of nodes) {
    if (isPersistentLiveWindow(node) && node.binding.windowId === windowId) {
      return node;
    }
    const descendant = findPersistentLiveWindow(node.children, windowId);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

function isPersistentLiveWindow(node: SavedItemRecord): node is LiveWindowRecord {
  return node.kind === 'window' && node.binding.state === 'live';
}

type LiveTabRecord = SavedTabRecord & Readonly<{
  binding: { state: 'live'; tabId: number; windowId: number; index: number };
}>;

function findPersistentLiveTab(nodes: readonly SavedItemRecord[], tabId: number): LiveTabRecord | undefined {
  for (const node of nodes) {
    if (isPersistentLiveTab(node) && node.binding.tabId === tabId) {
      return node;
    }
    const descendant = findPersistentLiveTab(node.children, tabId);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

function isPersistentLiveTab(node: SavedItemRecord): node is LiveTabRecord {
  return node.kind === 'tab' && node.binding.state === 'live';
}

function createSavedItemsGroup(
  chromeApi: typeof chrome,
  savedItems: readonly SavedItemRecord[],
  index: number,
  context: ChromeTreeRenderContext
): ExplorerTreeGroupNode {
  return {
    id: 'explore-saved-items',
    kind: 'group',
    groupKind: 'folder',
    source: 'explore',
    reference: { kind: 'saved-items' },
    index,
    draggable: false,
    acceptsDrop: true,
    title: 'Saved items',
    children: savedItems.map((item, itemIndex) =>
      createSavedItemNode(chromeApi, item, itemIndex, { id: null, kind: 'root' }, context)
    ),
    defaultCollapsed: false
  };
}

type SavedItemParent = Readonly<{ id: string | null; kind: SavedParentKind }>;

function createSavedItemNode(
  chromeApi: typeof chrome,
  item: SavedItemRecord,
  index: number,
  parent: SavedItemParent,
  context: ChromeTreeRenderContext
): ExplorerTreeGroupNode | ExplorerTreeLinkNode {
  if (isPersistentLiveWindow(item)) {
    const browserWindow = context.browserWindowsById.get(item.binding.windowId);
    if (browserWindow) {
      return createLiveWindowNode(
        chromeApi,
        browserWindow,
        index,
        context,
        item.customTitle === true ? item.title : undefined
      );
    }
  }
  const children = item.children.map((child, childIndex) =>
    createSavedItemNode(chromeApi, child, childIndex, { id: item.id, kind: item.kind }, context)
  );
  switch (item.kind) {
    case 'tab': {
      const browserTab = item.binding.state === 'live' ? context.browserTabsById.get(item.binding.tabId) : undefined;
      if (browserTab) {
        return createTabNode(
          chromeApi,
          browserTab,
          children,
          index,
          item.keepOnClose === true,
          protectsLiveTab(item)
        );
      }
      return createSavedTabNode(chromeApi, item, index, parent, children);
    }
    case 'window':
      return createSavedWindowNode(item, index, parent, children, context.savedWindowMarkers.get(item.id));
    case 'group':
      return createSavedGroupNode(item, index, parent, children);
    case 'note':
      return createSavedNoteNode(item, index, parent, children);
    case 'separator':
      return createSavedSeparatorNode(item, index, parent, children);
    default: {
      const exhaustiveItem: never = item;
      return exhaustiveItem;
    }
  }
}

function createSavedGroupNode(
  group: SavedGroupRecord,
  index: number,
  parent: SavedItemParent,
  children: ExplorerTreeNode[]
): ExplorerTreeGroupNode {
  return {
    id: `explore-saved-group-${group.id}`,
    kind: 'group',
    groupKind: 'group',
    source: 'explore',
    reference: { kind: 'saved-group', id: group.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    acceptsDrop: true,
    title: group.title,
    children,
    defaultCollapsed: false
  };
}

function createSavedNoteNode(
  note: SavedNoteRecord,
  index: number,
  parent: SavedItemParent,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  return {
    id: `explore-saved-note-${note.id}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'saved-note', id: note.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    title: note.text,
    url: null,
    faviconUrl: null,
    description: 'Persistent note',
    children,
    defaultCollapsed: false
  };
}

function createSavedSeparatorNode(
  separator: SavedSeparatorRecord,
  index: number,
  parent: SavedItemParent,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  return {
    id: `explore-saved-separator-${separator.id}`,
    kind: 'link',
    source: 'explore',
    reference: {
      kind: 'saved-separator',
      id: separator.id,
      parentId: parent.id,
      parentKind: parent.kind,
      style: separator.style
    },
    index,
    draggable: true,
    title: SEPARATOR_TITLES[separator.style],
    url: null,
    faviconUrl: null,
    description: 'Persistent separator',
    children,
    defaultCollapsed: false
  };
}

function createSavedWindowNode(
  savedWindow: SavedWindowRecord,
  index: number,
  parent: SavedItemParent,
  children: ExplorerTreeNode[],
  transientStatus?: SavedWindowMarker
): ExplorerTreeGroupNode {
  return {
    id: `explore-saved-window-${savedWindow.id}`,
    kind: 'group',
    groupKind: 'window',
    source: 'explore',
    reference: { kind: 'saved-window', id: savedWindow.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    acceptsDrop: true,
    title: savedWindow.title,
    children,
    defaultCollapsed: false,
    ...(transientStatus ? { transientStatus } : {})
  };
}

function createSavedTabNode(
  chromeApi: typeof chrome,
  savedTab: SavedTabRecord,
  index: number,
  parent: SavedItemParent,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  return {
    id: `explore-saved-tab-${savedTab.id}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'saved-tab', id: savedTab.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    title: savedTab.title,
    url: savedTab.url,
    faviconUrl: createFaviconUrl(chromeApi, savedTab.url),
    description: `${savedTab.binding.state === 'crashed' ? 'Crash-recovered' : 'Saved'} tab · ${savedTab.url}`,
    children,
    defaultCollapsed: false,
    ...(savedTab.keepOnClose === true ? { keepOnClose: true } : {})
  };
}

function createTabNode(
  chromeApi: typeof chrome,
  tab: chrome.tabs.Tab,
  children: ExplorerTreeNode[] = [],
  index = tab.index,
  keepOnClose = false,
  protectedFromClose = false
): ExplorerTreeLinkNode {
  const url = tab.url ?? tab.pendingUrl ?? null;
  const tabId = String(tab.id ?? `${tab.windowId}-${tab.index}`);
  return {
    id: `explore-tab-${tabId}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'tab', id: tabId, windowId: String(tab.windowId) },
    index,
    draggable: tab.id !== undefined,
    title: tab.title || url || 'Untitled tab',
    url,
    faviconUrl: createFaviconUrl(chromeApi, url),
    description: `${tab.active ? 'Active tab · ' : ''}${url ?? 'URL unavailable'}`,
    children,
    defaultCollapsed: false,
    ...(tab.active ? { active: true } : {}),
    ...(keepOnClose ? { keepOnClose: true } : {}),
    ...(protectedFromClose ? { protectedFromClose: true } : {})
  };
}

function protectsLiveTab(tab: SavedTabRecord): boolean {
  if (tab.binding.state !== 'live') {
    return false;
  }
  const windowId = tab.binding.windowId;
  return tab.keepOnClose === true || tab.children.some((child) => !isUnmarkedLiveTab(child, windowId));
}

function protectsLiveWindow(nodes: readonly SavedItemRecord[], window: LiveWindowRecord): boolean {
  const location = findPersistentTreeLocation(nodes, window.id);
  return (
    window.customTitle === true ||
    (location !== undefined && location.parentId !== null) ||
    window.children.some((child) => !isUnmarkedLiveTab(child, window.binding.windowId))
  );
}

function isUnmarkedLiveTab(node: SavedItemRecord, windowId: number): boolean {
  return (
    isPersistentLiveTab(node) &&
    node.binding.windowId === windowId &&
    node.children.length === 0 &&
    node.keepOnClose !== true
  );
}

async function loadBookmarksTree(chromeApi: typeof chrome): Promise<ExplorerTreeNode> {
  const [root] = await chromeApi.bookmarks.getTree();
  const children = root?.children?.map((node) => createBookmarkNode(chromeApi, node, 0)) ?? [];
  return createExplorerSourceRoot('bookmarks', 'Bookmarks', children);
}

function createBookmarkNode(
  chromeApi: typeof chrome,
  node: chrome.bookmarks.BookmarkTreeNode,
  depth: number
): ExplorerTreeNode {
  if (node.url !== undefined) {
    return {
      id: `bookmarks-link-${node.id}`,
      kind: 'link',
      source: 'bookmarks',
      reference: { kind: 'bookmark', id: node.id, folderId: node.parentId ?? '' },
      index: node.index ?? 0,
      draggable: node.parentId !== undefined && node.unmodifiable === undefined,
      title: node.title || node.url,
      url: node.url,
      faviconUrl: createFaviconUrl(chromeApi, node.url),
      description: node.url,
      children: [],
      defaultCollapsed: false
    };
  }

  return {
    id: `bookmarks-folder-${node.id}`,
    kind: 'group',
    groupKind: 'folder',
    source: 'bookmarks',
    reference: { kind: 'bookmark-folder', id: node.id, parentId: node.parentId ?? null },
    index: node.index ?? 0,
    draggable: depth > 0 && node.parentId !== undefined && node.unmodifiable === undefined,
    acceptsDrop: node.unmodifiable === undefined,
    title: node.title || 'Bookmarks',
    children: node.children?.map((child) => createBookmarkNode(chromeApi, child, depth + 1)) ?? [],
    defaultCollapsed: depth > 0
  };
}

async function loadHistoryTree(chromeApi: typeof chrome): Promise<ExplorerTreeNode> {
  const items = await chromeApi.history.search({ text: '', startTime: 0, maxResults: HISTORY_MAX_RESULTS });
  const groups = new Map<string, { title: string; items: chrome.history.HistoryItem[] }>();

  for (const item of items.sort((left, right) => (right.lastVisitTime ?? 0) - (left.lastVisitTime ?? 0))) {
    const date = new Date(item.lastVisitTime ?? 0);
    const key = createLocalDateKey(date);
    const group = groups.get(key) ?? { title: historyDateFormatter.format(date), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const children = [...groups.entries()].map(([dateKey, group], index) => ({
    id: `history-date-${dateKey}`,
    kind: 'group',
    groupKind: 'date',
    source: 'history',
    reference: { kind: 'history-date', id: dateKey },
    index,
    draggable: true,
    acceptsDrop: false,
    title: group.title,
    children: group.items.flatMap((item, itemIndex) => {
      if (!item.url) {
        return [];
      }

      const visitTime = item.lastVisitTime ?? 0;
      return [
        {
          id: `history-link-${item.id}-${visitTime}`,
          kind: 'link',
          source: 'history',
          reference: { kind: 'history', id: item.id },
          index: itemIndex,
          draggable: true,
          title: item.title || item.url,
          url: item.url,
          faviconUrl: createFaviconUrl(chromeApi, item.url),
          description: `${historyTimeFormatter.format(new Date(visitTime))} · ${item.visitCount ?? 0} visits`,
          children: [],
          defaultCollapsed: false
        } satisfies ExplorerTreeLinkNode
      ];
    }),
    defaultCollapsed: index > 0
  })) satisfies ExplorerTreeGroupNode[];

  return createExplorerSourceRoot('history', 'History', children);
}

async function moveTabWithRetry(
  chromeApi: typeof chrome,
  tabId: number,
  target: { windowId: number; index: number },
  retriesRemaining = 4
): Promise<void> {
  try {
    await chromeApi.tabs.move(tabId, target);
  } catch (reason: unknown) {
    if (retriesRemaining > 0 && String(reason).includes('Tabs cannot be edited right now')) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await moveTabWithRetry(chromeApi, tabId, target, retriesRemaining - 1);
      return;
    }
    throw reason;
  }
}

/** Detaches one existing tab into a new normal Chromium window. */
async function moveTabToNewWindow(chromeApi: typeof chrome, tabId: number): Promise<void> {
  const createdWindow = await chromeApi.windows.create({ focused: true, tabId });
  if (createdWindow?.id === undefined) {
    throw new Error('Chromium did not create a window for the selected tab.');
  }
}

async function bookmarkContains(chromeApi: typeof chrome, folderId: string, candidateId: string): Promise<boolean> {
  const [folder] = await chromeApi.bookmarks.getSubTree(folderId);
  return folder ? containsBookmark(folder, candidateId) : false;
}

function containsBookmark(node: chrome.bookmarks.BookmarkTreeNode, candidateId: string): boolean {
  return node.id === candidateId || (node.children?.some((child) => containsBookmark(child, candidateId)) ?? false);
}

function readNumericId(id: string, kind: 'tab' | 'window'): number {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    throw new Error(`The Chrome ${kind} ID is invalid: ${id}`);
  }
  return numericId;
}

function requireChromeApi(): typeof chrome {
  if (
    typeof chrome === 'undefined' ||
    !chrome.runtime?.id ||
    !chrome.tabs ||
    !chrome.windows ||
    !chrome.storage ||
    !chrome.bookmarks ||
    !chrome.history
  ) {
    throw new Error('The Chrome explorer backend requires an extension context.');
  }
  return chrome;
}

function createFaviconUrl(chromeApi: typeof chrome, pageUrl: string | null): string | null {
  if (!pageUrl) {
    return null;
  }

  const faviconUrl = new URL(chromeApi.runtime.getURL('/_favicon/'));
  faviconUrl.searchParams.set('pageUrl', pageUrl);
  faviconUrl.searchParams.set('size', '16');
  return faviconUrl.toString();
}

function createLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const HISTORY_MAX_RESULTS = 1_000;

const SEPARATOR_TITLES = ['────────────────', '════════════════', '┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄'] as const;

const historyDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

const historyTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit'
});
