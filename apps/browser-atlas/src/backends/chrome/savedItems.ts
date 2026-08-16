import {
  createPersistentTreeDocument,
  findPersistentTreeLocation,
  findPersistentTreeNode,
  flattenPersistentTabsHierarchy,
  insertPersistentTreeNode,
  isPersistentTreeDocument,
  movePersistentTreeNode,
  removePersistentTreeNode,
  type PersistentGroupNode,
  type PersistentNoteNode,
  type PersistentSeparatorNode,
  type PersistentTabNode,
  type PersistentTreeDocument,
  type PersistentTreeNode,
  type PersistentWindowBounds,
  type PersistentWindowNode,
  updatePersistentTreeNode
} from '../../persistent-tree/model';
import { readBrowserAtlasSettings } from '../../settings';
import type {
  ExplorerDeleteMode,
  ExplorerTreeSnapshotSummary,
  PersistentItemReference,
  PersistentItemTarget,
  PersistentMovePlacement,
  PersistentOrganizerPlacement
} from '../../explorer/backend';
import type {
  PersistentTreeHistorySnapshot,
  PersistentTreeHistoryTabPlacement
} from '../../persistent-tree/createPersistentTreeUndoHistory';
import type { PortableExplorerNode } from '../../explorer/portable';
import {
  createExplorerDocumentFromPersistent,
  createPersistentNodesFromPortable
} from '../../persistent-tree/portable';
import {
  appendPersistentTreeDeletion,
  createPersistentTreeDeletion,
  parsePersistentTreeDeletions,
  restorePersistentTreeDeletion,
  summarizePersistentTreeDeletions,
  type PersistentTreeDeletion
} from '../../persistent-tree/deletions';
import {
  appendPersistentTreeSnapshot,
  createPersistentTreeSnapshot,
  parsePersistentTreeSnapshots,
  summarizePersistentTreeSnapshots,
  shouldCreateAutomaticSnapshot
} from '../../persistent-tree/snapshots';
import { createInternalChromeTab } from './tabCreation';
import { markSavedWindows } from './windowMarkers';

/** A saved item is a Persistent Tree v2 node with arbitrary descendants. */
export type SavedItemRecord = PersistentTreeNode;

/** A retained tab in Persistent Tree v2. */
export type SavedTabRecord = PersistentTabNode;

/** A retained window in Persistent Tree v2. */
export type SavedWindowRecord = PersistentWindowNode;

/** A user-created organizational branch in Persistent Tree v2. */
export type SavedGroupRecord = PersistentGroupNode;

/** A user-created annotation in Persistent Tree v2. */
export type SavedNoteRecord = PersistentNoteNode;

/** One of the three visual separators supported by the original Tabs Outliner. */
export type SavedSeparatorRecord = PersistentSeparatorNode;

/** Storage key observed by the Chrome backend for Persistent Tree v2 changes. */
export const SAVED_ITEMS_STORAGE_KEY = 'browserAtlas.persistentTree.v2';

/** Bounded durable deletion archive, independent from session-scoped Undo/Redo. */
export const DELETED_ITEMS_STORAGE_KEY = 'browserAtlas.deletedItems.v1';

/** Storage key for the bounded local Persistent Tree snapshot history. */
export const LOCAL_TREE_SNAPSHOTS_STORAGE_KEY = 'browserAtlas.localTreeSnapshots.v1';

const GOOGLE_DOC_CREATE_URL = 'https://docs.google.com/document/create';

/** Loads one validated Persistent Tree v2 document, ignoring malformed extension-local data. */
export async function loadSavedItems(chromeApi: typeof chrome): Promise<readonly SavedItemRecord[]> {
  const result = await chromeApi.storage.local.get(SAVED_ITEMS_STORAGE_KEY);
  const value: unknown = result[SAVED_ITEMS_STORAGE_KEY];
  return isPersistentTreeDocument(value) ? value.roots : [];
}

/** Saves the current complete persistent tree as a manual local recovery point. */
export async function createLocalTreeSnapshot(chromeApi: typeof chrome): Promise<void> {
  const [roots, storage] = await Promise.all([
    loadSavedItems(chromeApi),
    chromeApi.storage.local.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY)
  ]);
  const snapshots = parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]);
  await chromeApi.storage.local.set({
    [LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]: appendPersistentTreeSnapshot(
      snapshots,
      createPersistentTreeSnapshot(createPersistentTreeDocument(roots))
    )
  });
}

/** Lists local tree recovery points from newest to oldest. */
export async function listLocalTreeSnapshots(
  chromeApi: typeof chrome
): Promise<readonly ExplorerTreeSnapshotSummary[]> {
  const storage = await chromeApi.storage.local.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY);
  return summarizePersistentTreeSnapshots(
    parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY])
  );
}

/** Reads one local recovery point as a detached tree without consuming or restoring it. */
export async function readLocalTreeSnapshot(chromeApi: typeof chrome, createdAt: number) {
  const storage = await chromeApi.storage.local.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY);
  const snapshots = parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]);
  const snapshot = snapshots[findSnapshotIndex(snapshots, createdAt)];
  if (!snapshot) {
    throw new Error('The selected local Browser Atlas snapshot is no longer available.');
  }
  return createExplorerDocumentFromPersistent(
    snapshot.document,
    `Local backup · ${new Date(snapshot.createdAt).toLocaleString()}`
  );
}

/** Replaces the persistent tree with one selected recovery point and consumes it. */
export async function restoreLocalTreeSnapshot(
  chromeApi: typeof chrome,
  createdAt: number
): Promise<void> {
  const storage = await chromeApi.storage.local.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY);
  const snapshots = parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]);
  const snapshotIndex = findSnapshotIndex(snapshots, createdAt);
  const snapshot = snapshots[snapshotIndex];
  if (!snapshot) {
    throw new Error('The selected local Browser Atlas snapshot is no longer available.');
  }
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: snapshot.document,
    [LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]: snapshots.filter((_, index) => index !== snapshotIndex)
  });
}

/** Replaces the persistent tree with the newest local snapshot and consumes that recovery point. */
export async function restoreLatestLocalTreeSnapshot(chromeApi: typeof chrome): Promise<void> {
  const storage = await chromeApi.storage.local.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY);
  const snapshots = parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]);
  const snapshot = snapshots.at(-1);
  if (!snapshot) {
    throw new Error('There is no local Browser Atlas snapshot to restore.');
  }
  await restoreLocalTreeSnapshot(chromeApi, snapshot.createdAt);
}

function findSnapshotIndex(
  snapshots: readonly { createdAt: number }[],
  createdAt: number
): number {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index]?.createdAt === createdAt) {
      return index;
    }
  }
  return -1;
}

/** Persists a tab and, when requested, every live browser item hidden beneath its collapsed row. */
export async function saveAndCloseTab(
  chromeApi: typeof chrome,
  tabId: number,
  includeDescendants = false
): Promise<void> {
  if (includeDescendants) {
    const roots = await loadSavedItems(chromeApi);
    const liveShadow = findLiveTab(roots, tabId);
    if (liveShadow) {
      await saveAndCloseLiveDescendants(chromeApi, liveShadow.children);
    }
  }
  await saveAndCloseTabOnly(chromeApi, tabId);
}

async function saveAndCloseTabOnly(chromeApi: typeof chrome, tabId: number): Promise<void> {
  const [tab, roots] = await Promise.all([chromeApi.tabs.get(tabId), loadSavedItems(chromeApi)]);
  const liveShadow = findLiveTab(roots, tabId);
  const savedTab = createSavedTab(tab, liveShadow);
  const nextRoots = liveShadow
    ? updatePersistentTreeNode(roots, liveShadow.id, () => savedTab)
    : [...roots, savedTab];
  await writeSavedItems(chromeApi, nextRoots);

  try {
    await chromeApi.tabs.remove(tabId);
  } catch (reason: unknown) {
    await writeSavedItems(chromeApi, roots);
    throw reason;
  }
}

/** Persists a window and optionally closes live browser items nested under it from other windows. */
export async function saveAndCloseWindow(
  chromeApi: typeof chrome,
  windowId: number,
  includeDescendants = false
): Promise<string> {
  if (includeDescendants) {
    const roots = await loadSavedItems(chromeApi);
    const liveShadow = findLiveWindow(roots, windowId);
    if (liveShadow) {
      await saveAndCloseLiveDescendants(chromeApi, liveShadow.children, new Set([windowId]));
    }
  }
  return saveAndCloseWindowOnly(chromeApi, windowId);
}

async function saveAndCloseWindowOnly(chromeApi: typeof chrome, windowId: number): Promise<string> {
  const [browserWindow, roots] = await Promise.all([
    chromeApi.windows.get(windowId, { populate: true }),
    loadSavedItems(chromeApi)
  ]);
  const restorableTabs = (browserWindow.tabs ?? []).filter((tab) => tab.url ?? tab.pendingUrl);
  if (restorableTabs.length === 0) {
    throw new Error('This window has no restorable tabs to save.');
  }
  const ensured = await ensureLiveWindowShadow(chromeApi, roots, windowId, browserWindow);
  const retention = createRetention();
  const activeTab = browserWindow.tabs?.find((tab) => tab.active);
  const gatheredRoots = attachRootLiveTabsToWindow(ensured.roots, windowId, ensured.window.id);
  const retainedRoots = retainClosedWindowTabs(gatheredRoots, windowId, retention.savedAt, retention.sessionId);
  const nextRoots = updatePersistentTreeNode(retainedRoots, ensured.window.id, (node) => {
    if (!isLiveSavedWindow(node)) {
      throw new Error('The window selected for Save & Close changed before it could be retained.');
    }
    const bounds = readWindowBounds(browserWindow) ?? node.bounds;
    return {
      ...node,
      title:
        node.customTitle === true
          ? node.title
          : activeTab?.title || activeTab?.url || `Saved window (${restorableTabs.length} tabs)`,
      ...(bounds ? { bounds } : {}),
      binding: { state: 'saved', ...retention }
    };
  });
  await writeSavedItems(chromeApi, nextRoots);

  try {
    await chromeApi.windows.remove(windowId);
  } catch (reason: unknown) {
    await writeSavedItems(chromeApi, roots);
    throw reason;
  }
  return ensured.window.id;
}

async function saveAndCloseLiveDescendants(
  chromeApi: typeof chrome,
  nodes: readonly SavedItemRecord[],
  enclosingWindowIds: ReadonlySet<number> = new Set()
): Promise<void> {
  const resources = collectLiveBrowserResources(nodes);
  const closingWindowIds = new Set([...enclosingWindowIds, ...resources.windowIds]);
  for (const tab of resources.tabs) {
    if (!closingWindowIds.has(tab.windowId)) {
      await saveAndCloseTabOnly(chromeApi, tab.tabId);
    }
  }
  for (const windowId of resources.windowIds) {
    await saveAndCloseWindowOnly(chromeApi, windowId);
  }
}

function collectLiveBrowserResources(nodes: readonly SavedItemRecord[]): Readonly<{
  windowIds: readonly number[];
  tabs: readonly Readonly<{ tabId: number; windowId: number }>[];
}> {
  const windowIds = new Set<number>();
  const tabs = new Map<number, Readonly<{ tabId: number; windowId: number }>>();
  visit(nodes);
  return { windowIds: [...windowIds], tabs: [...tabs.values()] };

  function visit(items: readonly SavedItemRecord[]): void {
    for (const item of items) {
      if (item.kind === 'window' && item.binding.state === 'live') {
        windowIds.add(item.binding.windowId);
      } else if (item.kind === 'tab' && item.binding.state === 'live') {
        tabs.set(item.binding.tabId, { tabId: item.binding.tabId, windowId: item.binding.windowId });
      }
      visit(item.children);
    }
  }
}

function attachRootLiveTabsToWindow(
  roots: readonly SavedItemRecord[],
  windowId: number,
  windowNodeId: string
): readonly SavedItemRecord[] {
  const rootTabs = roots
    .filter((node): node is LiveSavedTab => isLiveSavedTab(node) && node.binding.windowId === windowId)
    .sort((left, right) => left.binding.index - right.binding.index);
  return rootTabs.reduce(
    (currentRoots, tab) => movePersistentTreeNode(currentRoots, tab.id, windowNodeId, tab.binding.index),
    roots
  );
}

/** Saves and closes every restorable normal or popup window except the Browser Atlas window. */
export async function saveAndCloseAllWindows(
  chromeApi: typeof chrome,
  excludedWindowId?: number
): Promise<void> {
  const windows = await chromeApi.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] });
  for (const browserWindow of windows) {
    if (browserWindow.id === undefined || browserWindow.id === excludedWindowId) {
      continue;
    }
    const hasRestorableTab = (browserWindow.tabs ?? []).some((tab) => Boolean(tab.url ?? tab.pendingUrl));
    if (hasRestorableTab) {
      const savedWindowId = await saveAndCloseWindow(chromeApi, browserWindow.id);
      await markSavedWindows(chromeApi, { [savedWindowId]: 'recently-saved' });
    }
  }
}

/** Preserves a naturally closed live tab only when users attached persistent context to it. */
export async function preserveClosedLiveTab(chromeApi: typeof chrome, tabId: number): Promise<void> {
  const roots = await loadSavedItems(chromeApi);
  const liveTab = findLiveTab(roots, tabId);
  if (!liveTab) {
    return;
  }
  const nextRoots =
    liveTab.children.length === 0 && liveTab.keepOnClose !== true
      ? removePersistentTreeNode(roots, liveTab.id)
      : updatePersistentTreeNode(roots, liveTab.id, (node) => {
          if (!isLiveSavedTab(node)) {
            throw new Error('The closing tab attachment changed before it could be preserved.');
          }
          return {
            ...node,
            active: false,
            binding: {
              state: 'saved',
              savedAt: Date.now(),
              sessionId: createRetentionSessionId(),
              originalWindowId: node.binding.windowId,
              originalIndex: node.binding.index
            }
          };
        });
  await writeSavedItems(chromeApi, nextRoots);
}

/** Preserves every naturally closed window that still has a restorable live hierarchy. */
export async function preserveClosedLiveWindow(chromeApi: typeof chrome, windowId: number): Promise<void> {
  let roots = await loadSavedItems(chromeApi);
  let liveWindow = findLiveWindow(roots, windowId);
  if (liveWindow) {
    for (const tabId of collectLiveTabIds(liveWindow.children)) {
      const currentTab = await chromeApi.tabs.get(tabId).catch(() => undefined);
      if (currentTab && currentTab.windowId !== windowId) {
        await reconcileMovedLiveTab(chromeApi, tabId);
      }
    }
    roots = await loadSavedItems(chromeApi);
    liveWindow = findLiveWindow(roots, windowId);
  }
  if (!liveWindow) {
    if (containsLiveTabInWindow(roots, windowId)) {
      const retention = createRetention();
      await writeSavedItems(
        chromeApi,
        preserveMarkedClosedWindowTabs(roots, windowId, retention.savedAt, retention.sessionId)
      );
    }
    return;
  }
  const savedAt = Date.now();
  const sessionId = createRetentionSessionId();
  const retainedRoots = retainClosedWindowTabs(roots, windowId, savedAt, sessionId);
  const retainedWindow = findPersistentTreeNode(retainedRoots, liveWindow.id);
  if (!retainedWindow || retainedWindow.children.length === 0) {
    await writeSavedItems(chromeApi, removePersistentTreeNode(retainedRoots, liveWindow.id));
    return;
  }
  await writeSavedItems(
    chromeApi,
    updatePersistentTreeNode(retainedRoots, liveWindow.id, (node) => {
      if (!isLiveSavedWindow(node)) {
        throw new Error('The closing window attachment changed before it could be preserved.');
      }
      return {
        ...node,
        binding: { state: 'saved', savedAt, sessionId }
      };
    })
  );
}

function collectLiveTabIds(nodes: readonly SavedItemRecord[]): readonly number[] {
  return nodes.flatMap((node): readonly number[] => [
    ...(isLiveSavedTab(node) ? [node.binding.tabId] : []),
    ...collectLiveTabIds(node.children)
  ]);
}

/** Ensures every current browser window and tab has a durable live shadow with current metadata and opener nesting. */
export async function synchronizeLiveTree(
  chromeApi: typeof chrome,
  nestNewTabsUnderOpener = true
): Promise<void> {
  const [storedRoots, browserWindows] = await Promise.all([
    loadSavedItems(chromeApi),
    chromeApi.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] })
  ]);
  let roots = storedRoots;

  for (const browserWindow of browserWindows) {
    if (browserWindow.id === undefined) {
      continue;
    }
    const ensured = await ensureLiveWindowShadow(chromeApi, roots, browserWindow.id, browserWindow);
    roots = ensured.roots;
    const bounds = readWindowBounds(browserWindow);
    const activeTab = browserWindow.tabs?.find((tab) => tab.active);
    roots = updatePersistentTreeNode(roots, ensured.window.id, (node) => {
      if (!isLiveSavedWindow(node)) {
        return node;
      }
      return {
        ...node,
        ...(node.customTitle === true
          ? {}
          : { title: activeTab?.title || activeTab?.url || node.title }),
        ...(bounds ? { bounds } : {}),
        binding: { state: 'live', windowId: browserWindow.id!, focused: browserWindow.focused }
      };
    });

    for (const tab of browserWindow.tabs ?? []) {
      if (tab.id === undefined) {
        continue;
      }
      const shadow = findLiveTab(roots, tab.id);
      const url = tab.url ?? tab.pendingUrl;
      if (!shadow || !url) {
        continue;
      }
      roots = updatePersistentTreeNode(roots, shadow.id, (node) =>
        isLiveSavedTab(node)
          ? {
              ...node,
              title: tab.title || url,
              url,
              active: tab.active,
              pinned: tab.pinned,
              binding: {
                state: 'live',
                tabId: tab.id!,
                windowId: tab.windowId,
                index: tab.index
              }
            }
          : node
      );
    }

    if (nestNewTabsUnderOpener) {
      roots = nestDirectLiveTabsUnderOpeners(roots, browserWindow.tabs ?? [], browserWindow.id);
    }
  }

  if (JSON.stringify(roots) !== JSON.stringify(storedRoots)) {
    await writeSavedItems(chromeApi, roots);
  }
}

function nestDirectLiveTabsUnderOpeners(
  roots: readonly SavedItemRecord[],
  tabs: readonly chrome.tabs.Tab[],
  windowId: number
): readonly SavedItemRecord[] {
  let nextRoots = roots;
  for (const tab of tabs) {
    if (tab.id === undefined || tab.openerTabId === undefined) {
      continue;
    }
    const tabShadow = findLiveTab(nextRoots, tab.id);
    const openerShadow = findLiveTab(nextRoots, tab.openerTabId);
    const tabLocation = tabShadow ? findPersistentTreeLocation(nextRoots, tabShadow.id) : undefined;
    const currentParent = tabLocation?.parentId
      ? findPersistentTreeNode(nextRoots, tabLocation.parentId)
      : undefined;
    if (
      !tabShadow ||
      !openerShadow ||
      openerShadow.binding.windowId !== windowId ||
      !currentParent ||
      !isLiveSavedWindow(currentParent)
    ) {
      continue;
    }
    nextRoots = movePersistentTreeNode(nextRoots, tabShadow.id, openerShadow.id, openerShadow.children.length);
  }
  return nextRoots;
}

/** Updates the durable shadow when Chromium reports that a tracked window moved or resized. */
export async function updateLiveWindowBounds(
  chromeApi: typeof chrome,
  browserWindow: chrome.windows.Window
): Promise<void> {
  if (browserWindow.id === undefined) {
    return;
  }
  const bounds = readWindowBounds(browserWindow);
  if (!bounds) {
    return;
  }
  const roots = await loadSavedItems(chromeApi);
  const liveWindow = findLiveWindow(roots, browserWindow.id);
  if (!liveWindow || equalWindowBounds(liveWindow.bounds, bounds)) {
    return;
  }
  await writeSavedItems(
    chromeApi,
    updatePersistentTreeNode(roots, liveWindow.id, (node) =>
      node.kind === 'window' ? { ...node, bounds } : node
    )
  );
}

function containsLiveTabInWindow(nodes: readonly SavedItemRecord[], windowId: number): boolean {
  return nodes.some(
    (node) =>
      (isLiveSavedTab(node) && node.binding.windowId === windowId) ||
      containsLiveTabInWindow(node.children, windowId)
  );
}

function preserveMarkedClosedWindowTabs(
  nodes: readonly SavedItemRecord[],
  windowId: number,
  savedAt: number,
  sessionId: string
): readonly SavedItemRecord[] {
  return nodes.flatMap((node): readonly SavedItemRecord[] => {
    const children = preserveMarkedClosedWindowTabs(node.children, windowId, savedAt, sessionId);
    if (!isLiveSavedTab(node) || node.binding.windowId !== windowId) {
      return [{ ...node, children }];
    }
    if (node.children.length === 0 && node.keepOnClose !== true) {
      return [];
    }
    return [{
      ...node,
      active: false,
      binding: {
        state: 'saved',
        savedAt,
        sessionId,
        originalWindowId: node.binding.windowId,
        originalIndex: node.binding.index
      },
      children
    }];
  });
}

function retainClosedWindowTabs(
  nodes: readonly SavedItemRecord[],
  windowId: number,
  savedAt: number,
  sessionId: string
): readonly SavedItemRecord[] {
  return nodes.map((node): SavedItemRecord => {
    const children = retainClosedWindowTabs(node.children, windowId, savedAt, sessionId);
    if (!isLiveSavedTab(node) || node.binding.windowId !== windowId) {
      return { ...node, children };
    }
    return {
      ...node,
      active: false,
      binding: {
        state: 'saved',
        savedAt,
        sessionId,
        originalWindowId: node.binding.windowId,
        originalIndex: node.binding.index
      },
      children
    };
  });
}

/** Restores one saved tab, preferring its still-existing original window. */
export async function restoreSavedTab(chromeApi: typeof chrome, savedTabId: string): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const savedTab = findSavedTab(savedItems, savedTabId);
  if (!savedTab) {
    throw new Error('The saved tab no longer exists.');
  }

  const restored = await createRestoredTab(chromeApi, savedTab);
  try {
    const restoredTab = await readRestoredTab(chromeApi, restored, savedTab.url);
    await writeSavedItems(
      chromeApi,
      updatePersistentTreeNode(savedItems, savedTabId, (node) => {
        if (node.kind !== 'tab' || node.binding.state === 'live' || restoredTab.id === undefined) {
          throw new Error('The restored tab context changed before it could be rebound.');
        }
        return {
          ...node,
          active: restoredTab.active,
          pinned: restoredTab.pinned,
          binding: {
            state: 'live',
            tabId: restoredTab.id,
            windowId: restoredTab.windowId,
            index: restoredTab.index
          }
        };
      })
    );
  } catch (reason: unknown) {
    await closeRestoredItem(chromeApi, restored);
    throw reason;
  }
}

/** Restores all tabs, or only tabs retained by the window's latest saved session, into a new window. */
export async function restoreSavedWindow(
  chromeApi: typeof chrome,
  savedWindowId: string,
  mode: RestoreSavedWindowMode = 'all'
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const savedWindow = findPersistentTreeNode(savedItems, savedWindowId);
  if (!savedWindow || savedWindow.kind !== 'window' || savedWindow.binding.state === 'live') {
    throw new Error('The saved window no longer exists.');
  }
  const sessionId = savedWindow.binding.sessionId;
  const savedTabs = collectSavedTabs(savedWindow.children).filter(
    (tab) => mode === 'all' || (tab.binding.state !== 'live' && tab.binding.sessionId === sessionId)
  );
  if (savedTabs.length === 0) {
    throw new Error('This saved window has no restorable tabs.');
  }

  const restoreOriginalBounds = (await readBrowserAtlasSettings()).restoreWindowsInOriginalBounds;
  const restoredWindow = await chromeApi.windows.create({
    focused: true,
    state: 'normal',
    type: 'normal',
    url: savedTabs.map((tab) => tab.url),
    ...(restoreOriginalBounds ? savedWindow.bounds : undefined)
  });
  if (restoredWindow?.id === undefined) {
    throw new Error('Chromium did not create the restored window.');
  }

  try {
    if (restoreOriginalBounds && savedWindow.bounds) {
      await chromeApi.windows.update(restoredWindow.id, { state: 'normal' });
      await chromeApi.windows.update(restoredWindow.id, savedWindow.bounds);
    }
    const liveWindow = await chromeApi.windows.get(restoredWindow.id, { populate: true });
    const restoredTabs = new Map(
      savedTabs.flatMap((savedTab, index): readonly [string, chrome.tabs.Tab][] => {
        const restoredTab = liveWindow.tabs?.[index];
        return restoredTab ? [[savedTab.id, restoredTab]] : [];
      })
    );
    if (restoredTabs.size !== savedTabs.length) {
      throw new Error('Chromium did not expose every restored tab.');
    }
    await writeSavedItems(
      chromeApi,
      updatePersistentTreeNode(savedItems, savedWindowId, (node) =>
        materializeRestoredWindow(node, savedWindowId, 'window', liveWindow, restoredTabs)
      )
    );
    if (restoreOriginalBounds && savedWindow.bounds) {
      await chromeApi.windows.update(restoredWindow.id, { state: 'normal' });
      await chromeApi.windows.update(restoredWindow.id, savedWindow.bounds);
    }
  } catch (reason: unknown) {
    await chromeApi.windows.remove(restoredWindow.id);
    throw reason;
  }
}

/** Opens a saved Group as a real Chromium window while retaining its identity and hierarchy. */
export async function restoreSavedGroup(chromeApi: typeof chrome, savedGroupId: string): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const savedGroup = findPersistentTreeNode(savedItems, savedGroupId);
  if (!savedGroup || savedGroup.kind !== 'group') {
    throw new Error('The saved group no longer exists.');
  }
  const savedTabs = collectSavedTabs(savedGroup.children);
  const restoredWindow = await chromeApi.windows.create({
    focused: true,
    state: 'normal',
    type: 'normal',
    url: savedTabs.length > 0 ? savedTabs.map((tab) => tab.url) : 'about:blank'
  });
  if (restoredWindow?.id === undefined) {
    throw new Error('Chromium did not create a window for the saved group.');
  }

  try {
    const liveWindow = await chromeApi.windows.get(restoredWindow.id, { populate: true });
    const restoredTabs = new Map(
      savedTabs.flatMap((savedTab, index): readonly [string, chrome.tabs.Tab][] => {
        const restoredTab = liveWindow.tabs?.[index];
        return restoredTab ? [[savedTab.id, restoredTab]] : [];
      })
    );
    if (restoredTabs.size !== savedTabs.length) {
      throw new Error('Chromium did not expose every tab restored from the saved group.');
    }
    const initialTabs = savedTabs.length === 0
      ? (liveWindow.tabs ?? []).flatMap((tab): readonly SavedTabRecord[] => {
          const liveTab = createLiveTabShadow(tab);
          return liveTab ? [liveTab] : [];
        })
      : [];
    await writeSavedItems(
      chromeApi,
      updatePersistentTreeNode(savedItems, savedGroupId, (node) =>
        materializeRestoredWindow(
          node,
          savedGroupId,
          'group',
          liveWindow,
          restoredTabs,
          initialTabs
        )
      )
    );
  } catch (reason: unknown) {
    await chromeApi.windows.remove(restoredWindow.id).catch(() => undefined);
    throw reason;
  }
}

type RestoreSavedWindowMode = 'all' | 'last-session';

function materializeRestoredWindow(
  node: SavedItemRecord,
  rootWindowId: string,
  rootKind: 'window' | 'group',
  browserWindow: chrome.windows.Window,
  restoredTabs: ReadonlyMap<string, chrome.tabs.Tab>,
  initialTabs: readonly SavedTabRecord[] = []
): SavedItemRecord {
  const children = node.children.map((child) =>
    materializeRestoredWindow(child, rootWindowId, rootKind, browserWindow, restoredTabs)
  );
  if (node.kind === 'tab' && node.binding.state !== 'live') {
    const restoredTab = restoredTabs.get(node.id);
    if (!restoredTab) {
      return { ...node, children };
    }
    if (restoredTab.id === undefined) {
      throw new Error('A restored tab does not expose its browser ID.');
    }
    return {
      ...node,
      active: restoredTab.active,
      pinned: restoredTab.pinned,
      binding: {
        state: 'live',
        tabId: restoredTab.id,
        windowId: restoredTab.windowId,
        index: restoredTab.index
      },
      children
    };
  }
  if (node.id === rootWindowId && rootKind === 'group' && node.kind === 'group' && browserWindow.id !== undefined) {
    const bounds = readWindowBounds(browserWindow);
    return {
      kind: 'window',
      id: node.id,
      title: node.title,
      customTitle: true,
      ...(bounds ? { bounds } : {}),
      binding: { state: 'live', windowId: browserWindow.id, focused: browserWindow.focused },
      children: [...children, ...initialTabs]
    };
  }
  if (node.kind === 'window' && node.id === rootWindowId && rootKind === 'window' && browserWindow.id !== undefined) {
    return {
      ...node,
      binding: { state: 'live', windowId: browserWindow.id, focused: browserWindow.focused },
      children
    };
  }
  if (node.kind === 'window' && node.binding.state !== 'live') {
    return containsRestoredWindowTab(children, browserWindow.id)
      ? { kind: 'group', id: node.id, title: node.title, children }
      : { ...node, children };
  }
  return { ...node, children };
}

function containsRestoredWindowTab(nodes: readonly SavedItemRecord[], windowId: number | undefined): boolean {
  return windowId !== undefined && nodes.some((node) =>
    (node.kind === 'tab' && node.binding.state === 'live' && node.binding.windowId === windowId) ||
    containsRestoredWindowTab(node.children, windowId)
  );
}

/** Restores every retained tab in one hierarchy into an existing window while preserving its organizers. */
export async function restoreSavedItemIntoWindow(
  chromeApi: typeof chrome,
  itemId: string,
  targetWindowId: number,
  targetIndex: number
): Promise<void> {
  const roots = await loadSavedItems(chromeApi);
  const item = findPersistentTreeNode(roots, itemId);
  if (!item) {
    throw new Error('The saved hierarchy no longer exists.');
  }
  const hierarchyTabs = collectHierarchyTabs([item]);
  const ensuredTarget = await ensureLiveWindowShadow(chromeApi, roots, targetWindowId);
  const movedRoots = movePersistentTreeNode(ensuredTarget.roots, itemId, ensuredTarget.window.id, targetIndex);
  const restoredTabs = new Map<string, chrome.tabs.Tab>();
  const createdTabIds: number[] = [];
  const movedLiveTabs: Array<Readonly<{ tabId: number; windowId: number; index: number }>> = [];

  try {
    for (const [offset, hierarchyTab] of hierarchyTabs.entries()) {
      let restoredTab: chrome.tabs.Tab;
      if (isLiveSavedTab(hierarchyTab)) {
        restoredTab = await moveExistingHierarchyTab(
          chromeApi,
          hierarchyTab,
          targetWindowId,
          targetIndex + offset
        );
      } else {
        restoredTab = await createInternalChromeTab(chromeApi, {
          windowId: targetWindowId,
          index: targetIndex + offset,
          url: hierarchyTab.url,
          active: false,
          pinned: hierarchyTab.pinned
        });
      }
      if (restoredTab.id === undefined) {
        throw new Error('Chromium did not create a restored tab.');
      }
      if (hierarchyTab.binding.state === 'live') {
        movedLiveTabs.push({
          tabId: restoredTab.id,
          windowId: hierarchyTab.binding.windowId,
          index: hierarchyTab.binding.index
        });
      } else {
        createdTabIds.push(restoredTab.id);
      }
      restoredTabs.set(hierarchyTab.id, restoredTab);
    }

    await writeSavedItems(
      chromeApi,
      updatePersistentTreeNode(movedRoots, itemId, (node) => materializeRestoredHierarchy(node, restoredTabs))
    );
  } catch (reason: unknown) {
    if (createdTabIds.length > 0) {
      await chromeApi.tabs.remove(createdTabIds).catch(() => undefined);
    }
    for (const movedTab of movedLiveTabs.reverse()) {
      await chromeApi.tabs
        .move(movedTab.tabId, { windowId: movedTab.windowId, index: movedTab.index })
        .catch(() => undefined);
    }
    throw reason;
  }
}

async function moveExistingHierarchyTab(
  chromeApi: typeof chrome,
  tab: LiveSavedTab,
  targetWindowId: number,
  targetIndex: number
): Promise<chrome.tabs.Tab> {
  const moved = await chromeApi.tabs.move(tab.binding.tabId, { windowId: targetWindowId, index: targetIndex });
  const movedTab = Array.isArray(moved) ? moved[0] : moved;
  if (!movedTab) {
    throw new Error('Chromium did not expose the moved live tab.');
  }
  return movedTab;
}

function materializeRestoredHierarchy(
  node: SavedItemRecord,
  restoredTabs: ReadonlyMap<string, chrome.tabs.Tab>
): SavedItemRecord {
  const children = node.children.map((child) => materializeRestoredHierarchy(child, restoredTabs));
  if (node.kind === 'tab') {
    const restoredTab = restoredTabs.get(node.id);
    if (!restoredTab || restoredTab.id === undefined) {
      return { ...node, children };
    }
    return {
      ...node,
      active: restoredTab.active,
      pinned: restoredTab.pinned,
      binding: {
        state: 'live',
        tabId: restoredTab.id,
        windowId: restoredTab.windowId,
        index: restoredTab.index
      },
      children
    };
  }
  if (node.kind === 'window' && node.binding.state !== 'live') {
    return { kind: 'group', id: node.id, title: node.title, children };
  }
  return { ...node, children };
}

/** Creates a group, note, or separator at an original Tabs Outliner-compatible tree position. */
export async function createSavedOrganizer(
  chromeApi: typeof chrome,
  kind: 'group' | 'note' | 'separator',
  placement: PersistentOrganizerPlacement,
  title: string,
  separatorStyle: 0 | 1 | 2
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const organizer = createOrganizerRecord(kind, title, separatorStyle);
  await writeSavedItems(chromeApi, await insertSavedOrganizer(chromeApi, savedItems, placement, organizer));
}

async function insertSavedOrganizer(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  placement: PersistentOrganizerPlacement,
  organizer: SavedGroupRecord | SavedNoteRecord | SavedSeparatorRecord
): Promise<readonly SavedItemRecord[]> {
  switch (placement.kind) {
    case 'inside': {
      const target = await resolvePersistentTarget(chromeApi, roots, placement.target);
      const index = placement.position === 'first' ? 0 : Number.MAX_SAFE_INTEGER;
      return insertPersistentTreeNode(target.roots, target.parentId, index, organizer);
    }
    case 'tree-end':
      return insertPersistentTreeNode(roots, null, Number.MAX_SAFE_INTEGER, organizer);
    case 'sibling': {
      const target = await resolvePersistentTarget(chromeApi, roots, placement.target);
      const targetId = requirePersistentItemId(target.parentId);
      const location = findPersistentTreeLocation(target.roots, targetId);
      if (!location) {
        throw new Error('The organizer insertion anchor no longer exists.');
      }
      const index = location.index + (placement.position === 'after' ? 1 : 0);
      return insertPersistentTreeNode(target.roots, location.parentId, index, organizer);
    }
    case 'parent': {
      const target = await resolvePersistentTarget(chromeApi, roots, placement.target);
      const targetId = requirePersistentItemId(target.parentId);
      const location = findPersistentTreeLocation(target.roots, targetId);
      if (!location) {
        throw new Error('The organizer insertion anchor no longer exists.');
      }
      const parent = { ...organizer, children: [location.node] };
      return insertPersistentTreeNode(
        removePersistentTreeNode(target.roots, targetId),
        location.parentId,
        location.index,
        parent
      );
    }
    default: {
      const exhaustivePlacement: never = placement;
      return exhaustivePlacement;
    }
  }
}

function requirePersistentItemId(itemId: string | null): string {
  if (itemId === null) {
    throw new Error('The tree root cannot be used as an organizer item anchor.');
  }
  return itemId;
}

/** Renames a persistent organizer or browser item, creating a live shadow when necessary. */
export async function renamePersistentItem(
  chromeApi: typeof chrome,
  item: PersistentItemReference,
  title: string
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const target = await resolvePersistentItem(chromeApi, savedItems, item);
  await writeSavedItems(
    chromeApi,
    updatePersistentTreeNode(target.roots, target.itemId, (node) => {
      if (node.kind === 'window') {
        return { ...node, title, customTitle: true };
      }
      if (node.kind === 'group' || node.kind === 'tab') {
        return { ...node, title };
      }
      if (node.kind === 'note') {
        return { ...node, text: title };
      }
      throw new Error('Only groups, windows, tabs, and notes can be renamed.');
    })
  );
}

type ResolvedPersistentItem = Readonly<{
  roots: readonly SavedItemRecord[];
  itemId: string;
}>;

async function resolvePersistentItem(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  item: PersistentItemReference
): Promise<ResolvedPersistentItem> {
  switch (item.kind) {
    case 'saved':
      return { roots, itemId: item.id };
    case 'live-window': {
      const ensured = await ensureLiveWindowShadow(chromeApi, roots, readBrowserId(item.windowId, 'window'));
      return { roots: ensured.roots, itemId: ensured.window.id };
    }
    case 'live-tab': {
      const target = await resolvePersistentTarget(chromeApi, roots, item);
      const tab = findLiveTab(target.roots, readBrowserId(item.tabId, 'tab'));
      if (!tab) {
        throw new Error('The selected live tab no longer exists.');
      }
      return { roots: target.roots, itemId: tab.id };
    }
    default: {
      const exhaustiveItem: never = item;
      return exhaustiveItem;
    }
  }
}

/** Advances a separator through the solid, double, and dashed styles. */
export async function cycleSavedSeparator(chromeApi: typeof chrome, itemId: string): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  await writeSavedItems(
    chromeApi,
    updatePersistentTreeNode(savedItems, itemId, (item) => {
      if (item.kind !== 'separator') {
        throw new Error('Only a saved separator can change separator style.');
      }
      return { ...item, style: nextSeparatorStyle(item.style) };
    })
  );
}

/** Removes a saved organizer, optionally promoting its children in place. */
export async function deleteSavedOrganizer(
  chromeApi: typeof chrome,
  itemId: string,
  mode: ExplorerDeleteMode
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const location = findPersistentTreeLocation(savedItems, itemId);
  if (!location) {
    throw new Error('The saved item no longer exists.');
  }
  const deletionHistory = await loadDeletionHistory(chromeApi);
  const deletion = createPersistentTreeDeletion(savedItems, itemId, mode);
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: createPersistentTreeDocument(removePersistentTreeNode(savedItems, itemId, mode)),
    [DELETED_ITEMS_STORAGE_KEY]: appendPersistentTreeDeletion(deletionHistory, deletion, MAX_DELETION_HISTORY)
  });
}

/** Lists recoverable deleted hierarchies from newest to oldest. */
export async function listDeletedSavedItems(chromeApi: typeof chrome) {
  return summarizePersistentTreeDeletions(await loadDeletionHistory(chromeApi));
}

/** Restores and consumes one selected deleted hierarchy. */
export async function restoreDeletedSavedItem(
  chromeApi: typeof chrome,
  deletionId: string
): Promise<void> {
  const [savedItems, deletionHistory] = await Promise.all([
    loadSavedItems(chromeApi),
    loadDeletionHistory(chromeApi)
  ]);
  const deletionIndex = deletionHistory.findIndex((deletion) => deletion.deletionId === deletionId);
  await restoreDeletionAtIndex(chromeApi, savedItems, deletionHistory, deletionIndex);
}

async function restoreDeletionAtIndex(
  chromeApi: typeof chrome,
  savedItems: readonly SavedItemRecord[],
  deletionHistory: readonly PersistentTreeDeletion[],
  deletionIndex: number
): Promise<void> {
  const deletion = deletionHistory[deletionIndex];
  if (!deletion) {
    throw new Error('The selected deleted Browser Atlas item is no longer available.');
  }
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: createPersistentTreeDocument(restorePersistentTreeDeletion(savedItems, deletion)),
    [DELETED_ITEMS_STORAGE_KEY]: deletionHistory.filter((_, index) => index !== deletionIndex)
  });
}

/** Reads one persistent-tree state for `createUndoHistory`, including real live-tab placements. */
export async function readPersistentTreeHistorySnapshot(
  chromeApi: typeof chrome,
  moveSource?: Readonly<{ tabId: number; windowId: number; index: number }>
): Promise<PersistentTreeHistorySnapshot> {
  const [roots, deletions] = await Promise.all([
    loadSavedItems(chromeApi),
    loadDeletionHistory(chromeApi)
  ]);
  const synchronizedRoots = await synchronizeLiveTabBindings(chromeApi, roots);
  const positionedRoots = moveSource
    ? updateLiveTabHistoryBinding(synchronizedRoots, moveSource)
    : synchronizedRoots;
  const document = createPersistentTreeDocument(positionedRoots);
  const liveTabPlacements = moveSource
    ? [moveSource]
    : collectLiveTabBindings(document.roots).map(({ tabId, windowId, index }) => ({ tabId, windowId, index }));
  return { document, deletions, liveTabPlacements, closedLiveNodeIds: [] };
}

function updateLiveTabHistoryBinding(
  roots: readonly SavedItemRecord[],
  source: Readonly<{ tabId: number; windowId: number; index: number }>
): readonly SavedItemRecord[] {
  return roots.map((node): SavedItemRecord => {
    const children = updateLiveTabHistoryBinding(node.children, source);
    return node.kind === 'tab' && node.binding.state === 'live' && node.binding.tabId === source.tabId
      ? { ...node, binding: { state: 'live', ...source }, children }
      : { ...node, children };
  });
}

async function synchronizeLiveTabBindings(
  chromeApi: typeof chrome,
  nodes: readonly SavedItemRecord[]
): Promise<readonly SavedItemRecord[]> {
  return Promise.all(nodes.map(async (node): Promise<SavedItemRecord> => {
    const children = await synchronizeLiveTabBindings(chromeApi, node.children);
    if (node.kind !== 'tab' || node.binding.state !== 'live') {
      return { ...node, children };
    }
    const tab = await chromeApi.tabs.get(node.binding.tabId).catch(() => undefined);
    return tab
      ? {
          ...node,
          children,
          binding: {
            state: 'live',
            tabId: node.binding.tabId,
            windowId: tab.windowId,
            index: tab.index
          }
        }
      : { ...node, children };
  }));
}

/** Applies a state selected by `createUndoHistory`. */
export async function applyPersistentTreeHistorySnapshot(
  chromeApi: typeof chrome,
  snapshot: PersistentTreeHistorySnapshot
): Promise<void> {
  await closeHistoryBrowserResources(chromeApi, snapshot.closedLiveNodeIds);
  const applicableSnapshot = await recreateMissingHistoryResources(chromeApi, snapshot);
  await writePersistentTreeHistorySnapshot(chromeApi, applicableSnapshot);
  for (const placement of applicableSnapshot.liveTabPlacements) {
    await moveLiveTabToHistoryBinding(chromeApi, placement);
  }
  await writePersistentTreeHistorySnapshot(chromeApi, applicableSnapshot);
}

async function closeHistoryBrowserResources(
  chromeApi: typeof chrome,
  nodeIds: readonly string[]
): Promise<void> {
  const roots = await loadSavedItems(chromeApi);
  const nodes = nodeIds.flatMap((id) => {
    const node = findPersistentTreeNode(roots, id);
    return node ? [node] : [];
  });
  const closingWindowIds = new Set(
    nodes.flatMap((node) =>
      node.kind === 'window' && node.binding.state === 'live' ? [node.binding.windowId] : []
    )
  );
  for (const windowId of closingWindowIds) {
    await chromeApi.windows.remove(windowId).catch(() => undefined);
  }
  for (const node of nodes) {
    if (
      node.kind === 'tab' &&
      node.binding.state === 'live' &&
      !closingWindowIds.has(node.binding.windowId)
    ) {
      await chromeApi.tabs.remove(node.binding.tabId).catch(() => undefined);
    }
  }
}

async function recreateMissingHistoryResources(
  chromeApi: typeof chrome,
  snapshot: PersistentTreeHistorySnapshot
): Promise<PersistentTreeHistorySnapshot> {
  let document = snapshot.document;
  let placements = [...snapshot.liveTabPlacements];
  for (const desiredWindowId of new Set(placements.map((placement) => placement.windowId))) {
    const existingWindow = await chromeApi.windows.get(desiredWindowId).catch(() => undefined);
    if (!existingWindow) {
      const windowPlacements = placements
        .filter((placement) => placement.windowId === desiredWindowId)
        .sort((left, right) => left.index - right.index);
      const reusablePlacement = await findExistingHistoryTab(chromeApi, windowPlacements);
      const firstPlacement = reusablePlacement ?? windowPlacements[0];
      if (!firstPlacement) {
        continue;
      }
      const desiredTab = findHistoryLiveTab(document, firstPlacement.tabId);
      const desiredWindow = findHistoryLiveWindow(document, desiredWindowId);
      const createdWindow = reusablePlacement
        ? await chromeApi.windows.create({ focused: false, tabId: reusablePlacement.tabId, type: 'normal' })
        : await chromeApi.windows.create({
            focused: false,
            type: 'normal',
            url: desiredTab.url,
            ...(desiredWindow?.bounds ?? {})
          });
      const createdWindowId = createdWindow?.id;
      const createdTabId = createdWindow?.tabs?.[0]?.id;
      if (createdWindowId === undefined) {
        throw new Error('Chromium did not recreate a window required by Undo history.');
      }
      document = createPersistentTreeDocument(remapLiveHistoryWindow(document.roots, desiredWindowId, createdWindowId));
      placements = placements.map((placement) =>
        placement.windowId === desiredWindowId
          ? { ...placement, windowId: createdWindowId }
          : placement
      );
      if (!reusablePlacement) {
        if (createdTabId === undefined) {
          throw new Error('Chromium did not create the first tab required by Undo history.');
        }
        document = createPersistentTreeDocument(
          remapLiveHistoryTab(document.roots, firstPlacement.tabId, createdTabId)
        );
        placements = placements.map((placement) =>
          placement.tabId === firstPlacement.tabId
            ? { ...placement, tabId: createdTabId }
            : placement
        );
        await chromeApi.tabs.update(createdTabId, {
          active: desiredTab.active,
          pinned: desiredTab.pinned
        });
      }
    }
  }
  for (const placement of [...placements].sort((left, right) => left.index - right.index)) {
    const existingTab = await chromeApi.tabs.get(placement.tabId).catch(() => undefined);
    if (existingTab) {
      continue;
    }
    const desiredTab = findHistoryLiveTab(document, placement.tabId);
    const createdTab = await chromeApi.tabs.create({
      active: desiredTab.active,
      index: placement.index,
      pinned: desiredTab.pinned,
      url: desiredTab.url,
      windowId: placement.windowId
    });
    if (createdTab.id === undefined) {
      throw new Error('Chromium did not recreate a tab required by Undo history.');
    }
    const createdTabId = createdTab.id;
    document = createPersistentTreeDocument(remapLiveHistoryTab(document.roots, placement.tabId, createdTabId));
    placements = placements.map((candidate) =>
      candidate.tabId === placement.tabId ? { ...candidate, tabId: createdTabId } : candidate
    );
  }
  return { ...snapshot, document, liveTabPlacements: placements };
}

async function findExistingHistoryTab(
  chromeApi: typeof chrome,
  placements: readonly PersistentTreeHistoryTabPlacement[]
): Promise<PersistentTreeHistoryTabPlacement | undefined> {
  for (const placement of placements) {
    if (await chromeApi.tabs.get(placement.tabId).catch(() => undefined)) {
      return placement;
    }
  }
  return undefined;
}

function findHistoryLiveTab(document: PersistentTreeDocument, tabId: number): PersistentTabNode {
  const tab = collectPersistentNodes(document.roots).find(
    (node): node is PersistentTabNode =>
      node.kind === 'tab' && node.binding.state === 'live' && node.binding.tabId === tabId
  );
  if (!tab) {
    throw new Error('Undo history no longer contains the closed tab metadata.');
  }
  return tab;
}

function findHistoryLiveWindow(document: PersistentTreeDocument, windowId: number): PersistentWindowNode | undefined {
  return collectPersistentNodes(document.roots).find(
    (node): node is PersistentWindowNode =>
      node.kind === 'window' && node.binding.state === 'live' && node.binding.windowId === windowId
  );
}

function collectPersistentNodes(nodes: readonly PersistentTreeNode[]): readonly PersistentTreeNode[] {
  return nodes.flatMap((node): readonly PersistentTreeNode[] => [node, ...collectPersistentNodes(node.children)]);
}

function remapLiveHistoryWindow(
  nodes: readonly SavedItemRecord[],
  previousWindowId: number,
  nextWindowId: number
): readonly SavedItemRecord[] {
  return nodes.map((node): SavedItemRecord => {
    const children = remapLiveHistoryWindow(node.children, previousWindowId, nextWindowId);
    if (node.kind === 'window' && node.binding.state === 'live' && node.binding.windowId === previousWindowId) {
      return { ...node, binding: { ...node.binding, windowId: nextWindowId }, children };
    }
    if (node.kind === 'tab' && node.binding.state === 'live' && node.binding.windowId === previousWindowId) {
      return { ...node, binding: { ...node.binding, windowId: nextWindowId }, children };
    }
    return { ...node, children };
  });
}

function remapLiveHistoryTab(
  nodes: readonly SavedItemRecord[],
  previousTabId: number,
  nextTabId: number
): readonly SavedItemRecord[] {
  return nodes.map((node): SavedItemRecord => {
    const children = remapLiveHistoryTab(node.children, previousTabId, nextTabId);
    return node.kind === 'tab' && node.binding.state === 'live' && node.binding.tabId === previousTabId
      ? { ...node, binding: { ...node.binding, tabId: nextTabId }, children }
      : { ...node, children };
  });
}

async function moveLiveTabToHistoryBinding(
  chromeApi: typeof chrome,
  binding: Readonly<{ tabId: number; windowId: number; index: number }>
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tab = await chromeApi.tabs.get(binding.tabId);
    if (tab.windowId === binding.windowId && tab.index === binding.index) {
      return;
    }
    await chromeApi.tabs.move(binding.tabId, { windowId: binding.windowId, index: binding.index });
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const tab = await chromeApi.tabs.get(binding.tabId);
  if (tab.windowId !== binding.windowId) {
    throw new Error('Chromium did not restore a moved tab to its Undo history window.');
  }
}

async function writePersistentTreeHistorySnapshot(
  chromeApi: typeof chrome,
  snapshot: PersistentTreeHistorySnapshot
): Promise<void> {
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: snapshot.document,
    [DELETED_ITEMS_STORAGE_KEY]: snapshot.deletions
  });
}

function collectLiveTabBindings(
  nodes: readonly SavedItemRecord[]
): Array<Extract<SavedTabRecord['binding'], { state: 'live' }>> {
  const bindings = new Map<number, Extract<SavedTabRecord['binding'], { state: 'live' }>>();
  collect(nodes);
  return [...bindings.values()];

  function collect(children: readonly SavedItemRecord[]): void {
    for (const node of children) {
      if (node.kind === 'tab' && node.binding.state === 'live' && !bindings.has(node.binding.tabId)) {
        bindings.set(node.binding.tabId, node.binding);
      }
      collect(node.children);
    }
  }
}

/** Moves a complete saved hierarchy to the root or inside any saved node. */
export async function moveSavedItem(
  chromeApi: typeof chrome,
  itemId: string,
  target: PersistentItemTarget,
  targetIndex: number
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const resolvedTarget = await resolvePersistentTarget(chromeApi, savedItems, target);
  await writeSavedItems(
    chromeApi,
    movePersistentTreeNode(resolvedTarget.roots, itemId, resolvedTarget.parentId, targetIndex)
  );
}

/** Creates a live Chromium window and atomically places its persistent shadow in the requested hierarchy. */
export async function createWindowAtPlacement(
  chromeApi: typeof chrome,
  placement: PersistentMovePlacement
): Promise<void> {
  const browserWindow = await chromeApi.windows.create({ focused: true, type: 'normal' });
  if (browserWindow?.id === undefined) {
    throw new Error('Chromium did not create the requested browser window.');
  }
  const populatedWindow = await chromeApi.windows.get(browserWindow.id, { populate: true });
  const roots = await loadSavedItems(chromeApi);
  const ensured = await ensureLiveWindowShadow(chromeApi, roots, browserWindow.id, populatedWindow);
  await writeSavedItems(
    chromeApi,
    await placePersistentItem(chromeApi, ensured.roots, ensured.window.id, placement)
  );
}

/** Creates and opens the original Google Doc fabric at an exact persistent-tree position. */
export async function createGoogleDocAtPlacement(
  chromeApi: typeof chrome,
  placement: PersistentMovePlacement
): Promise<void> {
  const roots = await loadSavedItems(chromeApi);
  const savedTab = createGoogleDocRecord(placementWindowId(placement));
  const placedRoots = await placePersistentItem(chromeApi, [...roots, savedTab], savedTab.id, placement);
  await writeSavedItems(chromeApi, placedRoots);
  await restoreSavedTab(chromeApi, savedTab.id);
}

/** Repositions a saved hierarchy or live-tab shadow relative to semantic tree anchors. */
export async function repositionPersistentItem(
  chromeApi: typeof chrome,
  item: PersistentItemReference,
  placement: PersistentMovePlacement
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const source = await resolvePersistentTarget(chromeApi, savedItems, item);
  const sourceId = requirePersistentItemId(source.parentId);
  await writeSavedItems(chromeApi, await placePersistentItem(chromeApi, source.roots, sourceId, placement));
}

async function placePersistentItem(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  sourceId: string,
  placement: PersistentMovePlacement
): Promise<readonly SavedItemRecord[]> {
  if (placement.kind === 'tree-end') {
    return movePersistentTreeNode(roots, sourceId, null, Number.MAX_SAFE_INTEGER);
  }

  if (placement.kind === 'inside') {
    const target = await resolvePersistentTarget(chromeApi, roots, placement.target);
    return movePersistentTreeNode(
      target.roots,
      sourceId,
      target.parentId,
      placement.position === 'first' ? 0 : Number.MAX_SAFE_INTEGER
    );
  }

  const target = await resolvePersistentTarget(chromeApi, roots, placement.target);
  const targetId = requirePersistentItemId(target.parentId);
  const [sourceLocation, targetLocation] = [
    findPersistentTreeLocation(target.roots, sourceId),
    findPersistentTreeLocation(target.roots, targetId)
  ];
  if (!sourceLocation || !targetLocation) {
    throw new Error('The persistent keyboard-move source or destination no longer exists.');
  }
  let targetIndex = targetLocation.index + (placement.position === 'after' ? 1 : 0);
  if (sourceLocation.parentId === targetLocation.parentId && sourceLocation.index < targetIndex) {
    targetIndex -= 1;
  }
  return movePersistentTreeNode(target.roots, sourceId, targetLocation.parentId, targetIndex);
}

/** Flattens tabs beneath one or more persistent nodes while preserving organizer boundaries. */
export async function flattenPersistentTabs(
  chromeApi: typeof chrome,
  items: readonly PersistentItemReference[]
): Promise<void> {
  let roots = await loadSavedItems(chromeApi);
  for (const item of items) {
    const target = await resolvePersistentTarget(chromeApi, roots, item);
    const itemId = requirePersistentItemId(target.parentId);
    roots = flattenPersistentTabsHierarchy(target.roots, itemId);
  }
  await writeSavedItems(chromeApi, roots);
}

/** Moves a live tab shadow, with all attached context, anywhere in the persistent tree. */
export async function moveLiveTabInTree(
  chromeApi: typeof chrome,
  tabId: number,
  target: PersistentItemTarget,
  targetIndex: number
): Promise<void> {
  const [roots, tab] = await Promise.all([loadSavedItems(chromeApi), chromeApi.tabs.get(tabId)]);
  const ensuredSource = await ensureLiveWindowShadow(chromeApi, roots, tab.windowId);
  const liveTab = findLiveTab(ensuredSource.roots, tabId);
  if (!liveTab) {
    throw new Error('The selected live tab no longer exists.');
  }
  const savedTarget = target.kind === 'saved'
    ? findPersistentTreeNode(ensuredSource.roots, target.id)
    : undefined;
  if (savedTarget?.kind === 'group') {
    await moveLiveTabIntoSavedGroup(
      chromeApi,
      ensuredSource.roots,
      liveTab,
      savedTarget,
      tab,
      targetIndex
    );
    return;
  }
  const resolvedTarget = await resolvePersistentTarget(chromeApi, ensuredSource.roots, target);
  const updatedRoots = updatePersistentTreeNode(resolvedTarget.roots, liveTab.id, (node) => {
    if (!isLiveSavedTab(node)) {
      throw new Error('The selected tab changed while it was being organized.');
    }
    const url = tab.url ?? tab.pendingUrl ?? node.url;
    return {
      ...node,
      title: tab.title || url,
      url,
      active: tab.active,
      pinned: tab.pinned,
      binding: { state: 'live', tabId, windowId: tab.windowId, index: tab.index }
    };
  });
  await writeSavedItems(
    chromeApi,
    movePersistentTreeNode(updatedRoots, liveTab.id, resolvedTarget.parentId, targetIndex)
  );
}

async function moveLiveTabIntoSavedGroup(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  liveTab: LiveSavedTab,
  savedGroup: SavedGroupRecord,
  browserTab: chrome.tabs.Tab,
  targetIndex: number
): Promise<void> {
  const movedRoots = movePersistentTreeNode(roots, liveTab.id, savedGroup.id, targetIndex);
  const createdWindow = await chromeApi.windows.create({
    focused: true,
    type: 'normal',
    tabId: liveTab.binding.tabId
  });
  if (createdWindow?.id === undefined) {
    throw new Error('Chromium did not create a window for the saved group.');
  }
  const createdWindowId = createdWindow.id;

  try {
    const populatedWindow = await chromeApi.windows.get(createdWindowId, { populate: true });
    const movedTab = populatedWindow.tabs?.find((tab) => tab.id === liveTab.binding.tabId) ??
      await chromeApi.tabs.get(liveTab.binding.tabId);
    let nextRoots = updatePersistentTreeNode(movedRoots, liveTab.id, (node) => {
      if (!isLiveSavedTab(node)) {
        throw new Error('The selected tab changed while its group became a window.');
      }
      const url = movedTab.url ?? movedTab.pendingUrl ?? node.url;
      return {
        ...node,
        title: movedTab.title || url,
        url,
        active: movedTab.active,
        pinned: movedTab.pinned,
        binding: {
          state: 'live',
          tabId: liveTab.binding.tabId,
          windowId: createdWindowId,
          index: movedTab.index
        }
      };
    });
    nextRoots = updatePersistentTreeNode(nextRoots, savedGroup.id, (node) => {
      if (node.kind !== 'group') {
        throw new Error('The destination group changed while becoming a window.');
      }
      const bounds = readWindowBounds(populatedWindow);
      return {
        kind: 'window',
        id: node.id,
        title: node.title,
        customTitle: true,
        ...(bounds ? { bounds } : {}),
        binding: { state: 'live', windowId: createdWindowId, focused: populatedWindow.focused },
        children: node.children
      };
    });
    await writeSavedItems(chromeApi, nextRoots);
  } catch (reason: unknown) {
    await chromeApi.tabs
      .move(liveTab.binding.tabId, {
        windowId: browserTab.windowId,
        index: browserTab.index
      })
      .catch(() => undefined);
    await chromeApi.windows.remove(createdWindowId).catch(() => undefined);
    throw reason;
  }
}

/** Imports portable semantic hierarchies into the root, a saved node, or a live browser attachment. */
export async function importPersistentItems(
  chromeApi: typeof chrome,
  target: PersistentItemTarget,
  targetIndex: number,
  items: readonly PortableExplorerNode[]
): Promise<void> {
  const savedItems = await loadSavedItems(chromeApi);
  const resolvedTarget = await resolvePersistentTarget(chromeApi, savedItems, target);
  const importedNodes = createPersistentNodesFromPortable(items, {
    savedAt: Date.now(),
    sessionId: createRetentionSessionId(),
    originalWindowId: targetWindowId(target),
    createId: createSavedId
  });
  const roots = importedNodes.reduce(
    (currentRoots, node, offset) =>
      insertPersistentTreeNode(currentRoots, resolvedTarget.parentId, targetIndex + offset, node),
    resolvedTarget.roots
  );
  await writeSavedItems(chromeApi, roots);
}

/** Permanently closes a live tab after removing any durable shadow that would otherwise preserve it. */
export async function deleteLiveTab(
  chromeApi: typeof chrome,
  tabId: number,
  mode: ExplorerDeleteMode
): Promise<void> {
  const roots = await loadSavedItems(chromeApi);
  const shadow = findLiveTab(roots, tabId);
  if (shadow) {
    await recordRecoverableLiveDeletion(chromeApi, roots, shadow.id, mode);
  }
  await chromeApi.tabs.remove(tabId);
}

/** Permanently closes a live window after removing its durable shadow and attached hierarchy. */
export async function deleteLiveWindow(
  chromeApi: typeof chrome,
  windowId: number,
  mode: ExplorerDeleteMode
): Promise<void> {
  const roots = await loadSavedItems(chromeApi);
  const shadow = findLiveWindow(roots, windowId);
  if (shadow) {
    await recordRecoverableLiveDeletion(chromeApi, roots, shadow.id, mode);
  }
  await chromeApi.windows.remove(windowId);
}

async function recordRecoverableLiveDeletion(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  itemId: string,
  mode: ExplorerDeleteMode
): Promise<void> {
  const [deletionHistory, deletion] = [
    await loadDeletionHistory(chromeApi),
    createPersistentTreeDeletion(roots, itemId, mode)
  ];
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: createPersistentTreeDocument(removePersistentTreeNode(roots, itemId, mode)),
    [DELETED_ITEMS_STORAGE_KEY]: appendPersistentTreeDeletion(
      deletionHistory,
      { ...deletion, node: detachDeletedLiveBindings(deletion.node, deletion.deletedAt) },
      MAX_DELETION_HISTORY
    )
  });
}

function detachDeletedLiveBindings(node: SavedItemRecord, savedAt: number): SavedItemRecord {
  const children = node.children.map((child) => detachDeletedLiveBindings(child, savedAt));
  if (node.kind === 'tab' && node.binding.state === 'live') {
    return {
      ...node,
      children,
      binding: {
        state: 'saved',
        savedAt,
        sessionId: createRetentionSessionId(),
        originalWindowId: node.binding.windowId,
        originalIndex: node.binding.index
      }
    };
  }
  if (node.kind === 'window' && node.binding.state === 'live') {
    return {
      ...node,
      children,
      binding: { state: 'saved', savedAt, sessionId: createRetentionSessionId() }
    };
  }
  return { ...node, children };
}

/** Moves a durable live-tab shadow with its annotations after Chromium attaches or reorders the tab. */
export async function reconcileMovedLiveTab(chromeApi: typeof chrome, tabId: number): Promise<void> {
  const [roots, tab] = await Promise.all([loadSavedItems(chromeApi), chromeApi.tabs.get(tabId)]);
  const matchingShadows = findLiveTabs(roots, tabId);
  const primaryShadow = matchingShadows.find((shadow) => shadow.children.length > 0) ?? matchingShadows[0];
  const url = tab.url ?? tab.pendingUrl;
  if (!primaryShadow || !url) {
    return;
  }

  const mergedChildren = matchingShadows.flatMap((shadow) => shadow.children).filter(uniqueNodeId);
  let nextRoots = matchingShadows
    .filter((shadow) => shadow.id !== primaryShadow.id)
    .reduce((currentRoots, shadow) => removePersistentTreeNode(currentRoots, shadow.id), roots);
  nextRoots = updatePersistentTreeNode(nextRoots, primaryShadow.id, (node) => {
    if (!isLiveSavedTab(node)) {
      throw new Error('The live tab attachment changed while Chromium moved it.');
    }
    return {
      ...node,
      title: tab.title || url,
      url,
      active: tab.active,
      pinned: tab.pinned,
      binding: { state: 'live', tabId, windowId: tab.windowId, index: tab.index },
      children: mergedChildren
    };
  });

  const currentLocation = findPersistentTreeLocation(nextRoots, primaryShadow.id);
  const currentParent = currentLocation?.parentId
    ? findPersistentTreeNode(nextRoots, currentLocation.parentId)
    : undefined;
  if (!currentParent || !isLiveSavedWindow(currentParent)) {
    await writeSavedItems(chromeApi, nextRoots);
    return;
  }

  let targetWindow = findLiveWindow(nextRoots, tab.windowId);
  if (!targetWindow) {
    const browserWindow = await chromeApi.windows.get(tab.windowId, { populate: true });
    const createdWindow = createLiveWindowShadow(
      browserWindow,
      tab.windowId,
      createMissingLiveTabShadows(nextRoots, browserWindow)
    );
    nextRoots = [...nextRoots, createdWindow];
    targetWindow = createdWindow;
  }

  nextRoots = movePersistentTreeNode(nextRoots, primaryShadow.id, targetWindow.id, tab.index);
  await writeSavedItems(chromeApi, nextRoots);
}

/** Nests a newly created live tab below its Chromium opener while retaining both live bindings. */
export async function relateNewLiveTabToOpener(
  chromeApi: typeof chrome,
  tabId: number,
  openerTabId: number
): Promise<void> {
  const [roots, tab, opener] = await Promise.all([
    loadSavedItems(chromeApi),
    chromeApi.tabs.get(tabId),
    chromeApi.tabs.get(openerTabId)
  ]);
  const tabUrl = tab.url ?? tab.pendingUrl;
  const openerUrl = opener.url ?? opener.pendingUrl;
  if (
    tab.windowId !== opener.windowId ||
    !tabUrl ||
    !openerUrl ||
    !isUserTreeTabUrl(tabUrl) ||
    !isUserTreeTabUrl(openerUrl)
  ) {
    return;
  }

  const browserWindow = await chromeApi.windows.get(tab.windowId, { populate: true });
  const ensured = await ensureLiveWindowShadow(chromeApi, roots, tab.windowId, browserWindow);
  const tabShadow = findLiveTab(ensured.roots, tabId);
  const openerShadow = findLiveTab(ensured.roots, openerTabId);
  if (!tabShadow || !openerShadow || tabShadow.id === openerShadow.id) {
    return;
  }
  if (findPersistentTreeLocation(ensured.roots, tabShadow.id)?.parentId === openerShadow.id) {
    return;
  }

  await writeSavedItems(
    chromeApi,
    movePersistentTreeNode(ensured.roots, tabShadow.id, openerShadow.id, openerShadow.children.length)
  );
}

function isUserTreeTabUrl(url: string): boolean {
  return !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('devtools://');
}

function uniqueNodeId(node: PersistentTreeNode, index: number, nodes: readonly PersistentTreeNode[]): boolean {
  return nodes.findIndex((candidate) => candidate.id === node.id) === index;
}

function targetWindowId(target: PersistentItemTarget): number {
  switch (target.kind) {
    case 'live-window':
    case 'live-tab':
      return readBrowserId(target.windowId, 'window');
    case 'root':
    case 'saved':
      return -1;
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

type ResolvedPersistentTarget = Readonly<{
  roots: readonly SavedItemRecord[];
  parentId: string | null;
}>;

async function resolvePersistentTarget(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  target: PersistentItemTarget
): Promise<ResolvedPersistentTarget> {
  switch (target.kind) {
    case 'root':
      return { roots, parentId: null };
    case 'saved':
      return { roots, parentId: target.id };
    case 'live-window': {
      const ensured = await ensureLiveWindowShadow(chromeApi, roots, readBrowserId(target.windowId, 'window'));
      return { roots: ensured.roots, parentId: ensured.window.id };
    }
    case 'live-tab': {
      const tabId = readBrowserId(target.tabId, 'tab');
      const ensured = await ensureLiveWindowShadow(chromeApi, roots, readBrowserId(target.windowId, 'window'));
      const tab = findLiveTab(ensured.roots, tabId);
      if (!tab) {
        throw new Error('The selected live tab no longer exists.');
      }
      return { roots: ensured.roots, parentId: tab.id };
    }
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

type EnsuredLiveWindow = Readonly<{
  roots: readonly SavedItemRecord[];
  window: SavedWindowRecord & Readonly<{ binding: { state: 'live'; windowId: number; focused: boolean } }>;
}>;

async function ensureLiveWindowShadow(
  chromeApi: typeof chrome,
  roots: readonly SavedItemRecord[],
  windowId: number,
  knownBrowserWindow?: chrome.windows.Window
): Promise<EnsuredLiveWindow> {
  const browserWindow = knownBrowserWindow ?? await chromeApi.windows.get(windowId, { populate: true });
  const existingWindow = findLiveWindow(roots, windowId);
  if (existingWindow) {
    const missingTabs = createMissingLiveTabShadows(roots, browserWindow);
    const bounds = readWindowBounds(browserWindow);
    if (missingTabs.length === 0 && equalWindowBounds(existingWindow.bounds, bounds)) {
      return { roots, window: existingWindow };
    }
    const nextRoots = updatePersistentTreeNode(roots, existingWindow.id, (node) => ({
      ...node,
      ...(bounds ? { bounds } : {}),
      children: [...node.children, ...missingTabs]
    }));
    const updatedWindow = findLiveWindow(nextRoots, windowId);
    if (!updatedWindow) {
      throw new Error('The live window shadow disappeared while adding its new tabs.');
    }
    return { roots: nextRoots, window: updatedWindow };
  }
  const window = createLiveWindowShadow(browserWindow, windowId, createMissingLiveTabShadows(roots, browserWindow));
  return { roots: [...roots, window], window };
}

function createMissingLiveTabShadows(
  roots: readonly SavedItemRecord[],
  browserWindow: chrome.windows.Window
): SavedTabRecord[] {
  return (browserWindow.tabs ?? []).flatMap((tab): readonly SavedTabRecord[] => {
    if (tab.id !== undefined && findLiveTab(roots, tab.id)) {
      return [];
    }
    const liveTab = createLiveTabShadow(tab);
    return liveTab ? [liveTab] : [];
  });
}

function createLiveWindowShadow(
  browserWindow: chrome.windows.Window,
  windowId: number,
  children: readonly SavedTabRecord[]
): EnsuredLiveWindow['window'] {
  const activeTab = browserWindow.tabs?.find((tab) => tab.active);
  const bounds = readWindowBounds(browserWindow);
  return {
    kind: 'window',
    id: createSavedId('window'),
    title: activeTab?.title || activeTab?.url || `Window with ${children.length} tabs`,
    ...(bounds ? { bounds } : {}),
    binding: { state: 'live', windowId, focused: browserWindow.focused },
    children
  };
}

function readWindowBounds(browserWindow: chrome.windows.Window): PersistentWindowBounds | undefined {
  const { left, top, width, height } = browserWindow;
  return left !== undefined && top !== undefined && width !== undefined && height !== undefined
    ? { left, top, width, height }
    : undefined;
}

function equalWindowBounds(
  left: PersistentWindowBounds | undefined,
  right: PersistentWindowBounds | undefined
): boolean {
  return (
    left?.left === right?.left &&
    left?.top === right?.top &&
    left?.width === right?.width &&
    left?.height === right?.height
  );
}

function createLiveTabShadow(tab: chrome.tabs.Tab): SavedTabRecord | null {
  const url = tab.url ?? tab.pendingUrl;
  if (tab.id === undefined || !url) {
    return null;
  }
  return {
    kind: 'tab',
    id: createSavedId('tab'),
    title: tab.title || url,
    url,
    active: tab.active,
    pinned: tab.pinned,
    binding: { state: 'live', tabId: tab.id, windowId: tab.windowId, index: tab.index },
    children: []
  };
}

type RestoredItem = { kind: 'tab'; id: number } | { kind: 'window'; id: number };

type Retention = Readonly<{ savedAt: number; sessionId: string }>;

function createSavedTab(tab: chrome.tabs.Tab, liveShadow?: LiveSavedTab, retention = createRetention()): SavedTabRecord {
  const url = tab.url ?? tab.pendingUrl;
  if (!url) {
    throw new Error('This tab does not expose a restorable URL.');
  }
  return {
    kind: 'tab',
    id: liveShadow?.id ?? createSavedId('tab'),
    title: tab.title || url,
    url,
    active: tab.active,
    pinned: tab.pinned,
    binding: {
      state: 'saved',
      ...retention,
      originalWindowId: tab.windowId,
      originalIndex: tab.index
    },
    children: liveShadow?.children ?? []
  };
}

function createRetention(): Retention {
  return { savedAt: Date.now(), sessionId: createRetentionSessionId() };
}

function createRetentionSessionId(): string {
  return crypto.randomUUID();
}

function createOrganizerRecord(
  kind: 'group' | 'note' | 'separator',
  title: string,
  separatorStyle: 0 | 1 | 2
): SavedGroupRecord | SavedNoteRecord | SavedSeparatorRecord {
  switch (kind) {
    case 'group':
      return { kind, id: createSavedId(kind), title: title || 'Group', children: [] };
    case 'note':
      return { kind, id: createSavedId(kind), text: title || 'Note', children: [] };
    case 'separator':
      return { kind, id: createSavedId(kind), style: separatorStyle, children: [] };
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

function createGoogleDocRecord(originalWindowId: number): SavedTabRecord {
  const retention = createRetention();
  return {
    kind: 'tab',
    id: createSavedId('tab'),
    title: 'Untitled document',
    url: GOOGLE_DOC_CREATE_URL,
    active: false,
    pinned: false,
    keepOnClose: true,
    binding: {
      state: 'saved',
      ...retention,
      originalWindowId,
      originalIndex: Number.MAX_SAFE_INTEGER
    },
    children: []
  };
}

function placementWindowId(placement: PersistentMovePlacement): number {
  if (placement.kind === 'tree-end') {
    return -1;
  }
  const target = placement.target;
  return target.kind === 'live-window' || target.kind === 'live-tab'
    ? readBrowserId(target.windowId, 'window')
    : -1;
}

function findSavedTab(items: readonly SavedItemRecord[], savedTabId: string): SavedTabRecord | undefined {
  const node = findPersistentTreeNode(items, savedTabId);
  return node?.kind === 'tab' && node.binding.state !== 'live' ? node : undefined;
}

function findLiveWindow(nodes: readonly SavedItemRecord[], windowId: number): EnsuredLiveWindow['window'] | undefined {
  for (const node of nodes) {
    if (isLiveSavedWindow(node) && node.binding.windowId === windowId) {
      return node;
    }
    const descendant = findLiveWindow(node.children, windowId);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

function isLiveSavedWindow(node: SavedItemRecord): node is EnsuredLiveWindow['window'] {
  return node.kind === 'window' && node.binding.state === 'live';
}

type LiveSavedTab = SavedTabRecord & Readonly<{
  binding: { state: 'live'; tabId: number; windowId: number; index: number };
}>;

function findLiveTab(nodes: readonly SavedItemRecord[], tabId: number): LiveSavedTab | undefined {
  for (const node of nodes) {
    if (isLiveSavedTab(node) && node.binding.tabId === tabId) {
      return node;
    }
    const descendant = findLiveTab(node.children, tabId);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

function findLiveTabs(nodes: readonly SavedItemRecord[], tabId: number): LiveSavedTab[] {
  return nodes.flatMap((node): LiveSavedTab[] => [
    ...(isLiveSavedTab(node) && node.binding.tabId === tabId ? [node] : []),
    ...findLiveTabs(node.children, tabId)
  ]);
}

function isLiveSavedTab(node: SavedItemRecord): node is LiveSavedTab {
  return node.kind === 'tab' && node.binding.state === 'live';
}

function collectSavedTabs(nodes: readonly SavedItemRecord[]): readonly SavedTabRecord[] {
  return nodes.flatMap((node): readonly SavedTabRecord[] => [
    ...(node.kind === 'tab' && node.binding.state !== 'live' ? [node] : []),
    ...collectSavedTabs(node.children)
  ]);
}

function collectHierarchyTabs(nodes: readonly SavedItemRecord[]): readonly SavedTabRecord[] {
  return nodes.flatMap((node): readonly SavedTabRecord[] => [
    ...(node.kind === 'tab' ? [node] : []),
    ...collectHierarchyTabs(node.children)
  ]);
}

async function writeSavedItems(chromeApi: typeof chrome, items: readonly SavedItemRecord[]): Promise<void> {
  const nextDocument = createPersistentTreeDocument(items);
  const storage = await chromeApi.storage.local.get([
    SAVED_ITEMS_STORAGE_KEY,
    LOCAL_TREE_SNAPSHOTS_STORAGE_KEY
  ]);
  const previousDocument: unknown = storage[SAVED_ITEMS_STORAGE_KEY];
  const snapshots = parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]);
  const nextSnapshots =
    isPersistentTreeDocument(previousDocument) &&
    !equalPersistentTreeDocuments(previousDocument, nextDocument) &&
    shouldCreateAutomaticSnapshot(snapshots)
      ? appendPersistentTreeSnapshot(snapshots, createPersistentTreeSnapshot(previousDocument))
      : snapshots;
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: nextDocument,
    [LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]: nextSnapshots
  });
}

function equalPersistentTreeDocuments(
  left: PersistentTreeDocument,
  right: PersistentTreeDocument
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadDeletionHistory(chromeApi: typeof chrome): Promise<readonly PersistentTreeDeletion[]> {
  const storage = await chromeApi.storage.local.get(DELETED_ITEMS_STORAGE_KEY);
  return parsePersistentTreeDeletions(storage[DELETED_ITEMS_STORAGE_KEY]);
}


function nextSeparatorStyle(style: SavedSeparatorRecord['style']): SavedSeparatorRecord['style'] {
  switch (style) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 0;
    default: {
      const exhaustiveStyle: never = style;
      return exhaustiveStyle;
    }
  }
}

async function createRestoredTab(chromeApi: typeof chrome, savedTab: SavedTabRecord): Promise<RestoredItem> {
  if (savedTab.binding.state === 'live') {
    throw new Error('The selected tab is already open.');
  }
  const originalWindow = await getNormalWindow(chromeApi, savedTab.binding.originalWindowId);
  if (originalWindow?.id !== undefined) {
    const tab = await createInternalChromeTab(chromeApi, {
      windowId: originalWindow.id,
      index: Math.min(savedTab.binding.originalIndex, (originalWindow.tabs?.length ?? savedTab.binding.originalIndex) + 1),
      url: savedTab.url,
      active: false,
      pinned: savedTab.pinned
    });
    if (tab.id === undefined) {
      throw new Error('Chromium did not create the restored tab.');
    }
    return { kind: 'tab', id: tab.id };
  }

  const browserWindow = await chromeApi.windows.create({ focused: true, type: 'normal', url: savedTab.url });
  if (browserWindow?.id === undefined) {
    throw new Error('Chromium did not create a window for the restored tab.');
  }
  return { kind: 'window', id: browserWindow.id };
}

async function readRestoredTab(
  chromeApi: typeof chrome,
  restored: RestoredItem,
  expectedUrl: string
): Promise<chrome.tabs.Tab> {
  if (restored.kind === 'tab') {
    return chromeApi.tabs.get(restored.id);
  }
  const browserWindow = await chromeApi.windows.get(restored.id, { populate: true });
  const tab =
    browserWindow.tabs?.find((candidate) => (candidate.url ?? candidate.pendingUrl) === expectedUrl) ??
    browserWindow.tabs?.[0];
  if (!tab) {
    throw new Error('Chromium did not expose the restored tab.');
  }
  return tab;
}

async function getNormalWindow(chromeApi: typeof chrome, windowId: number): Promise<chrome.windows.Window | undefined> {
  try {
    const browserWindow = await chromeApi.windows.get(windowId, { populate: true });
    return browserWindow.type === 'normal' ? browserWindow : undefined;
  } catch {
    return undefined;
  }
}

async function closeRestoredItem(chromeApi: typeof chrome, item: RestoredItem): Promise<void> {
  if (item.kind === 'tab') {
    await chromeApi.tabs.remove(item.id);
    return;
  }
  await chromeApi.windows.remove(item.id);
}

function createSavedId(kind: SavedItemRecord['kind']): string {
  return `${kind}-${crypto.randomUUID()}`;
}

function readBrowserId(value: string, label: 'tab' | 'window'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`Invalid ${label} id: ${value}`);
  }
  return id;
}

const MAX_DELETION_HISTORY = 50;
