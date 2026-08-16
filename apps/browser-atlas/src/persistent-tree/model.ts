/** Stable format name for Browser Atlas' persisted browsing tree. */
export const PERSISTENT_TREE_FORMAT = 'browser-atlas-tree';

/** Current persisted tree schema. No migration is required before the first public release. */
export const PERSISTENT_TREE_VERSION = 2;

/** A complete browser tree snapshot containing live, saved, and crashed browsing context. */
export type PersistentTreeDocument = Readonly<{
  format: typeof PERSISTENT_TREE_FORMAT;
  version: typeof PERSISTENT_TREE_VERSION;
  roots: readonly PersistentTreeNode[];
}>;

/** Any node that can participate in the persistent Browser Atlas hierarchy. */
export type PersistentTreeNode =
  | PersistentTabNode
  | PersistentWindowNode
  | PersistentGroupNode
  | PersistentNoteNode
  | PersistentSeparatorNode;

/** A tab whose durable identity is independent of its temporary browser tab ID. */
export type PersistentTabNode = PersistentTreeNodeBase<'tab'> &
  Readonly<{
    title: string;
    url: string;
    active: boolean;
    pinned: boolean;
    /** Retains the tab in the tree after a natural browser close. */
    keepOnClose?: boolean;
    binding: TabBinding;
  }>;

/** A browser window retaining arbitrary contextual descendants, not only direct tabs. */
export type PersistentWindowNode = PersistentTreeNodeBase<'window'> &
  Readonly<{
    title: string;
    /** Whether the title was explicitly edited and therefore protects a naturally closed window. */
    customTitle?: boolean;
    /** Last known normal-window position and size, used when restoring a retained session. */
    bounds?: PersistentWindowBounds;
    binding: WindowBinding;
  }>;

/** Screen coordinates and dimensions retained independently from a temporary browser window ID. */
export type PersistentWindowBounds = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** A user-created organizational branch that can contain any tree node. */
export type PersistentGroupNode = PersistentTreeNodeBase<'group'> & Readonly<{ title: string }>;

/** A user-created annotation that can itself retain contextual descendants. */
export type PersistentNoteNode = PersistentTreeNodeBase<'note'> & Readonly<{ text: string }>;

/** A visual rule that remains a first-class node during persistence and export. */
export type PersistentSeparatorNode = PersistentTreeNodeBase<'separator'> & Readonly<{ style: 0 | 1 | 2 }>;

type PersistentTreeNodeBase<TKind extends PersistentTreeNode['kind']> = Readonly<{
  kind: TKind;
  id: string;
  children: readonly PersistentTreeNode[];
}>;

/** Runtime or retained state associated with a tab node. */
export type TabBinding =
  | Readonly<{ state: 'live'; tabId: number; windowId: number; index: number }>
  | Readonly<{
      state: 'saved' | 'crashed';
      savedAt: number;
      sessionId: string;
      originalWindowId: number;
      originalIndex: number;
    }>;

/** Runtime or retained state associated with a window node. */
export type WindowBinding =
  | Readonly<{ state: 'live'; windowId: number; focused: boolean }>
  | Readonly<{ state: 'saved' | 'crashed'; savedAt: number; sessionId: string }>;

/** Creates an empty Persistent Tree v2 document. */
export function createPersistentTreeDocument(
  roots: readonly PersistentTreeNode[] = []
): PersistentTreeDocument {
  return { format: PERSISTENT_TREE_FORMAT, version: PERSISTENT_TREE_VERSION, roots };
}

/** Finds a node anywhere in a persistent tree. */
export function findPersistentTreeNode(
  nodes: readonly PersistentTreeNode[],
  nodeId: string
): PersistentTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const descendant = findPersistentTreeNode(node.children, nodeId);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

/** Location and complete hierarchy of one node in a persistent tree. */
export type PersistentTreeLocation = Readonly<{
  node: PersistentTreeNode;
  parentId: string | null;
  index: number;
}>;

/** Finds a node together with the parent and insertion index needed to restore it. */
export function findPersistentTreeLocation(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  parentId: string | null = null
): PersistentTreeLocation | undefined {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) {
      return { node, parentId, index };
    }
    const descendant = findPersistentTreeLocation(node.children, nodeId, node.id);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

/** Applies an immutable update to one node and throws when it no longer exists. */
export function updatePersistentTreeNode(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  update: (node: PersistentTreeNode) => PersistentTreeNode
): readonly PersistentTreeNode[] {
  const result = updatePersistentTreeNodeIfPresent(nodes, nodeId, update);
  if (!result.found) {
    throw new Error('The persistent tree node no longer exists.');
  }
  return result.nodes;
}

/** Moves a complete hierarchy to the root or inside any other node. */
export function movePersistentTreeNode(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  targetParentId: string | null,
  targetIndex: number
): readonly PersistentTreeNode[] {
  const node = findPersistentTreeNode(nodes, nodeId);
  if (!node) {
    throw new Error('The persistent tree node no longer exists.');
  }
  if (targetParentId === nodeId || findPersistentTreeNode(node.children, targetParentId ?? '')) {
    throw new Error('A tree hierarchy cannot be moved into itself.');
  }
  if (targetParentId !== null && !findPersistentTreeNode(nodes, targetParentId)) {
    throw new Error('The persistent tree destination no longer exists.');
  }

  const extraction = extractPersistentTreeNode(nodes, nodeId);
  if (!extraction.node) {
    throw new Error('The persistent tree node could not be removed from its current location.');
  }
  return insertPersistentTreeNode(extraction.nodes, targetParentId, targetIndex, extraction.node);
}

/** Promotes nested tabs while retaining groups/windows and their descendants as organizer boundaries. */
export function flattenPersistentTabsHierarchy(
  nodes: readonly PersistentTreeNode[],
  parentId: string
): readonly PersistentTreeNode[] {
  const parent = findPersistentTreeNode(nodes, parentId);
  if (!parent) {
    throw new Error('The hierarchy selected for flattening no longer exists.');
  }
  const movableIds: string[] = [];
  collectMovableIds(parent.children, parent.kind, true);
  return movableIds.reduceRight(
    (currentNodes, nodeId) => movePersistentTreeNode(currentNodes, nodeId, parentId, 0),
    nodes
  );

  function collectMovableIds(
    candidates: readonly PersistentTreeNode[],
    candidateParentKind: PersistentTreeNode['kind'],
    directChildren: boolean
  ): void {
    for (const candidate of candidates) {
      if (
        directChildren ||
        candidate.kind === 'tab' ||
        (candidate.kind === 'separator' && candidateParentKind === 'tab')
      ) {
        movableIds.push(candidate.id);
      }
      if (candidate.kind !== 'window' && candidate.kind !== 'group') {
        collectMovableIds(candidate.children, candidate.kind, false);
      }
    }
  }
}

/** Removes a hierarchy, or removes only its root while promoting direct children in its place. */
export function removePersistentTreeNode(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  mode: 'subtree' | 'promote-children' = 'subtree'
): readonly PersistentTreeNode[] {
  const result = removePersistentTreeNodeIfPresent(nodes, nodeId, mode);
  if (!result.found) {
    throw new Error('The persistent tree node no longer exists.');
  }
  return result.nodes;
}

/** Inserts a new node at the requested root or descendant position. */
export function insertPersistentTreeNode(
  nodes: readonly PersistentTreeNode[],
  targetParentId: string | null,
  targetIndex: number,
  node: PersistentTreeNode
): readonly PersistentTreeNode[] {
  if (targetParentId === null) {
    return insertAt(nodes, targetIndex, node);
  }
  return updatePersistentTreeNode(nodes, targetParentId, (parent) => ({
    ...parent,
    children: insertAt(parent.children, targetIndex, node)
  }));
}

/** Returns whether untrusted data is a valid Persistent Tree v2 document. */
export function isPersistentTreeDocument(value: unknown): value is PersistentTreeDocument {
  return (
    isRecord(value) &&
    value.format === PERSISTENT_TREE_FORMAT &&
    value.version === PERSISTENT_TREE_VERSION &&
    Array.isArray(value.roots) &&
    value.roots.every(isPersistentTreeNode)
  );
}

type TreeUpdateResult = Readonly<{ nodes: readonly PersistentTreeNode[]; found: boolean }>;

function updatePersistentTreeNodeIfPresent(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  update: (node: PersistentTreeNode) => PersistentTreeNode
): TreeUpdateResult {
  let found = false;
  const updated = nodes.map((node) => {
    if (node.id === nodeId) {
      found = true;
      return update(node);
    }
    const descendants = updatePersistentTreeNodeIfPresent(node.children, nodeId, update);
    if (descendants.found) {
      found = true;
      return { ...node, children: descendants.nodes };
    }
    return node;
  });
  return { nodes: found ? updated : nodes, found };
}

type TreeExtraction = Readonly<{
  nodes: readonly PersistentTreeNode[];
  node: PersistentTreeNode | null;
}>;

function extractPersistentTreeNode(nodes: readonly PersistentTreeNode[], nodeId: string): TreeExtraction {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) {
      return { nodes: [...nodes.slice(0, index), ...nodes.slice(index + 1)], node };
    }
    const descendants = extractPersistentTreeNode(node.children, nodeId);
    if (descendants.node) {
      return {
        nodes: [
          ...nodes.slice(0, index),
          { ...node, children: descendants.nodes },
          ...nodes.slice(index + 1)
        ],
        node: descendants.node
      };
    }
  }
  return { nodes, node: null };
}

function removePersistentTreeNodeIfPresent(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  mode: 'subtree' | 'promote-children'
): TreeUpdateResult {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) {
      const replacement = mode === 'promote-children' ? node.children : [];
      return {
        nodes: [...nodes.slice(0, index), ...replacement, ...nodes.slice(index + 1)],
        found: true
      };
    }
    const descendants = removePersistentTreeNodeIfPresent(node.children, nodeId, mode);
    if (descendants.found) {
      return {
        nodes: [
          ...nodes.slice(0, index),
          { ...node, children: descendants.nodes },
          ...nodes.slice(index + 1)
        ],
        found: true
      };
    }
  }
  return { nodes, found: false };
}

function insertAt<T>(items: readonly T[], requestedIndex: number, item: T): readonly T[] {
  const index = Math.max(0, Math.min(requestedIndex, items.length));
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function isPersistentTreeNode(value: unknown): value is PersistentTreeNode {
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.id !== 'string' || !Array.isArray(value.children)) {
    return false;
  }
  if (!value.children.every(isPersistentTreeNode)) {
    return false;
  }
  switch (value.kind) {
    case 'tab':
      return (
        typeof value.title === 'string' &&
        typeof value.url === 'string' &&
        typeof value.active === 'boolean' &&
        typeof value.pinned === 'boolean' &&
        (value.keepOnClose === undefined || typeof value.keepOnClose === 'boolean') &&
        isTabBinding(value.binding)
      );
    case 'window':
      return (
        typeof value.title === 'string' &&
        (value.customTitle === undefined || typeof value.customTitle === 'boolean') &&
        (value.bounds === undefined || isPersistentWindowBounds(value.bounds)) &&
        isWindowBinding(value.binding)
      );
    case 'group':
      return typeof value.title === 'string';
    case 'note':
      return typeof value.text === 'string';
    case 'separator':
      return value.style === 0 || value.style === 1 || value.style === 2;
    default:
      return false;
  }
}

function isPersistentWindowBounds(value: unknown): value is PersistentWindowBounds {
  return (
    isRecord(value) &&
    isFiniteNumber(value.left) &&
    isFiniteNumber(value.top) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTabBinding(value: unknown): value is TabBinding {
  if (!isRecord(value) || typeof value.state !== 'string') {
    return false;
  }
  if (value.state === 'live') {
    return typeof value.tabId === 'number' && typeof value.windowId === 'number' && typeof value.index === 'number';
  }
  return (
    (value.state === 'saved' || value.state === 'crashed') &&
    typeof value.savedAt === 'number' &&
    typeof value.sessionId === 'string' &&
    typeof value.originalWindowId === 'number' &&
    typeof value.originalIndex === 'number'
  );
}

function isWindowBinding(value: unknown): value is WindowBinding {
  if (!isRecord(value) || typeof value.state !== 'string') {
    return false;
  }
  if (value.state === 'live') {
    return typeof value.windowId === 'number' && typeof value.focused === 'boolean';
  }
  return (
    (value.state === 'saved' || value.state === 'crashed') &&
    typeof value.savedAt === 'number' &&
    typeof value.sessionId === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
