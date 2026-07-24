import type { ExplorerBackend, ExplorerCommand } from '../../explorer/backend';
import { FULL_EXPLORER_CAPABILITIES } from '../../explorer/backend';
import type {
  ExplorerSourceId,
  ExplorerTreeGroupNode,
  ExplorerTreeLinkNode,
  ExplorerTreeNode
} from '../../explorer/model';
import type { PortableExplorerNode } from '../../explorer/portable';
import { createExplorerSourceRoot } from '../../explorer/treeFactories';

/** Creates an explorer backend backed entirely by privileged Chrome extension APIs. */
export function createChromeExplorerBackend(chromeApi: typeof chrome = requireChromeApi()): ExplorerBackend {
  return {
    capabilities: FULL_EXPLORER_CAPABILITIES,
    load: (source) => loadTree(chromeApi, source),
    subscribe: (listener) => subscribeToChrome(chromeApi, listener),
    execute: (command) => executeChromeCommand(chromeApi, command)
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

async function executeChromeCommand(chromeApi: typeof chrome, command: ExplorerCommand): Promise<void> {
  switch (command.kind) {
    case 'move-tab':
      await moveTabWithRetry(chromeApi, readNumericId(command.tabId, 'tab'), {
        windowId: readNumericId(command.targetWindowId, 'window'),
        index: command.targetIndex
      });
      return;
    case 'open-tab':
      await chromeApi.tabs.create({
        windowId: readNumericId(command.windowId, 'window'),
        index: command.index,
        url: command.url,
        active: false
      });
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

async function importChromeItems(
  chromeApi: typeof chrome,
  target: Extract<ExplorerCommand, { kind: 'import-items' }>['target'],
  index: number,
  items: readonly PortableExplorerNode[]
): Promise<void> {
  if (target.kind === 'window') {
    const urls = items.flatMap(collectPortableLinks).map((link) => link.url);
    for (const [offset, url] of urls.entries()) {
      await chromeApi.tabs.create({
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

  const folder = await chromeApi.bookmarks.create({ parentId, index, title: item.title });
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
  const windows = await chromeApi.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] });
  const children = windows.map((browserWindow, windowIndex) => {
    const windowId = String(browserWindow.id ?? windowIndex);
    const tabs = [...(browserWindow.tabs ?? [])].sort((left, right) => left.index - right.index);

    return {
      id: `explore-window-${windowId}`,
      kind: 'group',
      groupKind: 'window',
      source: 'explore',
      reference: { kind: 'window', id: windowId },
      index: windowIndex,
      draggable: true,
      acceptsDrop: true,
      title: `Window ${windowIndex + 1}${browserWindow.focused ? ' (focused)' : ''}`,
      children: tabs.map((tab) => createTabNode(chromeApi, tab)),
      defaultCollapsed: false
    } satisfies ExplorerTreeGroupNode;
  });

  return createExplorerSourceRoot('explore', 'Open tabs', children);
}

function createTabNode(chromeApi: typeof chrome, tab: chrome.tabs.Tab): ExplorerTreeLinkNode {
  const url = tab.url ?? tab.pendingUrl ?? null;
  const tabId = String(tab.id ?? `${tab.windowId}-${tab.index}`);
  return {
    id: `explore-tab-${tabId}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'tab', id: tabId, windowId: String(tab.windowId) },
    index: tab.index,
    draggable: tab.id !== undefined,
    title: tab.title || url || 'Untitled tab',
    url,
    faviconUrl: createFaviconUrl(chromeApi, url),
    description: `${tab.active ? 'Active tab · ' : ''}${url ?? 'URL unavailable'}`,
    children: [],
    defaultCollapsed: false
  };
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
