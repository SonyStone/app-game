import type { ExplorerBackend } from '../../explorer/backend';
import type {
  ExplorerSourceId,
  ExplorerTreeGroupNode,
  ExplorerTreeLinkNode,
  ExplorerTreeNode
} from '../../explorer/model';
import { createEmptyExplorerDocument, portableChildren } from '../../explorer/portable';
import { createExplorerSourceRoot } from '../../explorer/treeFactories';
import exploreFixtureUrl from '../../fixtures/tree-exported-2.json?url';
import bookmarksFixtureUrl from '../../fixtures/tree-exported-4.json?url';
import { createDocumentExplorerBackend } from '../document/createDocumentExplorerBackend';

/** Creates an editable website backend initialized from the historical Tabs Outliner fixtures. */
export function createFixtureExplorerBackend(): ExplorerBackend {
  const exploreFixture = loadFixture(exploreFixtureUrl, 'explore-fixture');
  const bookmarksFixture = loadFixture(bookmarksFixtureUrl, 'bookmarks-fixture');
  const documentBackend = Promise.all([exploreFixture, bookmarksFixture]).then(([explore, bookmarks]) => {
    const document = createEmptyExplorerDocument('Local workspace');
    document.sources.explore = portableChildren(createFixtureTree('explore', 'Saved tabs fixture', explore));
    document.sources.bookmarks = portableChildren(createFixtureTree('bookmarks', 'Bookmarks fixture', bookmarks));
    document.sources.history = portableChildren(createFixtureHistoryTree(explore));
    return createDocumentExplorerBackend(document);
  });

  return {
    capabilities: {
      sources: { explore: true, bookmarks: true, history: true },
      commands: {
        'move-tab': false,
        'open-tab': false,
        'move-bookmark': false,
        'create-bookmark': false,
        'import-items': true,
        'move-document-node': true
      }
    },
    async load(source) {
      return (await documentBackend).backend.load(source);
    },
    subscribe(listener) {
      let unsubscribe: () => void = () => undefined;
      let active = true;
      void documentBackend.then((document) => {
        if (active) {
          unsubscribe = document.backend.subscribe(listener);
        }
      });
      return () => {
        active = false;
        unsubscribe();
      };
    },
    async execute(command) {
      await (await documentBackend).backend.execute(command);
    }
  };
}

async function loadFixture(url: string, fixtureId: string): Promise<FixtureNode> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fixture ${fixtureId} could not be loaded (${response.status}).`);
  }
  return parseFixture(await response.text(), fixtureId);
}

function createFixtureTree(
  source: Extract<ExplorerSourceId, 'explore' | 'bookmarks'>,
  title: string,
  fixture: FixtureNode
): ExplorerTreeNode {
  return createExplorerSourceRoot(
    source,
    title,
    fixture.children.map((node, index) => createFixtureNode(source, node, index))
  );
}

function createFixtureNode(source: ExplorerSourceId, node: FixtureNode, index: number): ExplorerTreeNode {
  const children = node.children.map((child, childIndex) => createFixtureNode(source, child, childIndex));
  if (node.url) {
    return {
      id: `${source}-fixture-link-${node.id}`,
      kind: 'link',
      source,
      reference: { kind: 'fixture-link', id: node.id },
      index,
      draggable: true,
      title: node.title,
      url: node.url,
      faviconUrl: node.faviconUrl,
      description: node.url,
      children,
      defaultCollapsed: node.defaultCollapsed
    };
  }

  return {
    id: `${source}-fixture-group-${node.id}`,
    kind: 'group',
    groupKind: source === 'explore' && isWindowType(node.type) ? 'window' : 'folder',
    source,
    reference: { kind: 'fixture-group', id: node.id },
    index,
    draggable: true,
    acceptsDrop: false,
    title: node.title,
    children,
    defaultCollapsed: node.defaultCollapsed
  };
}

function createFixtureHistoryTree(fixture: FixtureNode): ExplorerTreeNode {
  const links = collectFixtureLinks(fixture).sort((left, right) => right.lastAccessed - left.lastAccessed);
  const groups = new Map<string, { title: string; links: FixtureNode[] }>();

  for (const link of links) {
    const date = link.lastAccessed > 0 ? new Date(link.lastAccessed) : null;
    const key = date ? createLocalDateKey(date) : 'unknown';
    const group = groups.get(key) ?? {
      title: date ? historyDateFormatter.format(date) : 'Unknown date',
      links: []
    };
    group.links.push(link);
    groups.set(key, group);
  }

  const children = [...groups.entries()].map(([key, group], index) => ({
    id: `history-fixture-date-${key}`,
    kind: 'group',
    groupKind: 'date',
    source: 'history',
    reference: { kind: 'history-date', id: key },
    index,
    draggable: true,
    acceptsDrop: false,
    title: group.title,
    children: group.links.map(
      (link, linkIndex) =>
        ({
          id: `history-fixture-link-${link.id}`,
          kind: 'link',
          source: 'history',
          reference: { kind: 'fixture-link', id: link.id },
          index: linkIndex,
          draggable: true,
          title: link.title,
          url: link.url,
          faviconUrl: link.faviconUrl,
          description: link.lastAccessed
            ? `${historyTimeFormatter.format(new Date(link.lastAccessed))} · fixture history`
            : 'Fixture history',
          children: [],
          defaultCollapsed: false
        }) satisfies ExplorerTreeLinkNode
    ),
    defaultCollapsed: index > 0
  })) satisfies ExplorerTreeGroupNode[];

  return createExplorerSourceRoot('history', 'History fixture', children);
}

function collectFixtureLinks(node: FixtureNode): FixtureNode[] {
  return [...(node.url ? [node] : []), ...node.children.flatMap(collectFixtureLinks)];
}

type FixtureNode = {
  id: string;
  type: string;
  title: string;
  url: string | null;
  faviconUrl: string | null;
  lastAccessed: number;
  defaultCollapsed: boolean;
  children: FixtureNode[];
};

function parseFixture(serialized: string, fixtureId: string): FixtureNode {
  const value: unknown = JSON.parse(serialized);
  if (Array.isArray(value)) {
    return parseFixtureLog(value, fixtureId);
  }
  return parseFixtureNode(value, fixtureId);
}

function parseFixtureLog(entries: readonly unknown[], fixtureId: string): FixtureNode {
  const rootEntry = entries[0];
  if (!isRecord(rootEntry) || rootEntry.type !== FIXTURE_ROOT_EVENT || !('node' in rootEntry)) {
    throw new Error(`Fixture ${fixtureId} does not start with a valid root event.`);
  }

  const root = parseFixtureNode(rootEntry.node, fixtureId);
  const childrenByParent = new Map<string, { index: number; node: FixtureNode; path: string }[]>();

  for (const [entryIndex, entry] of entries.slice(1).entries()) {
    if (isRecord(entry) && entry.type === FIXTURE_END_EVENT) {
      continue;
    }
    if (!isFixtureInsert(entry)) {
      throw new Error(`Fixture ${fixtureId} has an invalid entry at index ${entryIndex + 1}.`);
    }

    const [, nodeValue, path] = entry;
    if (path.length === 0) {
      throw new Error(`Fixture ${fixtureId} contains an empty insertion path.`);
    }

    const itemIndex = path.at(-1);
    if (itemIndex === undefined) {
      throw new Error(`Fixture ${fixtureId} contains an invalid insertion path.`);
    }

    const itemPath = path.join('.');
    const parentPath = path.slice(0, -1).join('.');
    const siblings = childrenByParent.get(parentPath) ?? [];
    siblings.push({ index: itemIndex, node: parseFixtureNode(nodeValue, `${fixtureId}-${itemPath}`), path: itemPath });
    childrenByParent.set(parentPath, siblings);
  }

  attachFixtureChildren(root, '', childrenByParent);
  return root;
}

function attachFixtureChildren(
  node: FixtureNode,
  path: string,
  childrenByParent: ReadonlyMap<string, { index: number; node: FixtureNode; path: string }[]>
): void {
  const children = [...(childrenByParent.get(path) ?? [])].sort((left, right) => left.index - right.index);
  node.children = children.map((child) => {
    attachFixtureChildren(child.node, child.path, childrenByParent);
    return child.node;
  });
}

function parseFixtureNode(value: unknown, id: string): FixtureNode {
  if (!isRecord(value)) {
    throw new Error(`Fixture node ${id} is not an object.`);
  }

  const data = isRecord(value.data) ? value.data : {};
  const marks = isRecord(value.marks) ? value.marks : {};
  const type = typeof value.type === 'string' ? value.type : 'default';
  const title =
    readNonEmptyString(marks.customTitle) ?? readNonEmptyString(data.title) ?? defaultFixtureTitle(type, data);
  const childValues = Array.isArray(value.children) ? value.children : [];

  return {
    id,
    type,
    title,
    url: typeof data.url === 'string' ? data.url : null,
    faviconUrl: readNonEmptyString(data.favIconUrl),
    lastAccessed: typeof data.lastAccessed === 'number' ? data.lastAccessed : 0,
    defaultCollapsed: value.colapsed === true,
    children: childValues.map((child, index) => parseFixtureNode(child, `${id}-${index}`))
  };
}

function defaultFixtureTitle(type: string, data: Record<string, unknown>): string {
  if (isWindowType(type)) {
    const dateValue = typeof data.closeDate === 'number' ? data.closeDate : data.crashDetectedDate;
    const suffix = typeof dateValue === 'number' ? ` (${new Date(dateValue).toDateString()})` : '';
    return `Window${suffix}`;
  }
  return type === 'session' ? 'Current Session' : 'Untitled item';
}

function isFixtureInsert(value: unknown): value is readonly [number, unknown, number[]] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === FIXTURE_INSERT_EVENT &&
    Array.isArray(value[2]) &&
    value[2].every((segment) => Number.isInteger(segment) && segment >= 0)
  );
}

function isWindowType(type: string): boolean {
  return type === 'savedwin' || type === 'win';
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const FIXTURE_ROOT_EVENT = 2_000;
const FIXTURE_INSERT_EVENT = 2_001;
const FIXTURE_END_EVENT = 11_111;

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
