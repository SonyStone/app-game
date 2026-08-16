import type { ExplorerDeletedItemSummary, ExplorerDeleteMode } from '../explorer/backend';
import {
  findPersistentTreeLocation,
  findPersistentTreeNode,
  insertPersistentTreeNode,
  isPersistentTreeDocument,
  removePersistentTreeNode,
  type PersistentTreeLocation,
  type PersistentTreeNode
} from './model';

/** Complete recoverable hierarchy and its original placement. */
export type PersistentTreeDeletion = PersistentTreeLocation & Readonly<{
  deletionId: string;
  deletedAt: number;
  mode: ExplorerDeleteMode;
}>;

/** Captures one deletion before its hierarchy is removed from the current tree. */
export function createPersistentTreeDeletion(
  roots: readonly PersistentTreeNode[],
  itemId: string,
  mode: ExplorerDeleteMode,
  deletedAt = Date.now()
): PersistentTreeDeletion {
  const location = findPersistentTreeLocation(roots, itemId);
  if (!location) {
    throw new Error('The persistent item selected for deletion no longer exists.');
  }
  return {
    ...location,
    deletionId: createDeletionId(deletedAt),
    deletedAt,
    mode
  };
}

/** Appends a deletion while retaining only the newest bounded history. */
export function appendPersistentTreeDeletion(
  history: readonly PersistentTreeDeletion[],
  deletion: PersistentTreeDeletion,
  limit = 50
): readonly PersistentTreeDeletion[] {
  return [...history, deletion].slice(-limit);
}

/** Parses current records and upgrades pre-history records with deterministic legacy metadata. */
export function parsePersistentTreeDeletions(value: unknown): readonly PersistentTreeDeletion[] {
  return Array.isArray(value)
    ? value.flatMap((candidate, index) => {
        const deletion = parsePersistentTreeDeletion(candidate, index);
        return deletion ? [deletion] : [];
      })
    : [];
}

/** Creates newest-first metadata for the deleted-items history UI. */
export function summarizePersistentTreeDeletions(
  history: readonly PersistentTreeDeletion[]
): readonly ExplorerDeletedItemSummary[] {
  return history
    .map((deletion) => ({
      deletionId: deletion.deletionId,
      deletedAt: deletion.deletedAt,
      title: persistentNodeTitle(deletion.node),
      itemKind: deletion.node.kind,
      nodeCount: countPersistentTreeNodes(deletion.node),
      mode: deletion.mode
    }))
    .reverse();
}

/** Restores one hierarchy at its original parent when possible, otherwise at the root. */
export function restorePersistentTreeDeletion(
  roots: readonly PersistentTreeNode[],
  deletion: PersistentTreeDeletion
): readonly PersistentTreeNode[] {
  const parentId = deletion.parentId === null || findPersistentTreeNode(roots, deletion.parentId)
    ? deletion.parentId
    : null;
  const withoutPromotedChildren = deletion.mode === 'promote-children'
    ? deletion.node.children.reduce(
        (nodes, child) => findPersistentTreeNode(nodes, child.id)
          ? removePersistentTreeNode(nodes, child.id)
          : nodes,
        roots
      )
    : roots;
  return insertPersistentTreeNode(withoutPromotedChildren, parentId, deletion.index, deletion.node);
}

function parsePersistentTreeDeletion(value: unknown, index: number): PersistentTreeDeletion | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('node' in value) ||
    !('parentId' in value) ||
    !('index' in value) ||
    !('mode' in value) ||
    (value.parentId !== null && typeof value.parentId !== 'string') ||
    typeof value.index !== 'number' ||
    (value.mode !== 'subtree' && value.mode !== 'promote-children')
  ) {
    return null;
  }
  const candidateDocument: unknown = {
    format: 'browser-atlas-tree',
    version: 2,
    roots: [value.node]
  };
  if (!isPersistentTreeDocument(candidateDocument)) {
    return null;
  }
  const node = candidateDocument.roots[0];
  if (!node) {
    return null;
  }
  return {
    node,
    parentId: value.parentId,
    index: value.index,
    mode: value.mode,
    deletionId: 'deletionId' in value && typeof value.deletionId === 'string'
      ? value.deletionId
      : `legacy-deletion-${index}-${node.id}`,
    deletedAt: 'deletedAt' in value && typeof value.deletedAt === 'number' && Number.isFinite(value.deletedAt)
      ? value.deletedAt
      : 0
  };
}

function createDeletionId(deletedAt: number): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `deletion-${deletedAt}-${randomId}`;
}

function persistentNodeTitle(node: PersistentTreeNode): string {
  switch (node.kind) {
    case 'tab':
    case 'window':
    case 'group':
      return node.title;
    case 'note':
      return node.text;
    case 'separator':
      return SEPARATOR_TITLES[node.style];
    default: {
      const exhaustiveNode: never = node;
      return exhaustiveNode;
    }
  }
}

function countPersistentTreeNodes(node: PersistentTreeNode): number {
  return 1 + node.children.reduce((total, child) => total + countPersistentTreeNodes(child), 0);
}

const SEPARATOR_TITLES = ['━━━━━━━━━━━━', '════════════', '┄┄┄┄┄┄┄┄┄┄┄┄'] as const;
