import {
  isPersistentTreeDocument,
  type PersistentTreeNode,
  type PersistentTreeDocument
} from './model';
import type { ExplorerTreeSnapshotSummary } from '../explorer/backend';

/** One recoverable point-in-time copy of the complete persistent tree. */
export type PersistentTreeSnapshot = Readonly<{
  createdAt: number;
  document: PersistentTreeDocument;
}>;

/** Creates a validated snapshot record for storage. */
export function createPersistentTreeSnapshot(
  document: PersistentTreeDocument,
  createdAt = Date.now()
): PersistentTreeSnapshot {
  return { createdAt, document };
}

/** Appends a snapshot while retaining only the newest bounded history. */
export function appendPersistentTreeSnapshot(
  snapshots: readonly PersistentTreeSnapshot[],
  snapshot: PersistentTreeSnapshot
): readonly PersistentTreeSnapshot[] {
  return [...snapshots, snapshot].slice(-MAX_PERSISTENT_TREE_SNAPSHOTS);
}

/** Parses snapshot storage defensively so one malformed record cannot block recovery. */
export function parsePersistentTreeSnapshots(value: unknown): readonly PersistentTreeSnapshot[] {
  return Array.isArray(value) ? value.filter(isPersistentTreeSnapshot) : [];
}

/** Creates newest-first metadata for displaying snapshots without leaking mutable documents. */
export function summarizePersistentTreeSnapshots(
  snapshots: readonly PersistentTreeSnapshot[]
): readonly ExplorerTreeSnapshotSummary[] {
  return snapshots
    .map((snapshot) => ({
      createdAt: snapshot.createdAt,
      nodeCount: countPersistentTreeNodes(snapshot.document.roots)
    }))
    .reverse();
}

function countPersistentTreeNodes(nodes: readonly PersistentTreeNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countPersistentTreeNodes(node.children),
    0
  );
}

/** Whether enough time elapsed to create another automatic local recovery point. */
export function shouldCreateAutomaticSnapshot(
  snapshots: readonly PersistentTreeSnapshot[],
  now = Date.now()
): boolean {
  const latest = snapshots.at(-1);
  return latest === undefined || now - latest.createdAt >= AUTOMATIC_SNAPSHOT_INTERVAL_MS;
}

function isPersistentTreeSnapshot(value: unknown): value is PersistentTreeSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createdAt' in value &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    'document' in value &&
    isPersistentTreeDocument(value.document)
  );
}

const MAX_PERSISTENT_TREE_SNAPSHOTS = 30;
const AUTOMATIC_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1_000;
