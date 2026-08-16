import type {
  ExplorerCloudBackupMode,
  ExplorerCloudBackupSummary
} from '../explorer/backend';
import {
  isPersistentTreeDocument,
  type PersistentTreeDocument,
  type PersistentTreeNode
} from './model';

/** Portable file stored by remote providers rather than tied to a provider's object metadata. */
export type PersistentCloudBackupFile = Readonly<{
  format: typeof CLOUD_BACKUP_FORMAT;
  version: typeof CLOUD_BACKUP_VERSION;
  createdAt: number;
  machineLabel: string;
  mode: ExplorerCloudBackupMode;
  document: PersistentTreeDocument;
}>;

/** Local provider record pairing a portable file with a simulated remote object identity. */
export type PersistentCloudBackupRecord = Readonly<{
  backupId: string;
  file: PersistentCloudBackupFile;
}>;

/** Creates the exact JSON payload uploaded by mock and real cloud transports. */
export function createPersistentCloudBackupFile(
  document: PersistentTreeDocument,
  machineLabel: string,
  mode: ExplorerCloudBackupMode,
  createdAt = Date.now()
): PersistentCloudBackupFile {
  return {
    format: CLOUD_BACKUP_FORMAT,
    version: CLOUD_BACKUP_VERSION,
    createdAt,
    machineLabel: machineLabel.trim(),
    mode,
    document
  };
}

/** Parses an untrusted downloaded JSON payload before it can replace the local tree. */
export function parsePersistentCloudBackupFile(value: unknown): PersistentCloudBackupFile {
  if (!isPersistentCloudBackupFile(value)) {
    throw new Error('The selected cloud object is not a valid Browser Atlas backup.');
  }
  return value;
}

/** Retains the newest 30 simulated provider records, matching original Google Drive behavior. */
export function appendPersistentCloudBackupRecord(
  records: readonly PersistentCloudBackupRecord[],
  record: PersistentCloudBackupRecord
): readonly PersistentCloudBackupRecord[] {
  return [...records, record]
    .sort((left, right) => left.file.createdAt - right.file.createdAt)
    .slice(-MAX_CLOUD_BACKUPS);
}

/** Reads valid records while ignoring independently corrupted simulated remote objects. */
export function parsePersistentCloudBackupRecords(value: unknown): readonly PersistentCloudBackupRecord[] {
  return Array.isArray(value) ? value.filter(isPersistentCloudBackupRecord) : [];
}

/** Projects provider records into safe newest-first UI metadata. */
export function summarizePersistentCloudBackupRecords(
  records: readonly PersistentCloudBackupRecord[]
): readonly ExplorerCloudBackupSummary[] {
  return records
    .map((record) => summarizePersistentCloudBackup(record.backupId, record.file))
    .sort((left, right) => right.createdAt - left.createdAt);
}

/** Creates UI metadata for a validated remote file and provider-owned object identity. */
export function summarizePersistentCloudBackup(
  backupId: string,
  file: PersistentCloudBackupFile
): ExplorerCloudBackupSummary {
  return {
    backupId,
    createdAt: file.createdAt,
    nodeCount: countPersistentTreeNodes(file.document.roots),
    sizeBytes: new TextEncoder().encode(JSON.stringify(file)).byteLength,
    machineLabel: file.machineLabel,
    mode: file.mode
  };
}

function isPersistentCloudBackupRecord(value: unknown): value is PersistentCloudBackupRecord {
  return (
    isRecord(value) &&
    typeof value.backupId === 'string' &&
    value.backupId.length > 0 &&
    isPersistentCloudBackupFile(value.file)
  );
}

function isPersistentCloudBackupFile(value: unknown): value is PersistentCloudBackupFile {
  return (
    isRecord(value) &&
    value.format === CLOUD_BACKUP_FORMAT &&
    value.version === CLOUD_BACKUP_VERSION &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.machineLabel === 'string' &&
    (value.mode === 'manual' || value.mode === 'automatic') &&
    isPersistentTreeDocument(value.document)
  );
}

function countPersistentTreeNodes(nodes: readonly PersistentTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countPersistentTreeNodes(node.children), 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const CLOUD_BACKUP_FORMAT = 'browser-atlas-cloud-backup';
const CLOUD_BACKUP_VERSION = 1;
const MAX_CLOUD_BACKUPS = 30;
