import { createUndoHistory } from '@solid-primitives/history';
import { createSignal } from 'solid-js';
import type { ExplorerCommand } from '../explorer/backend';
import type { PersistentTreeDeletion } from './deletions';
import type { PersistentTreeDocument } from './model';

/** Complete durable state restored by one tree-history position. */
export type PersistentTreeHistorySnapshot = Readonly<{
  document: PersistentTreeDocument;
  deletions: readonly PersistentTreeDeletion[];
  liveTabPlacements: readonly PersistentTreeHistoryTabPlacement[];
  /** Persistent live nodes that must be closed when this history position is reapplied. */
  closedLiveNodeIds: readonly string[];
}>;

/** Browser placement required to reverse a real cross-window tab move. */
export type PersistentTreeHistoryTabPlacement = Readonly<{
  tabId: number;
  windowId: number;
  index: number;
}>;

/** Reactive session history backed by Solid's canonical undo/redo primitive. */
export type PersistentTreeUndoHistory = Readonly<{
  canUndo: () => boolean;
  canRedo: () => boolean;
  capture: (snapshot: PersistentTreeHistorySnapshot) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}>;

/** Creates snapshot history while delegating traversal and branch invalidation to `createUndoHistory`. */
export function createPersistentTreeUndoHistory(
  apply: (snapshot: PersistentTreeHistorySnapshot) => void | Promise<void>,
  limit = 50
): PersistentTreeUndoHistory {
  const [snapshot, setSnapshot] = createSignal<PersistentTreeHistorySnapshot>();
  let pendingApply = Promise.resolve();
  const history = createUndoHistory(() => {
    const captured = snapshot();
    if (!captured) {
      return;
    }
    return () => {
      setSnapshot(captured);
      pendingApply = Promise.resolve(apply(captured));
    };
  }, { limit });

  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    capture(nextSnapshot) {
      setSnapshot(nextSnapshot);
      history.canUndo();
      history.canRedo();
    },
    async undo() {
      if (!history.canUndo()) {
        throw new Error('There is no Browser Atlas change to undo.');
      }
      history.undo();
      await pendingApply;
    },
    async redo() {
      if (!history.canRedo()) {
        throw new Error('There is no Browser Atlas change to redo.');
      }
      history.redo();
      await pendingApply;
    }
  };
}

/** Identifies user-visible persistent-tree mutations that must create one history point. */
export function commandTracksPersistentTreeHistory(command: ExplorerCommand): boolean {
  switch (command.kind) {
    case 'delete-tree-item':
      return command.target.kind === 'saved' ||
        command.target.kind === 'live-tab' ||
        command.target.kind === 'live-window';
    case 'import-items':
      return command.target.kind === 'persistent';
    default:
      return PERSISTENT_TREE_HISTORY_POLICY[command.kind] === 'track';
  }
}

/** Marks live browser resources that disappeared during one captured tree mutation. */
export function recordClosedLiveHistoryNodes(
  before: PersistentTreeHistorySnapshot,
  after: PersistentTreeHistorySnapshot
): PersistentTreeHistorySnapshot {
  const afterLiveNodeIds = collectLiveNodeIds(after.document.roots);
  return {
    ...after,
    closedLiveNodeIds: collectClosedLiveNodeIds(before.document.roots, afterLiveNodeIds)
  };
}

function collectClosedLiveNodeIds(
  nodes: PersistentTreeDocument['roots'],
  afterLiveNodeIds: ReadonlySet<string>
): readonly string[] {
  return nodes.flatMap((node): readonly string[] => {
    const closedDescendants = collectClosedLiveNodeIds(node.children, afterLiveNodeIds);
    if (node.kind === 'tab' && node.binding.state === 'live' && !afterLiveNodeIds.has(node.id)) {
      return [node.id, ...closedDescendants];
    }
    if (node.kind === 'window' && node.binding.state === 'live' && !afterLiveNodeIds.has(node.id)) {
      const retainedLiveDescendant = [...collectLiveNodeIds(node.children)].some((id) => afterLiveNodeIds.has(id));
      return retainedLiveDescendant ? closedDescendants : [node.id, ...closedDescendants];
    }
    return closedDescendants;
  });
}

function collectLiveNodeIds(nodes: PersistentTreeDocument['roots']): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if ((node.kind === 'tab' || node.kind === 'window') && node.binding.state === 'live') {
      ids.add(node.id);
    }
    for (const id of collectLiveNodeIds(node.children)) {
      ids.add(id);
    }
  }
  return ids;
}

const PERSISTENT_TREE_HISTORY_POLICY = {
  'activate-tab': 'ignore',
  'activate-window': 'ignore',
  'create-window': 'ignore',
  'create-window-at-placement': 'ignore',
  'create-google-doc-at-placement': 'ignore',
  'create-tree-snapshot': 'ignore',
  'restore-latest-tree-snapshot': 'ignore',
  'delete-tree-item': 'conditional',
  'save-close-tab': 'track',
  'save-close-window': 'track',
  'save-close-all-windows': 'ignore',
  'restore-saved-tab': 'ignore',
  'restore-saved-window': 'ignore',
  'restore-saved-window-session': 'ignore',
  'restore-saved-group': 'ignore',
  'create-saved-organizer': 'track',
  'rename-persistent-item': 'track',
  'cycle-saved-separator': 'track',
  'delete-saved-organizer': 'track',
  'undo-persistent-tree': 'ignore',
  'redo-persistent-tree': 'ignore',
  'move-saved-item': 'track',
  'reposition-persistent-item': 'track',
  'flatten-persistent-tabs': 'track',
  'move-tab': 'track',
  'move-tab-to-new-window': 'track',
  'move-live-tab-in-tree': 'track',
  'restore-saved-item-into-window': 'ignore',
  'open-tab': 'ignore',
  'open-link': 'ignore',
  'move-bookmark': 'ignore',
  'create-bookmark': 'ignore',
  'import-items': 'conditional',
  'move-document-node': 'ignore'
} as const satisfies Record<ExplorerCommand['kind'], 'track' | 'ignore' | 'conditional'>;
