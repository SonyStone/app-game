import {
  createPersistentTreeDocument,
  isPersistentTreeDocument,
  type PersistentTabNode,
  type PersistentTreeDocument,
  type PersistentTreeNode,
  type PersistentWindowNode
} from '../../persistent-tree/model';
import type { TabBinding } from '../../persistent-tree/model';
import { SAVED_ITEMS_STORAGE_KEY } from './savedItems';
import { markSavedWindows } from './windowMarkers';

/** Durable snapshot used to recover browser context after an unclean shutdown. */
export const LIVE_CHECKPOINT_STORAGE_KEY = 'browserAtlas.liveCheckpoint.v1';

/** Installs background listeners that keep a live checkpoint and recover missing tabs on browser startup. */
export function installLiveCheckpointTracking(chromeApi: typeof chrome): void {
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleUpdate = () => {
    if (updateTimer !== undefined) {
      clearTimeout(updateTimer);
    }
    updateTimer = setTimeout(() => {
      updateTimer = undefined;
      void writeLiveCheckpoint(chromeApi).catch(reportCheckpointError);
    }, 100);
  };

  chromeApi.runtime.onStartup.addListener(() => {
    void recoverCrashedBrowserState(chromeApi).catch(reportCheckpointError);
  });
  chromeApi.runtime.onInstalled.addListener(() => {
    void writeLiveCheckpoint(chromeApi).catch(reportCheckpointError);
  });
  chromeApi.tabs.onCreated.addListener(scheduleUpdate);
  chromeApi.tabs.onUpdated.addListener(scheduleUpdate);
  chromeApi.tabs.onMoved.addListener(scheduleUpdate);
  chromeApi.tabs.onAttached.addListener(scheduleUpdate);
  chromeApi.tabs.onDetached.addListener(scheduleUpdate);
  chromeApi.tabs.onRemoved.addListener(scheduleUpdate);
  chromeApi.tabs.onReplaced.addListener(scheduleUpdate);
  chromeApi.windows.onCreated.addListener(scheduleUpdate);
  chromeApi.windows.onRemoved.addListener(scheduleUpdate);
}

/** Compares the last live checkpoint with current and deliberately saved tabs, retaining anything missing as crashed. */
export async function recoverCrashedBrowserState(chromeApi: typeof chrome): Promise<number> {
  const [storage, currentTree] = await Promise.all([
    chromeApi.storage.local.get([LIVE_CHECKPOINT_STORAGE_KEY, SAVED_ITEMS_STORAGE_KEY]),
    captureLiveTree(chromeApi)
  ]);
  const checkpointValue: unknown = storage[LIVE_CHECKPOINT_STORAGE_KEY];
  const savedValue: unknown = storage[SAVED_ITEMS_STORAGE_KEY];
  const checkpoint = isPersistentTreeDocument(checkpointValue) ? checkpointValue : null;
  const savedTree = isPersistentTreeDocument(savedValue) ? savedValue : createPersistentTreeDocument();
  const recoveredAt = Date.now();
  const reconciledSavedRoots = reconcilePersistentLiveNodes(savedTree.roots, currentTree.roots, recoveredAt);
  const recovered = checkpoint
    ? recoverMissingCheckpointNodes(checkpoint.roots, currentTree.roots, reconciledSavedRoots, recoveredAt)
    : [];
  const nextRoots = [...reconciledSavedRoots, ...recovered];

  await chromeApi.storage.local.set({
    [LIVE_CHECKPOINT_STORAGE_KEY]: currentTree,
    [SAVED_ITEMS_STORAGE_KEY]: createPersistentTreeDocument(nextRoots)
  });
  const recoveredWindowIds = collectNewlyCrashedWindowIds(nextRoots, recoveredAt);
  if (recoveredWindowIds.length > 0) {
    await markSavedWindows(
      chromeApi,
      Object.fromEntries(recoveredWindowIds.map((id) => [id, 'crash-recovered'] as const))
    );
  }
  return recovered.reduce((count, window) => count + countTabs(window.children), 0);
}

function collectNewlyCrashedWindowIds(
  nodes: readonly PersistentTreeNode[],
  recoveredAt: number
): readonly string[] {
  return nodes.flatMap((node): readonly string[] => [
    ...(node.kind === 'window' && node.binding.state === 'crashed' && node.binding.savedAt === recoveredAt
      ? [node.id]
      : []),
    ...collectNewlyCrashedWindowIds(node.children, recoveredAt)
  ]);
}

/** Rebinds stored live shadows to the current browser session or retains annotated missing nodes as crashed. */
export function reconcilePersistentLiveNodes(
  storedNodes: readonly PersistentTreeNode[],
  currentNodes: readonly PersistentTreeNode[],
  reconciledAt: number
): readonly PersistentTreeNode[] {
  const currentTabs = collectLiveTabs(currentNodes);
  const currentWindows = collectLiveWindows(currentNodes);
  const usedTabIds = new Set<number>();
  return reconcileNodes(storedNodes);

  function reconcileNodes(
    nodes: readonly PersistentTreeNode[],
    containingSessionId?: string
  ): readonly PersistentTreeNode[] {
    return nodes.flatMap((node): readonly PersistentTreeNode[] => {
      const sessionId = isLivePersistentWindow(node) ? crypto.randomUUID() : containingSessionId;
      const children = reconcileNodes(node.children, sessionId);
      if (isLivePersistentTab(node)) {
        const currentTab = matchCurrentTab(node);
        if (currentTab) {
          return [
            {
              ...node,
              title: currentTab.title,
              url: currentTab.url,
              active: currentTab.active,
              pinned: currentTab.pinned,
              binding: currentTab.binding,
              children
            }
          ];
        }
        return children.length === 0
          ? []
          : [
              {
                ...node,
                active: false,
                binding: {
                  state: 'crashed',
                  savedAt: reconciledAt,
                  sessionId: sessionId ?? crypto.randomUUID(),
                  originalWindowId: node.binding.windowId,
                  originalIndex: node.binding.index
                },
                children
              }
            ];
      }
      if (isLivePersistentWindow(node)) {
        const childWindowId = findFirstLiveTabWindowId(children);
        const currentWindow =
          currentWindows.find((candidate) => candidate.binding.windowId === node.binding.windowId) ??
          currentWindows.find((candidate) => candidate.binding.windowId === childWindowId);
        if (currentWindow) {
          return [{ ...node, title: currentWindow.title, binding: currentWindow.binding, children }];
        }
        return children.length === 0
          ? []
          : [{
              ...node,
              binding: {
                state: 'crashed',
                savedAt: reconciledAt,
                sessionId: sessionId ?? crypto.randomUUID()
              },
              children
            }];
      }
      return [{ ...node, children }];
    });
  }

  function matchCurrentTab(storedTab: LivePersistentTab): LivePersistentTab | undefined {
    const sameId = currentTabs.find(
      (candidate) => candidate.binding.tabId === storedTab.binding.tabId && !usedTabIds.has(candidate.binding.tabId)
    );
    const match =
      sameId ??
      currentTabs.find((candidate) => candidate.url === storedTab.url && !usedTabIds.has(candidate.binding.tabId));
    if (match) {
      usedTabIds.add(match.binding.tabId);
    }
    return match;
  }
}

/** Produces crash-recovered windows for checkpoint tabs absent from both live and deliberately saved state. */
export function recoverMissingCheckpointNodes(
  checkpointNodes: readonly PersistentTreeNode[],
  currentNodes: readonly PersistentTreeNode[],
  savedNodes: readonly PersistentTreeNode[],
  recoveredAt: number,
  createId: (kind: 'tab' | 'window') => string = createRecoveredId
): readonly PersistentWindowNode[] {
  const availableUrls = countUrls([...currentNodes, ...savedNodes]);
  return checkpointNodes.flatMap((node): readonly PersistentWindowNode[] => {
    if (node.kind !== 'window' || node.binding.state !== 'live') {
      return [];
    }
    const missingTabs = collectLiveTabs(node.children).filter((tab) => !consumeUrl(availableUrls, tab.url));
    if (missingTabs.length === 0) {
      return [];
    }
    const sessionId = crypto.randomUUID();
    return [
      {
        kind: 'window',
        id: createId('window'),
        title: `Recovered · ${node.title}`,
        binding: { state: 'crashed', savedAt: recoveredAt, sessionId },
        children: missingTabs.map((tab) => ({
          ...tab,
          id: createId('tab'),
          active: false,
          binding: {
            state: 'crashed',
            savedAt: recoveredAt,
            sessionId,
            originalWindowId: tab.binding.windowId,
            originalIndex: tab.binding.index
          }
        }))
      }
    ];
  });
}

type LivePersistentTab = PersistentTabNode & Readonly<{ binding: Extract<TabBinding, { state: 'live' }> }>;

type LivePersistentWindow = PersistentWindowNode & Readonly<{
  binding: { state: 'live'; windowId: number; focused: boolean };
}>;

/** Captures all restorable live normal and popup windows as Persistent Tree v2 nodes. */
export async function captureLiveTree(chromeApi: typeof chrome): Promise<PersistentTreeDocument> {
  const windows = await chromeApi.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] });
  return createPersistentTreeDocument(
    windows.flatMap((browserWindow): readonly PersistentWindowNode[] => {
      if (browserWindow.id === undefined) {
        return [];
      }
      const windowId = browserWindow.id;
      const tabs = (browserWindow.tabs ?? []).flatMap((tab): readonly PersistentTabNode[] => {
        const url = tab.url ?? tab.pendingUrl;
        if (tab.id === undefined || !url || !isCheckpointUrl(url)) {
          return [];
        }
        return [
          {
            kind: 'tab',
            id: `checkpoint-tab-${tab.id}`,
            title: tab.title || url,
            url,
            active: tab.active,
            pinned: tab.pinned,
            binding: {
              state: 'live',
              tabId: tab.id,
              windowId,
              index: tab.index
            },
            children: []
          }
        ];
      });
      return [
        {
          kind: 'window',
          id: `checkpoint-window-${windowId}`,
          title: tabs.find((tab) => tab.active)?.title || `Window with ${tabs.length} tabs`,
          binding: { state: 'live', windowId, focused: browserWindow.focused },
          children: tabs
        }
      ];
    })
  );
}

async function writeLiveCheckpoint(chromeApi: typeof chrome): Promise<void> {
  await chromeApi.storage.local.set({ [LIVE_CHECKPOINT_STORAGE_KEY]: await captureLiveTree(chromeApi) });
}

function collectLiveTabs(nodes: readonly PersistentTreeNode[]): readonly LivePersistentTab[] {
  return nodes.flatMap((node): readonly LivePersistentTab[] => [
    ...(isLivePersistentTab(node) ? [node] : []),
    ...collectLiveTabs(node.children)
  ]);
}

function isLivePersistentTab(node: PersistentTreeNode): node is LivePersistentTab {
  return node.kind === 'tab' && node.binding.state === 'live';
}

function collectLiveWindows(nodes: readonly PersistentTreeNode[]): readonly LivePersistentWindow[] {
  return nodes.flatMap((node): readonly LivePersistentWindow[] => [
    ...(isLivePersistentWindow(node) ? [node] : []),
    ...collectLiveWindows(node.children)
  ]);
}

function isLivePersistentWindow(node: PersistentTreeNode): node is LivePersistentWindow {
  return node.kind === 'window' && node.binding.state === 'live';
}

function findFirstLiveTabWindowId(nodes: readonly PersistentTreeNode[]): number | undefined {
  for (const node of nodes) {
    if (isLivePersistentTab(node)) {
      return node.binding.windowId;
    }
    const descendantWindowId = findFirstLiveTabWindowId(node.children);
    if (descendantWindowId !== undefined) {
      return descendantWindowId;
    }
  }
  return undefined;
}

function countUrls(nodes: readonly PersistentTreeNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind === 'tab') {
      counts.set(node.url, (counts.get(node.url) ?? 0) + 1);
    }
    for (const [url, count] of countUrls(node.children)) {
      counts.set(url, (counts.get(url) ?? 0) + count);
    }
  }
  return counts;
}

function consumeUrl(counts: Map<string, number>, url: string): boolean {
  const count = counts.get(url) ?? 0;
  if (count === 0) {
    return false;
  }
  if (count === 1) {
    counts.delete(url);
  } else {
    counts.set(url, count - 1);
  }
  return true;
}

function countTabs(nodes: readonly PersistentTreeNode[]): number {
  return nodes.reduce((count, node) => count + (node.kind === 'tab' ? 1 : 0) + countTabs(node.children), 0);
}

function isCheckpointUrl(url: string): boolean {
  return !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('devtools://');
}

function createRecoveredId(kind: 'tab' | 'window'): string {
  return `crashed-${kind}-${crypto.randomUUID()}`;
}

function reportCheckpointError(reason: unknown): void {
  console.error('Browser Atlas could not update its crash-recovery checkpoint.', reason);
}
