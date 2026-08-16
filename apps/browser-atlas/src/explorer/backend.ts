import type { ExplorerSourceId, ExplorerTreeNode } from './model';
import type { ExplorerDocument, PortableExplorerNode } from './portable';

/** Query and command boundary implemented by extension, website, or remote-data adapters. */
export type ExplorerBackend = {
  /** Features available from this backend. */
  readonly capabilities: ExplorerBackendCapabilities;
  /** Loads a normalized tree without exposing platform API objects. */
  load(source: ExplorerSourceId): Promise<ExplorerTreeNode>;
  /** Subscribes to external collection changes and returns an unsubscribe callback. */
  subscribe(listener: (source: ExplorerSourceId) => void): () => void;
  /** Executes a validated explorer command. */
  execute(command: ExplorerCommand): Promise<void>;
  /** Optional point-in-time recovery history for backends with durable tree storage. */
  readonly snapshots?: ExplorerSnapshotHistory;
  /** Optional recoverable hierarchy history for backends with persistent deletion storage. */
  readonly deletions?: ExplorerDeletionHistory;
  /** Session-scoped reactive availability of persistent-tree Undo and Redo. */
  readonly undoHistory?: ExplorerUndoHistory;
  /** Optional remote backup service for persistent browser trees. */
  readonly cloudBackups?: ExplorerCloudBackups;
};

/** Availability exposed by the backend's `createUndoHistory` controller. */
export type ExplorerUndoHistory = Readonly<{
  canUndo: () => boolean;
  canRedo: () => boolean;
}>;

/** Connection, configuration, and durable-copy operations supplied by a cloud provider. */
export type ExplorerCloudBackups = Readonly<{
  /** Human-readable provider shown in the shared backup panel. */
  providerName: string;
  /** Reads the provider connection without triggering an interactive authorization flow. */
  status: () => Promise<ExplorerCloudBackupStatus>;
  /** Starts the provider's interactive authorization or simulated localhost connection. */
  connect: () => Promise<void>;
  /** Revokes or forgets the current provider connection. */
  disconnect: () => Promise<void>;
  /** Reads per-browser backup preferences retained outside remote files. */
  configuration: () => Promise<ExplorerCloudBackupConfiguration>;
  /** Replaces per-browser backup preferences. */
  configure: (configuration: ExplorerCloudBackupConfiguration) => Promise<void>;
  /** Reports the latest upload attempt for this browser session without contacting the provider. */
  lastAttempt: () => Promise<ExplorerCloudBackupAttempt>;
  /** Lists safe newest-first metadata without downloading every backup document. */
  list: () => Promise<readonly ExplorerCloudBackupSummary[]>;
  /** Uploads the current persistent tree and applies provider retention limits. */
  create: (mode: ExplorerCloudBackupMode) => Promise<void>;
  /** Downloads a remote copy as a detached editable document without changing the current tree. */
  read: (backupId: string) => Promise<ExplorerDocument>;
  /** Replaces the current persistent tree from a remote backup without consuming it. */
  restore: (backupId: string) => Promise<void>;
  /** Permanently removes one remote backup. */
  delete: (backupId: string) => Promise<void>;
}>;

/** Non-interactive provider state used to decide which controls can be shown safely. */
export type ExplorerCloudBackupStatus =
  | Readonly<{ status: 'connected'; accountLabel: string | null }>
  | Readonly<{ status: 'disconnected' }>
  | Readonly<{ status: 'unavailable'; reason: string }>;

/** Preferences corresponding to the original machine label and daily backup switch. */
export type ExplorerCloudBackupConfiguration = Readonly<{
  machineLabel: string;
  automaticBackups: boolean;
}>;

/** Whether a remote copy was explicitly requested or created by the daily scheduler. */
export type ExplorerCloudBackupMode = 'manual' | 'automatic';

/** Session-scoped result represented by the original toolbar color strip. */
export type ExplorerCloudBackupAttempt =
  | Readonly<{ status: 'none' }>
  | Readonly<{
      status: 'success';
      attemptedAt: number;
      mode: ExplorerCloudBackupMode;
    }>
  | Readonly<{
      status: 'failure';
      attemptedAt: number;
      mode: ExplorerCloudBackupMode;
      message: string;
    }>;

/** Provider-independent metadata displayed without exposing backup contents. */
export type ExplorerCloudBackupSummary = Readonly<{
  backupId: string;
  createdAt: number;
  nodeCount: number;
  sizeBytes: number;
  machineLabel: string;
  mode: ExplorerCloudBackupMode;
}>;

/** Lists and restores durable point-in-time copies without exposing backend documents. */
export type ExplorerSnapshotHistory = Readonly<{
  /** Returns newest-first metadata for every currently retained snapshot. */
  list: () => Promise<readonly ExplorerTreeSnapshotSummary[]>;
  /** Reads one recovery point as a detached editable document without changing the current tree. */
  read: (createdAt: number) => Promise<ExplorerDocument>;
  /** Restores and consumes the snapshot identified by its creation timestamp. */
  restore: (createdAt: number) => Promise<void>;
}>;

/** Safe metadata displayed by the shared backup-history UI. */
export type ExplorerTreeSnapshotSummary = Readonly<{
  createdAt: number;
  nodeCount: number;
}>;

/** Lists and restores specific deleted hierarchies without exposing persisted nodes. */
export type ExplorerDeletionHistory = Readonly<{
  /** Returns newest-first metadata for every recoverable deletion. */
  list: () => Promise<readonly ExplorerDeletedItemSummary[]>;
  /** Restores and consumes one deletion by stable record ID. */
  restore: (deletionId: string) => Promise<void>;
}>;

/** Safe metadata displayed by the shared deleted-items history UI. */
export type ExplorerDeletedItemSummary = Readonly<{
  deletionId: string;
  deletedAt: number;
  title: string;
  itemKind: 'tab' | 'window' | 'group' | 'note' | 'separator';
  nodeCount: number;
  mode: ExplorerDeleteMode;
}>;

/** Features a backend can expose to the shared explorer application. */
export type ExplorerBackendCapabilities = Readonly<{
  sources: Readonly<Record<ExplorerSourceId, boolean>>;
  commands: Readonly<Record<ExplorerCommand['kind'], boolean>>;
}>;

/** Platform-neutral mutations produced by explorer interactions. */
export type ExplorerCommand =
  | { kind: 'activate-tab'; tabId: string; windowId: string }
  | { kind: 'activate-window'; windowId: string }
  | { kind: 'create-window' }
  | { kind: 'create-window-at-placement'; placement: PersistentMovePlacement }
  | { kind: 'create-google-doc-at-placement'; placement: PersistentMovePlacement }
  | { kind: 'create-tree-snapshot' }
  | { kind: 'restore-latest-tree-snapshot' }
  | { kind: 'delete-tree-item'; target: ExplorerDeleteTarget; mode: ExplorerDeleteMode }
  | { kind: 'save-close-tab'; tabId: string; includeDescendants: boolean }
  | { kind: 'save-close-window'; windowId: string; includeDescendants: boolean }
  | { kind: 'save-close-all-windows' }
  | { kind: 'restore-saved-tab'; savedTabId: string }
  | { kind: 'restore-saved-window'; savedWindowId: string }
  | { kind: 'restore-saved-window-session'; savedWindowId: string }
  | { kind: 'restore-saved-group'; savedGroupId: string }
  | {
      kind: 'create-saved-organizer';
      itemKind: 'group' | 'note' | 'separator';
      placement: PersistentOrganizerPlacement;
      title: string;
      separatorStyle: 0 | 1 | 2;
    }
  | { kind: 'rename-persistent-item'; item: PersistentItemReference; title: string }
  | { kind: 'cycle-saved-separator'; itemId: string }
  | { kind: 'delete-saved-organizer'; itemId: string; mode: ExplorerDeleteMode }
  | { kind: 'undo-persistent-tree' }
  | { kind: 'redo-persistent-tree' }
  | {
      kind: 'move-saved-item';
      itemId: string;
      sourceParentId: string | null;
      sourceIndex: number;
      target: PersistentItemTarget;
      targetIndex: number;
    }
  | {
      kind: 'reposition-persistent-item';
      item: PersistentItemReference;
      placement: PersistentMovePlacement;
    }
  | { kind: 'flatten-persistent-tabs'; items: PersistentItemReference[] }
  | {
      kind: 'move-tab';
      tabId: string;
      sourceWindowId: string;
      sourceIndex: number;
      targetWindowId: string;
      targetIndex: number;
    }
  | { kind: 'move-tab-to-new-window'; tabId: string; targetIndex: number }
  | {
      kind: 'move-live-tab-in-tree';
      tabId: string;
      target: PersistentItemTarget;
      targetIndex: number;
    }
  | {
      kind: 'restore-saved-item-into-window';
      itemId: string;
      targetWindowId: string;
      targetIndex: number;
    }
  | { kind: 'open-tab'; windowId: string; index: number; url: string }
  | {
      kind: 'open-link';
      url: string;
      target: 'new-window' | 'last-focused-window';
      nestUnderActiveTab: boolean;
    }
  | {
      kind: 'move-bookmark';
      bookmarkId: string;
      itemKind: 'bookmark' | 'folder';
      sourceFolderId: string;
      sourceIndex: number;
      targetFolderId: string;
      targetIndex: number;
    }
  | { kind: 'create-bookmark'; folderId: string; index: number; title: string; url: string }
  | {
      kind: 'import-items';
      target: ExplorerImportTarget;
      index: number;
      items: PortableExplorerNode[];
    }
  | {
      kind: 'move-document-node';
      source: { source: ExplorerSourceId; nodeId: string; parentId: string | null; index: number };
      target: { source: ExplorerSourceId; parentId: string | null; index: number };
    };

/** Browser-independent destination for persistent organizers and retained hierarchies. */
export type PersistentItemTarget =
  | { kind: 'root' }
  | { kind: 'saved'; id: string }
  | { kind: 'live-window'; windowId: string }
  | { kind: 'live-tab'; tabId: string; windowId: string };

/** Atomic organizer insertion positions matching the original Tabs Outliner note workflow. */
export type PersistentOrganizerPlacement =
  | { kind: 'inside'; target: PersistentItemTarget; position: 'first' | 'last' }
  | { kind: 'sibling'; target: PersistentItemReference; position: 'before' | 'after' }
  | { kind: 'parent'; target: PersistentItemReference }
  | { kind: 'tree-end' };

/** A concrete persistent item that can act as an insertion anchor. */
export type PersistentItemReference = Exclude<PersistentItemTarget, { kind: 'root' }>;

/** Whether deletion removes an entire hierarchy or only its root organizer. */
export type ExplorerDeleteMode = 'subtree' | 'promote-children';

/** Relative destination used by keyboard structural-move commands. */
export type PersistentMovePlacement =
  | { kind: 'inside'; target: PersistentItemTarget; position: 'first' | 'last' }
  | { kind: 'sibling'; target: PersistentItemReference; position: 'before' | 'after' }
  | { kind: 'tree-end' };

/** Backend-neutral destinations that can materialize portable explorer nodes. */
export type ExplorerImportTarget =
  | { kind: 'window'; id: string }
  | { kind: 'bookmark-folder'; id: string }
  | { kind: 'document'; source: ExplorerSourceId; parentId: string | null }
  | { kind: 'persistent'; target: PersistentItemTarget };

/** Backend-neutral node identities that Cut may permanently remove after copying. */
export type ExplorerDeleteTarget =
  | { kind: 'live-tab'; id: string }
  | { kind: 'live-window'; id: string }
  | { kind: 'saved'; id: string }
  | { kind: 'bookmark'; id: string; itemKind: 'bookmark' | 'folder' }
  | { kind: 'document'; source: ExplorerSourceId; nodeId: string; parentId: string | null };

/** Complete capability set used by browser-extension backends. */
export const FULL_EXPLORER_CAPABILITIES = {
  sources: { explore: true, bookmarks: true, history: true },
  commands: {
    'activate-tab': true,
    'activate-window': true,
    'create-window': true,
    'create-window-at-placement': true,
    'create-google-doc-at-placement': true,
    'create-tree-snapshot': true,
    'restore-latest-tree-snapshot': true,
    'delete-tree-item': true,
    'save-close-tab': true,
    'save-close-window': true,
    'save-close-all-windows': true,
    'restore-saved-tab': true,
    'restore-saved-window': true,
    'restore-saved-window-session': true,
    'restore-saved-group': true,
    'create-saved-organizer': true,
    'rename-persistent-item': true,
    'cycle-saved-separator': true,
    'delete-saved-organizer': true,
    'undo-persistent-tree': true,
    'redo-persistent-tree': true,
    'move-saved-item': true,
    'reposition-persistent-item': true,
    'flatten-persistent-tabs': true,
    'move-tab': true,
    'move-tab-to-new-window': true,
    'move-live-tab-in-tree': true,
    'restore-saved-item-into-window': true,
    'open-tab': true,
    'open-link': true,
    'move-bookmark': true,
    'create-bookmark': true,
    'import-items': true,
    'move-document-node': false
  }
} as const satisfies ExplorerBackendCapabilities;
