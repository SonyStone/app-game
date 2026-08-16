import type {
  ExplorerBackend,
  ExplorerCloudBackupAttempt,
  ExplorerCloudBackupConfiguration,
  ExplorerCloudBackupMode,
  ExplorerCommand,
  PersistentItemReference,
  PersistentItemTarget,
  PersistentMovePlacement,
  PersistentOrganizerPlacement
} from '../../explorer/backend';
import type {
  ExplorerSourceId,
  ExplorerTransientWindowStatus,
  ExplorerTreeGroupNode,
  ExplorerTreeLinkNode,
  ExplorerTreeNode,
  SavedParentKind
} from '../../explorer/model';
import type { PortableExplorerNode } from '../../explorer/portable';
import { createExplorerSourceRoot } from '../../explorer/treeFactories';
import {
  findPersistentTreeNode,
  findPersistentTreeLocation,
  flattenPersistentTabsHierarchy,
  insertPersistentTreeNode,
  isPersistentTreeDocument,
  movePersistentTreeNode,
  PERSISTENT_TREE_FORMAT,
  PERSISTENT_TREE_VERSION,
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
import {
  commandTracksPersistentTreeHistory,
  createPersistentTreeUndoHistory
} from '../../persistent-tree/createPersistentTreeUndoHistory';
import {
  createExplorerDocumentFromPersistent,
  createPersistentNodesFromPortable
} from '../../persistent-tree/portable';
import {
  appendPersistentCloudBackupRecord,
  createPersistentCloudBackupFile,
  parsePersistentCloudBackupRecords,
  summarizePersistentCloudBackupRecords,
  type PersistentCloudBackupRecord
} from '../../persistent-tree/cloudBackups';
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
  shouldCreateAutomaticSnapshot,
  summarizePersistentTreeSnapshots,
  type PersistentTreeSnapshot
} from '../../persistent-tree/snapshots';
import { createFixtureExplorerBackend } from '../fixtures/createFixtureExplorerBackend';

/** Configuration for one independently persisted simulated browser identity. */
export type MockExplorerBackendOptions = Readonly<{
  identity?: 'chrome' | 'firefox';
}>;

/** Creates a durable browser simulation for exercising extension behavior in the regular web app. */
export function createMockExplorerBackend(options: MockExplorerBackendOptions = {}): ExplorerBackend {
  const identity = options.identity ?? 'chrome';
  const storageKeys = createMockStorageKeys(identity);
  const documentBackend = createFixtureExplorerBackend();
  const persistedTree = loadPersistedMockTree(storageKeys.tree);
  let tree = persistedTree ?? createInitialMockTree(identity);
  let savedWindowMarkers = loadMockSavedWindowMarkers(storageKeys.windowMarkers);
  if (!persistedTree && savedWindowMarkers.size === 0) {
    const crashedWindowId = identity === 'chrome' ? 'mock-crashed-window' : 'firefox-mock-crashed-window';
    savedWindowMarkers.set(crashedWindowId, 'crash-recovered');
    saveMockSavedWindowMarkers(storageKeys.windowMarkers, savedWindowMarkers);
  }
  let deletionHistory = loadMockDeletionHistory(storageKeys.deletions);
  let snapshots = loadMockSnapshots(storageKeys.snapshots);
  let cloudBackupRecords = loadMockCloudBackups(storageKeys.cloudBackups);
  let cloudConfiguration = loadMockCloudConfiguration(storageKeys.cloudConfiguration);
  let cloudBackupAttempt = loadMockCloudBackupAttempt(storageKeys.cloudAttempt);
  let nextBrowserId = identity === 'chrome' ? 10_000 : 20_000;
  let captureNextTreeCommit = false;
  const listeners = new Set<(source: ExplorerSourceId) => void>();
  const undoHistory = createPersistentTreeUndoHistory((snapshot) => {
    tree = snapshot.document;
    deletionHistory = snapshot.deletions;
    saveMockTree(storageKeys.tree, tree);
    saveMockDeletionHistory(storageKeys.deletions, deletionHistory);
    notify('explore');
  });
  documentBackend.subscribe((source) => notify(source));

  return {
    capabilities: MOCK_EXPLORER_CAPABILITIES,
    undoHistory,
    load: (source) =>
      source === 'explore'
        ? Promise.resolve(createMockExploreTree(tree, savedWindowMarkers))
        : documentBackend.load(source),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshots: {
      list: async () => summarizePersistentTreeSnapshots(snapshots),
      read: async (createdAt) => {
        const snapshot = requireMockSnapshot(createdAt);
        return createExplorerDocumentFromPersistent(
          snapshot.document,
          `Local backup · ${new Date(snapshot.createdAt).toLocaleString()}`
        );
      },
      restore: async (createdAt) => restoreMockSnapshot(createdAt)
    },
    deletions: {
      list: async () => summarizePersistentTreeDeletions(deletionHistory),
      restore: async (deletionId) => restoreMockDeletionById(deletionId)
    },
    cloudBackups: {
      providerName: 'Mock Cloud Drive',
      status: async () =>
        cloudConfiguration.connected
          ? { status: 'connected', accountLabel: `${identity}@browser-atlas.test` }
          : { status: 'disconnected' },
      connect: async () => {
        cloudConfiguration = { ...cloudConfiguration, connected: true };
        saveMockCloudConfiguration(storageKeys.cloudConfiguration, cloudConfiguration);
      },
      disconnect: async () => {
        cloudConfiguration = { ...cloudConfiguration, connected: false };
        saveMockCloudConfiguration(storageKeys.cloudConfiguration, cloudConfiguration);
      },
      configuration: async () => publicMockCloudConfiguration(cloudConfiguration),
      lastAttempt: async () => cloudBackupAttempt,
      configure: async (configuration) => {
        cloudConfiguration = {
          connected: cloudConfiguration.connected,
          machineLabel: configuration.machineLabel.trim(),
          automaticBackups: configuration.automaticBackups
        };
        saveMockCloudConfiguration(storageKeys.cloudConfiguration, cloudConfiguration);
        createAutomaticCloudBackupWhenDue();
      },
      list: async () => {
        requireMockCloudConnection();
        createAutomaticCloudBackupWhenDue();
        return summarizePersistentCloudBackupRecords(cloudBackupRecords);
      },
      create: async (mode) => {
        requireMockCloudConnection();
        createCloudBackupWithAttempt(mode);
      },
      read: async (backupId) => {
        requireMockCloudConnection();
        const backup = requireMockCloudBackup(backupId);
        return createExplorerDocumentFromPersistent(
          backup.file.document,
          `Cloud backup · ${new Date(backup.file.createdAt).toLocaleString()}`
        );
      },
      restore: async (backupId) => restoreMockCloudBackup(backupId),
      delete: async (backupId) => {
        requireMockCloudConnection();
        cloudBackupRecords = cloudBackupRecords.filter((record) => record.backupId !== backupId);
        saveMockCloudBackups(storageKeys.cloudBackups, cloudBackupRecords);
      }
    },
    async execute(command) {
      const tracksHistory = commandTracksPersistentTreeHistory(command);
      if (tracksHistory) {
        undoHistory.capture(createMockHistorySnapshot());
        captureNextTreeCommit = true;
      }
      try {
        switch (command.kind) {
        case 'activate-tab':
          tree = replaceTreeRoots(tree, activateMockTab(tree.roots, command.tabId, command.windowId));
          commitTree();
          return;
        case 'activate-window':
          tree = replaceTreeRoots(tree, setMockFocusedWindow(tree.roots, Number(command.windowId)));
          commitTree();
          return;
        case 'create-window': {
          const windowId = nextBrowserId++;
          const tabId = nextBrowserId++;
          const roots = setMockFocusedWindow(tree.roots, windowId);
          tree = replaceTreeRoots(tree, [
            ...roots,
            createMockWindow(windowId, tabId)
          ]);
          commitTree();
          return;
        }
        case 'create-window-at-placement': {
          const windowId = nextBrowserId++;
          const tabId = nextBrowserId++;
          const roots = setMockFocusedWindow(tree.roots, windowId);
          tree = replaceTreeRoots(
            tree,
            insertMockPersistentNode(roots, command.placement, createMockWindow(windowId, tabId))
          );
          commitTree();
          return;
        }
        case 'create-google-doc-at-placement': {
          const savedTab = createMockGoogleDoc();
          const placedRoots = insertMockPersistentNode(tree.roots, command.placement, savedTab);
          tree = replaceTreeRoots(tree, restoreMockTab(placedRoots, savedTab.id, nextBrowserId++));
          commitTree();
          return;
        }
        case 'create-tree-snapshot':
          snapshots = appendPersistentTreeSnapshot(snapshots, createPersistentTreeSnapshot(tree));
          saveMockSnapshots(storageKeys.snapshots, snapshots);
          return;
        case 'restore-latest-tree-snapshot': {
          const snapshot = snapshots.at(-1);
          if (!snapshot) {
            throw new Error('There is no local mock Browser Atlas snapshot to restore.');
          }
          restoreMockSnapshot(snapshot.createdAt);
          return;
        }
        case 'delete-tree-item': {
          if (command.target.kind === 'document' || command.target.kind === 'bookmark') {
            await documentBackend.execute(command);
            return;
          }
          const itemId =
            command.target.kind === 'live-tab'
              ? findMockLiveTab(tree.roots, command.target.id)?.id
              : command.target.kind === 'live-window'
                ? findMockLiveWindow(tree.roots, command.target.id)?.id
                : command.target.id;
          if (!itemId) {
            throw new Error('The mock item selected for Cut no longer exists.');
          }
          const deletion = createPersistentTreeDeletion(tree.roots, itemId, command.mode);
          deletionHistory = appendPersistentTreeDeletion(deletionHistory, {
            ...deletion,
            node: detachMockLiveBindings(deletion.node, deletion.deletedAt)
          });
          saveMockDeletionHistory(storageKeys.deletions, deletionHistory);
          tree = replaceTreeRoots(tree, removePersistentTreeNode(tree.roots, itemId, command.mode));
          commitTree();
          return;
        }
        case 'save-close-tab':
          tree = replaceTreeRoots(
            tree,
            retainMockTab(tree.roots, command.tabId, 'saved', command.includeDescendants)
          );
          commitTree();
          return;
        case 'save-close-window':
          tree = replaceTreeRoots(
            tree,
            retainMockWindow(tree.roots, command.windowId, 'saved', command.includeDescendants)
          );
          commitTree();
          return;
        case 'save-close-all-windows': {
          for (const node of tree.roots) {
            if (node.kind === 'window' && node.binding.state === 'live') {
              savedWindowMarkers.set(node.id, 'recently-saved');
            }
          }
          saveMockSavedWindowMarkers(storageKeys.windowMarkers, savedWindowMarkers);
          tree = replaceTreeRoots(tree, retainAllMockWindows(tree.roots));
          commitTree();
          return;
        }
        case 'restore-saved-tab':
          tree = replaceTreeRoots(tree, restoreMockTab(tree.roots, command.savedTabId, nextBrowserId++));
          commitTree();
          return;
        case 'restore-saved-window': {
          const savedWindow = findPersistentTreeNode(tree.roots, command.savedWindowId);
          const tabCount = countTabs(savedWindow);
          tree = replaceTreeRoots(
            tree,
            restoreMockWindow(
              tree.roots,
              command.savedWindowId,
              nextBrowserId++,
              nextBrowserId,
              'all',
              (await readBrowserAtlasSettings()).restoreWindowsInOriginalBounds
            )
          );
          nextBrowserId += tabCount;
          commitTree();
          return;
        }
        case 'restore-saved-window-session': {
          const savedWindow = findPersistentTreeNode(tree.roots, command.savedWindowId);
          const tabCount = countLastWindowSessionTabs(savedWindow);
          tree = replaceTreeRoots(
            tree,
            restoreMockWindow(
              tree.roots,
              command.savedWindowId,
              nextBrowserId++,
              nextBrowserId,
              'last-session',
              (await readBrowserAtlasSettings()).restoreWindowsInOriginalBounds
            )
          );
          nextBrowserId += tabCount;
          commitTree();
          return;
        }
        case 'restore-saved-group': {
          const savedGroup = findPersistentTreeNode(tree.roots, command.savedGroupId);
          const tabCount = countTabs(savedGroup);
          tree = replaceTreeRoots(
            tree,
            restoreMockGroup(
              tree.roots,
              command.savedGroupId,
              nextBrowserId++,
              nextBrowserId
            )
          );
          nextBrowserId += Math.max(1, tabCount);
          commitTree();
          return;
        }
        case 'create-saved-organizer':
          tree = replaceTreeRoots(
            tree,
            insertMockPersistentNode(
              tree.roots,
              command.placement,
              createMockOrganizer(command.itemKind, command.title, command.separatorStyle)
            )
          );
          commitTree();
          return;
        case 'rename-persistent-item':
          tree = replaceTreeRoots(tree, renameMockPersistentItem(tree.roots, command.item, command.title));
          commitTree();
          return;
        case 'cycle-saved-separator':
          tree = replaceTreeRoots(
            tree,
            updatePersistentTreeNode(tree.roots, command.itemId, (node) => cycleMockSeparator(node))
          );
          commitTree();
          return;
        case 'delete-saved-organizer':
          deletionHistory = appendPersistentTreeDeletion(
            deletionHistory,
            createPersistentTreeDeletion(tree.roots, command.itemId, command.mode)
          );
          tree = replaceTreeRoots(tree, removePersistentTreeNode(tree.roots, command.itemId, command.mode));
          saveMockDeletionHistory(storageKeys.deletions, deletionHistory);
          commitTree();
          return;
        case 'undo-persistent-tree': {
          await undoHistory.undo();
          return;
        }
        case 'redo-persistent-tree': {
          await undoHistory.redo();
          return;
        }
        case 'move-saved-item':
          tree = replaceTreeRoots(
            tree,
            movePersistentTreeNode(
              tree.roots,
              command.itemId,
              resolveMockTargetId(tree.roots, command.target),
              command.targetIndex
            )
          );
          commitTree();
          return;
        case 'reposition-persistent-item':
          tree = replaceTreeRoots(
            tree,
            repositionMockPersistentItem(tree.roots, command.item, command.placement)
          );
          commitTree();
          return;
        case 'flatten-persistent-tabs':
          tree = replaceTreeRoots(
            tree,
            command.items.reduce((roots, item) => {
              const itemId = requireMockTargetId(resolveMockTargetId(roots, item));
              return flattenPersistentTabsHierarchy(roots, itemId);
            }, tree.roots)
          );
          commitTree();
          return;
        case 'move-tab':
          tree = replaceTreeRoots(tree, moveMockLiveTab(tree.roots, command));
          commitTree();
          return;
        case 'move-tab-to-new-window': {
          const windowId = nextBrowserId++;
          tree = replaceTreeRoots(
            tree,
            liberateMockTab(tree.roots, command.tabId, windowId, command.targetIndex)
          );
          commitTree();
          return;
        }
        case 'move-live-tab-in-tree': {
          const tab = findMockLiveTab(tree.roots, command.tabId);
          if (!tab) {
            throw new Error('The mock live tab no longer exists.');
          }
          const targetId = resolveMockTargetId(tree.roots, command.target);
          const target = targetId ? findPersistentTreeNode(tree.roots, targetId) : undefined;
          tree = replaceTreeRoots(
            tree,
            target?.kind === 'group'
              ? moveMockLiveTabIntoGroup(
                  tree.roots,
                  tab,
                  target,
                  command.targetIndex,
                  nextBrowserId++
                )
              : movePersistentTreeNode(
              tree.roots,
              tab.id,
              targetId,
              command.targetIndex
            )
          );
          commitTree();
          return;
        }
        case 'restore-saved-item-into-window':
          tree = replaceTreeRoots(
            tree,
            restoreMockItemIntoWindow(
              tree.roots,
              command.itemId,
              command.targetWindowId,
              command.targetIndex,
              () => nextBrowserId++
            )
          );
          commitTree();
          return;
        case 'open-tab':
          tree = replaceTreeRoots(
            tree,
            openMockTab(tree.roots, command.windowId, command.index, command.url, nextBrowserId++)
          );
          commitTree();
          return;
        case 'open-link':
          tree = replaceTreeRoots(
            tree,
            openMockLink(
              tree.roots,
              command.url,
              command.target,
              command.nestUnderActiveTab,
              () => nextBrowserId++
            )
          );
          commitTree();
          return;
        case 'import-items':
          if (command.target.kind === 'persistent') {
            const parentId = resolveMockTargetId(tree.roots, command.target.target);
            const importedNodes = createPersistentNodesFromPortable(command.items, {
              savedAt: Date.now(),
              sessionId: createMockId('session'),
              originalWindowId: mockTargetWindowId(command.target.target),
              createId: createMockId
            });
            const roots = importedNodes.reduce(
              (currentRoots, node, offset) =>
                insertPersistentTreeNode(currentRoots, parentId, command.index + offset, node),
              tree.roots
            );
            tree = replaceTreeRoots(tree, roots);
            commitTree();
            return;
          }
          if (command.target.kind === 'window') {
            let roots = tree.roots;
            const links = command.items.flatMap(collectPortableLinks);
            for (const [offset, link] of links.entries()) {
              roots = openMockTab(roots, command.target.id, command.index + offset, link.url, nextBrowserId++);
            }
            tree = replaceTreeRoots(tree, roots);
            commitTree();
            return;
          }
          await documentBackend.execute(command);
          return;
        case 'move-bookmark':
        case 'create-bookmark':
        case 'move-document-node':
          await documentBackend.execute(command);
          return;
        default: {
          const exhaustiveCommand: never = command;
          throw new Error(`Unsupported mock browser command: ${String(exhaustiveCommand)}`);
        }
        }
      } finally {
        captureNextTreeCommit = false;
      }
    }
  };

  function commitTree(): void {
    const previousTree = loadPersistedMockTree(storageKeys.tree);
    if (
      previousTree &&
      JSON.stringify(previousTree) !== JSON.stringify(tree) &&
      shouldCreateAutomaticSnapshot(snapshots)
    ) {
      snapshots = appendPersistentTreeSnapshot(snapshots, createPersistentTreeSnapshot(previousTree));
      saveMockSnapshots(storageKeys.snapshots, snapshots);
    }
    saveMockTree(storageKeys.tree, tree);
    notify('explore');
    if (captureNextTreeCommit) {
      captureNextTreeCommit = false;
      undoHistory.capture(createMockHistorySnapshot());
    }
  }

  function restoreMockSnapshot(createdAt: number): void {
    const snapshotIndex = findMockSnapshotIndex(snapshots, createdAt);
    const snapshot = requireMockSnapshot(createdAt);
    tree = snapshot.document;
    snapshots = snapshots.filter((_, index) => index !== snapshotIndex);
    saveMockSnapshots(storageKeys.snapshots, snapshots);
    saveMockTree(storageKeys.tree, tree);
    notify('explore');
  }

  function requireMockSnapshot(createdAt: number): PersistentTreeSnapshot {
    const snapshot = snapshots[findMockSnapshotIndex(snapshots, createdAt)];
    if (!snapshot) {
      throw new Error('The selected local mock Browser Atlas snapshot is no longer available.');
    }
    return snapshot;
  }

  function restoreMockDeletionById(deletionId: string): void {
    const deletionIndex = deletionHistory.findIndex((deletion) => deletion.deletionId === deletionId);
    const deletion = deletionHistory[deletionIndex];
    if (!deletion) {
      throw new Error('The selected deleted mock item is no longer available.');
    }
    tree = replaceTreeRoots(tree, restorePersistentTreeDeletion(tree.roots, deletion));
    deletionHistory = deletionHistory.filter((_, index) => index !== deletionIndex);
    saveMockDeletionHistory(storageKeys.deletions, deletionHistory);
    commitTree();
  }

  function createMockHistorySnapshot() {
    return {
      document: tree,
      deletions: deletionHistory,
      liveTabPlacements: [],
      closedLiveNodeIds: []
    };
  }

  function createAutomaticCloudBackupWhenDue(): void {
    if (!cloudConfiguration.connected || !cloudConfiguration.automaticBackups) {
      return;
    }
    const newestAutomaticBackup = cloudBackupRecords
      .filter((record) => record.file.mode === 'automatic')
      .sort((left, right) => right.file.createdAt - left.file.createdAt)[0];
    if (
      !newestAutomaticBackup ||
      Date.now() - newestAutomaticBackup.file.createdAt >= AUTOMATIC_CLOUD_BACKUP_INTERVAL_MS
    ) {
      createCloudBackupWithAttempt('automatic');
    }
  }

  function createCloudBackupWithAttempt(mode: ExplorerCloudBackupMode): void {
    try {
      createCloudBackup(mode);
      recordCloudBackupAttempt({ status: 'success', attemptedAt: Date.now(), mode });
    } catch (reason: unknown) {
      recordCloudBackupAttempt({
        status: 'failure',
        attemptedAt: Date.now(),
        mode,
        message: reason instanceof Error ? reason.message : 'The mock cloud backup failed.'
      });
      throw reason;
    }
  }

  function createCloudBackup(mode: ExplorerCloudBackupMode): void {
    const record = {
      backupId: createMockId('cloud-backup'),
      file: createPersistentCloudBackupFile(tree, cloudConfiguration.machineLabel, mode)
    } satisfies PersistentCloudBackupRecord;
    cloudBackupRecords = appendPersistentCloudBackupRecord(cloudBackupRecords, record);
    saveMockCloudBackups(storageKeys.cloudBackups, cloudBackupRecords);
  }

  function recordCloudBackupAttempt(attempt: ExplorerCloudBackupAttempt): void {
    cloudBackupAttempt = attempt;
    saveMockCloudBackupAttempt(storageKeys.cloudAttempt, attempt);
  }

  function restoreMockCloudBackup(backupId: string): void {
    requireMockCloudConnection();
    const backup = requireMockCloudBackup(backupId);
    snapshots = appendPersistentTreeSnapshot(snapshots, createPersistentTreeSnapshot(tree));
    saveMockSnapshots(storageKeys.snapshots, snapshots);
    tree = backup.file.document;
    saveMockTree(storageKeys.tree, tree);
    notify('explore');
  }

  function requireMockCloudBackup(backupId: string): PersistentCloudBackupRecord {
    const backup = cloudBackupRecords.find((record) => record.backupId === backupId);
    if (!backup) {
      throw new Error('The selected mock cloud backup is no longer available.');
    }
    return backup;
  }

  function requireMockCloudConnection(): void {
    if (!cloudConfiguration.connected) {
      throw new Error('Connect Mock Cloud Drive before managing remote backups.');
    }
  }

  function notify(source: ExplorerSourceId): void {
    for (const listener of listeners) {
      listener(source);
    }
  }
}

function findMockSnapshotIndex(
  snapshots: readonly PersistentTreeSnapshot[],
  createdAt: number
): number {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index]?.createdAt === createdAt) {
      return index;
    }
  }
  return -1;
}

const MOCK_EXPLORER_CAPABILITIES = {
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
    'move-bookmark': false,
    'create-bookmark': false,
    'import-items': true,
    'move-document-node': true
  }
} as const satisfies ExplorerBackend['capabilities'];

const MOCK_TREE_STORAGE_KEY = 'browserAtlas.mockTree.v2';
const MOCK_DELETION_STORAGE_KEY = 'browserAtlas.mockDeletedItems.v1';
const MOCK_SNAPSHOTS_STORAGE_KEY = 'browserAtlas.mockTreeSnapshots.v1';
const MOCK_CLOUD_BACKUPS_STORAGE_KEY = 'browserAtlas.mockCloudBackups.v1';
const MOCK_CLOUD_CONFIGURATION_STORAGE_KEY = 'browserAtlas.mockCloudConfiguration.v1';
const MOCK_CLOUD_ATTEMPT_STORAGE_KEY = 'browserAtlas.mockCloudAttempt.v1';
const MOCK_WINDOW_MARKERS_STORAGE_KEY = 'browserAtlas.mockWindowMarkers.v1';
const GOOGLE_DOC_CREATE_URL = 'https://docs.google.com/document/create';
const AUTOMATIC_CLOUD_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

type MockStorageKeys = Readonly<{
  tree: string;
  deletions: string;
  snapshots: string;
  cloudBackups: string;
  cloudConfiguration: string;
  cloudAttempt: string;
  windowMarkers: string;
}>;

function createMockStorageKeys(identity: NonNullable<MockExplorerBackendOptions['identity']>): MockStorageKeys {
  const suffix = identity === 'chrome' ? '' : `.${identity}`;
  return {
    tree: `${MOCK_TREE_STORAGE_KEY}${suffix}`,
    deletions: `${MOCK_DELETION_STORAGE_KEY}${suffix}`,
    snapshots: `${MOCK_SNAPSHOTS_STORAGE_KEY}${suffix}`,
    cloudBackups: `${MOCK_CLOUD_BACKUPS_STORAGE_KEY}${suffix}`,
    cloudConfiguration: `${MOCK_CLOUD_CONFIGURATION_STORAGE_KEY}${suffix}`,
    cloudAttempt: `${MOCK_CLOUD_ATTEMPT_STORAGE_KEY}${suffix}`,
    windowMarkers: `${MOCK_WINDOW_MARKERS_STORAGE_KEY}${suffix}`
  };
}

function loadPersistedMockTree(storageKey: string): PersistentTreeDocument | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const serialized = localStorage.getItem(storageKey);
      if (serialized) {
        const value: unknown = JSON.parse(serialized);
        if (isPersistentTreeDocument(value)) {
          return value;
        }
      }
    } catch {
      // Fall through to a fresh deterministic mock tree.
    }
  }
  return null;
}

function saveMockTree(storageKey: string, tree: PersistentTreeDocument): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tree));
  } catch {
    // The in-memory mock stays interactive when persistent storage is unavailable.
  }
}

function loadMockSnapshots(storageKey: string): readonly PersistentTreeSnapshot[] {
  try {
    const serialized = localStorage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : [];
    return parsePersistentTreeSnapshots(value);
  } catch {
    return [];
  }
}

function saveMockSnapshots(storageKey: string, snapshots: readonly PersistentTreeSnapshot[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(snapshots));
  } catch {
    // The in-memory snapshot stack remains usable when local storage is unavailable.
  }
}

type MockCloudConfiguration = ExplorerCloudBackupConfiguration & Readonly<{ connected: boolean }>;

function loadMockCloudConfiguration(storageKey: string): MockCloudConfiguration {
  try {
    const serialized = localStorage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : null;
    return parseMockCloudConfiguration(value);
  } catch {
    return DEFAULT_MOCK_CLOUD_CONFIGURATION;
  }
}

function parseMockCloudConfiguration(value: unknown): MockCloudConfiguration {
  if (
    !isRecord(value) ||
    typeof value.connected !== 'boolean' ||
    typeof value.machineLabel !== 'string' ||
    typeof value.automaticBackups !== 'boolean'
  ) {
    return DEFAULT_MOCK_CLOUD_CONFIGURATION;
  }
  return {
    connected: value.connected,
    machineLabel: value.machineLabel,
    automaticBackups: value.automaticBackups
  };
}

function publicMockCloudConfiguration(configuration: MockCloudConfiguration): ExplorerCloudBackupConfiguration {
  return {
    machineLabel: configuration.machineLabel,
    automaticBackups: configuration.automaticBackups
  };
}

function saveMockCloudConfiguration(storageKey: string, configuration: MockCloudConfiguration): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(configuration));
  } catch {
    // The simulated connection and preferences remain usable for this page lifetime.
  }
}

function loadMockCloudBackupAttempt(storageKey: string): ExplorerCloudBackupAttempt {
  try {
    const serialized = sessionStorage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : null;
    if (!isRecord(value) || typeof value.status !== 'string') {
      return { status: 'none' };
    }
    if (
      value.status === 'success' &&
      typeof value.attemptedAt === 'number' &&
      (value.mode === 'manual' || value.mode === 'automatic')
    ) {
      return { status: 'success', attemptedAt: value.attemptedAt, mode: value.mode };
    }
    if (
      value.status === 'failure' &&
      typeof value.attemptedAt === 'number' &&
      (value.mode === 'manual' || value.mode === 'automatic') &&
      typeof value.message === 'string'
    ) {
      return {
        status: 'failure',
        attemptedAt: value.attemptedAt,
        mode: value.mode,
        message: value.message
      };
    }
    return { status: 'none' };
  } catch {
    return { status: 'none' };
  }
}

function saveMockCloudBackupAttempt(storageKey: string, attempt: ExplorerCloudBackupAttempt): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    // The status strip remains correct in memory when session storage is unavailable.
  }
}

function loadMockSavedWindowMarkers(
  storageKey: string
): Map<string, ExplorerTransientWindowStatus> {
  try {
    const serialized = sessionStorage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : null;
    if (!isRecord(value)) {
      return new Map();
    }
    return new Map(
      Object.entries(value).flatMap(([id, marker]): readonly [string, ExplorerTransientWindowStatus][] =>
        marker === 'recently-saved' || marker === 'crash-recovered' ? [[id, marker]] : []
      )
    );
  } catch {
    return new Map();
  }
}

function saveMockSavedWindowMarkers(
  storageKey: string,
  markers: ReadonlyMap<string, ExplorerTransientWindowStatus>
): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(markers)));
  } catch {
    // The markers remain correct in memory when session storage is unavailable.
  }
}

function loadMockCloudBackups(storageKey: string): readonly PersistentCloudBackupRecord[] {
  try {
    const serialized = localStorage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : [];
    return parsePersistentCloudBackupRecords(value);
  } catch {
    return [];
  }
}

function saveMockCloudBackups(storageKey: string, records: readonly PersistentCloudBackupRecord[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    // Remote mock objects remain available in memory when local storage is unavailable.
  }
}

function loadMockDeletionHistory(storageKey: string): readonly PersistentTreeDeletion[] {
  try {
    const serialized = localStorage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : [];
    return parsePersistentTreeDeletions(value);
  } catch {
    return [];
  }
}

function saveMockDeletionHistory(storageKey: string, history: readonly PersistentTreeDeletion[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(history));
  } catch {
    // Undo remains available in memory when persistent storage is unavailable.
  }
}

function detachMockLiveBindings(node: PersistentTreeNode, savedAt: number): PersistentTreeNode {
  const children = node.children.map((child) => detachMockLiveBindings(child, savedAt));
  if (node.kind === 'tab' && node.binding.state === 'live') {
    return {
      ...node,
      children,
      binding: {
        state: 'saved',
        savedAt,
        sessionId: `mock-deletion-${savedAt}`,
        originalWindowId: node.binding.windowId,
        originalIndex: node.binding.index
      }
    };
  }
  if (node.kind === 'window' && node.binding.state === 'live') {
    return {
      ...node,
      children,
      binding: { state: 'saved', savedAt, sessionId: `mock-deletion-${savedAt}` }
    };
  }
  return { ...node, children };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const DEFAULT_MOCK_CLOUD_CONFIGURATION = {
  connected: false,
  machineLabel: '',
  automaticBackups: false
} as const satisfies MockCloudConfiguration;

function createInitialMockTree(
  identity: NonNullable<MockExplorerBackendOptions['identity']>
): PersistentTreeDocument {
  const now = Date.now();
  const chromeTree: PersistentTreeDocument = {
    format: PERSISTENT_TREE_FORMAT,
    version: PERSISTENT_TREE_VERSION,
    roots: [
      {
        kind: 'window',
        id: 'mock-live-window-research',
        title: 'Research window (focused)',
        bounds: { left: 80, top: 60, width: 1080, height: 760 },
        binding: { state: 'live', windowId: 1001, focused: true },
        children: [
          createMockLiveTab(
            'mock-live-tab-atlas',
            2001,
            1001,
            0,
            'Browser Atlas',
            'http://localhost:3120/browser-atlas',
            true
          ),
          createMockLiveTab(
            'mock-live-tab-solid',
            2002,
            1001,
            1,
            'SolidJS documentation',
            'https://docs.solidjs.com/',
            false
          )
        ]
      },
      {
        kind: 'window',
        id: 'mock-live-window-reading',
        title: 'Reading window',
        bounds: { left: 180, top: 110, width: 960, height: 700 },
        binding: { state: 'live', windowId: 1002, focused: false },
        children: [
          createMockLiveTab(
            'mock-live-tab-mdn',
            2003,
            1002,
            0,
            'MDN WebExtensions',
            'https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions',
            true
          )
        ]
      },
      {
        kind: 'group',
        id: 'mock-saved-project',
        title: 'Browser Atlas project',
        children: [
          {
            kind: 'note',
            id: 'mock-note-next',
            text: 'Next: persistent tree and crash recovery',
            children: [
              createMockSavedTab(
                'mock-saved-tab-design',
                'Tabs Outliner architecture notes',
                'https://example.com/browser-atlas/design',
                now - 60_000
              )
            ]
          },
          { kind: 'separator', id: 'mock-separator', style: 1, children: [] },
          {
            kind: 'window',
            id: 'mock-saved-window-reference',
            title: 'Reference session',
            bounds: { left: 320, top: 140, width: 900, height: 680 },
            binding: { state: 'saved', savedAt: now - 120_000, sessionId: 'mock-reference-session' },
            children: [
              createMockSavedTab(
                'mock-saved-tab-chrome',
                'Chrome Extensions API',
                'https://developer.chrome.com/docs/extensions/reference/api',
                now - 120_000,
                'mock-reference-session'
              ),
              {
                kind: 'group',
                id: 'mock-nested-group',
                title: 'Cross-browser research',
                children: [
                  createMockSavedTab(
                    'mock-saved-tab-firefox',
                    'Firefox WebExtensions',
                    'https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions',
                    now - 120_000,
                    'mock-reference-session'
                  )
                ]
              }
            ]
          }
        ]
      },
      {
        kind: 'window',
        id: 'mock-crashed-window',
        title: 'Recovered · Previous research session',
        bounds: { left: 240, top: 90, width: 1024, height: 720 },
        binding: { state: 'crashed', savedAt: now - 300_000, sessionId: 'mock-crashed-session' },
        children: [
          {
            ...createMockSavedTab(
              'mock-crashed-tab',
              'Unsaved WebExtensions draft',
              'https://example.com/recovered-after-crash',
              now - 300_000
            ),
            binding: {
              state: 'crashed',
              savedAt: now - 300_000,
              sessionId: 'mock-crashed-session',
              originalWindowId: 999,
              originalIndex: 0
            }
          }
        ]
      }
    ]
  };
  return identity === 'chrome' ? chromeTree : createFirefoxMockTree(chromeTree);
}

function createFirefoxMockTree(chromeTree: PersistentTreeDocument): PersistentTreeDocument {
  return {
    ...chromeTree,
    roots: chromeTree.roots.map(rebaseFirefoxNode)
  };
}

function rebaseFirefoxNode(node: PersistentTreeNode): PersistentTreeNode {
  const children = node.children.map(rebaseFirefoxNode);
  const id = `firefox-${node.id}`;
  switch (node.kind) {
    case 'window':
      return {
        ...node,
        id,
        title: node.binding.state === 'live' ? `Firefox · ${node.title}` : node.title,
        binding: node.binding.state === 'live'
          ? { ...node.binding, windowId: node.binding.windowId + 2_000 }
          : { ...node.binding, sessionId: `firefox-${node.binding.sessionId}` },
        children
      };
    case 'tab':
      return {
        ...node,
        id,
        binding: node.binding.state === 'live'
          ? {
              ...node.binding,
              tabId: node.binding.tabId + 2_000,
              windowId: node.binding.windowId + 2_000
            }
          : {
              ...node.binding,
              sessionId: `firefox-${node.binding.sessionId}`,
              originalWindowId: node.binding.originalWindowId + 2_000
            },
        children
      };
    case 'group':
      return { ...node, id, title: node.title === 'Browser Atlas project' ? 'Firefox workspace' : node.title, children };
    case 'note':
      return { ...node, id, children };
    case 'separator':
      return { ...node, id, children };
    default: {
      const exhaustiveNode: never = node;
      return exhaustiveNode;
    }
  }
}

function createMockWindow(windowId: number, tabId: number): PersistentWindowNode {
  return {
    kind: 'window',
    id: createMockId('window'),
    title: 'New window',
    bounds: DEFAULT_MOCK_WINDOW_BOUNDS,
    binding: { state: 'live', windowId, focused: true },
    children: [createMockLiveTab(createMockId('tab'), tabId, windowId, 0, 'New Tab', 'about:blank', true)]
  };
}

function createMockLiveTab(
  id: string,
  tabId: number,
  windowId: number,
  index: number,
  title: string,
  url: string,
  active: boolean
): PersistentTabNode {
  return {
    kind: 'tab',
    id,
    title,
    url,
    active,
    pinned: false,
    binding: { state: 'live', tabId, windowId, index },
    children: []
  };
}

function createMockSavedTab(
  id: string,
  title: string,
  url: string,
  savedAt: number,
  sessionId = createMockId('session')
): PersistentTabNode {
  return {
    kind: 'tab',
    id,
    title,
    url,
    active: false,
    pinned: false,
    binding: { state: 'saved', savedAt, sessionId, originalWindowId: 1001, originalIndex: 0 },
    children: []
  };
}

function createMockGoogleDoc(): PersistentTabNode {
  return {
    ...createMockSavedTab(
      createMockId('tab'),
      'Untitled document',
      GOOGLE_DOC_CREATE_URL,
      Date.now()
    ),
    keepOnClose: true
  };
}

function createMockExploreTree(
  tree: PersistentTreeDocument,
  savedWindowMarkers: ReadonlyMap<string, ExplorerTransientWindowStatus>
): ExplorerTreeNode {
  return createExplorerSourceRoot(
    'explore',
    'Mock browser tree',
    tree.roots.map((node, index) =>
      createPersistentExplorerNode(node, index, { id: null, kind: 'root' }, savedWindowMarkers)
    ),
    true
  );
}

type PersistentNodeParent = Readonly<{ id: string | null; kind: SavedParentKind }>;

function createPersistentExplorerNode(
  node: PersistentTreeNode,
  index: number,
  parent: PersistentNodeParent,
  savedWindowMarkers: ReadonlyMap<string, ExplorerTransientWindowStatus>
): ExplorerTreeGroupNode | ExplorerTreeLinkNode {
  const children = node.children.map((child, childIndex) =>
    createPersistentExplorerNode(child, childIndex, { id: node.id, kind: node.kind }, savedWindowMarkers)
  );
  switch (node.kind) {
    case 'window':
      return node.binding.state === 'live'
        ? createMockLiveWindowNode(node, index, parent, children)
        : createMockSavedWindowNode(node, index, parent, children, savedWindowMarkers.get(node.id));
    case 'tab':
      return node.binding.state === 'live'
        ? createMockLiveTabNode(node, index, children)
        : createMockSavedTabNode(node, index, parent, children);
    case 'group':
      return createMockGroupNode(node, index, parent, children);
    case 'note':
      return createMockNoteNode(node, index, parent, children);
    case 'separator':
      return createMockSeparatorNode(node, index, parent, children);
    default: {
      const exhaustiveNode: never = node;
      return exhaustiveNode;
    }
  }
}

function createMockLiveWindowNode(
  node: PersistentWindowNode,
  index: number,
  parent: PersistentNodeParent,
  children: ExplorerTreeNode[]
): ExplorerTreeGroupNode {
  if (node.binding.state !== 'live') {
    throw new Error('Expected a live mock window.');
  }
  return {
    id: `explore-window-${node.binding.windowId}`,
    kind: 'group',
    groupKind: 'window',
    source: 'explore',
    reference: { kind: 'window', id: String(node.binding.windowId), focused: node.binding.focused },
    index,
    draggable: true,
    acceptsDrop: true,
    title: `${node.title.replace(/ \(focused\)$/u, '')}${node.binding.focused ? ' (focused)' : ''}`,
    children,
    defaultCollapsed: false,
    ...(protectsMockLiveWindow(node, parent) ? { protectedFromClose: true } : {})
  };
}

function createMockSavedWindowNode(
  node: PersistentWindowNode,
  index: number,
  parent: PersistentNodeParent,
  children: ExplorerTreeNode[],
  transientStatus?: ExplorerTransientWindowStatus
): ExplorerTreeGroupNode {
  return {
    id: `explore-saved-window-${node.id}`,
    kind: 'group',
    groupKind: 'window',
    source: 'explore',
    reference: { kind: 'saved-window', id: node.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    acceptsDrop: true,
    title: node.title,
    children,
    defaultCollapsed: false,
    ...(transientStatus ? { transientStatus } : {})
  };
}

function createMockLiveTabNode(
  node: PersistentTabNode,
  index: number,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  if (node.binding.state !== 'live') {
    throw new Error('Expected a live mock tab.');
  }
  return {
    id: `explore-tab-${node.binding.tabId}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'tab', id: String(node.binding.tabId), windowId: String(node.binding.windowId) },
    index,
    draggable: true,
    title: node.title,
    url: node.url,
    faviconUrl: null,
    description: `${node.active ? 'Active mock tab · ' : 'Mock tab · '}${node.url}`,
    children,
    defaultCollapsed: false,
    ...(node.active ? { active: true } : {}),
    ...(node.keepOnClose === true ? { keepOnClose: true } : {}),
    ...(protectsMockLiveTab(node) ? { protectedFromClose: true } : {})
  };
}

function createMockSavedTabNode(
  node: PersistentTabNode,
  index: number,
  parent: PersistentNodeParent,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  return {
    id: `explore-saved-tab-${node.id}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'saved-tab', id: node.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    title: node.title,
    url: node.url,
    faviconUrl: null,
    description: `${node.binding.state === 'crashed' ? 'Crash-recovered' : 'Saved'} mock tab · ${node.url}`,
    children,
    defaultCollapsed: false,
    ...(node.keepOnClose === true ? { keepOnClose: true } : {})
  };
}

function protectsMockLiveTab(node: PersistentTabNode): boolean {
  if (node.binding.state !== 'live') {
    return false;
  }
  const windowId = node.binding.windowId;
  return (
    node.keepOnClose === true ||
    node.children.some((child) => !isUnmarkedMockLiveTab(child, windowId))
  );
}

function protectsMockLiveWindow(node: PersistentWindowNode, parent: PersistentNodeParent): boolean {
  if (node.binding.state !== 'live') {
    return false;
  }
  const windowId = node.binding.windowId;
  return (
    node.customTitle === true ||
    parent.id !== null ||
    node.children.some((child) => !isUnmarkedMockLiveTab(child, windowId))
  );
}

function isUnmarkedMockLiveTab(node: PersistentTreeNode, windowId: number): boolean {
  return (
    node.kind === 'tab' &&
    node.binding.state === 'live' &&
    node.binding.windowId === windowId &&
    node.children.length === 0 &&
    node.keepOnClose !== true
  );
}

function createMockGroupNode(
  node: PersistentGroupNode,
  index: number,
  parent: PersistentNodeParent,
  children: ExplorerTreeNode[]
): ExplorerTreeGroupNode {
  return {
    id: `explore-saved-group-${node.id}`,
    kind: 'group',
    groupKind: 'group',
    source: 'explore',
    reference: { kind: 'saved-group', id: node.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    acceptsDrop: true,
    title: node.title,
    children,
    defaultCollapsed: false
  };
}

function createMockNoteNode(
  node: PersistentNoteNode,
  index: number,
  parent: PersistentNodeParent,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  return {
    id: `explore-saved-note-${node.id}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'saved-note', id: node.id, parentId: parent.id, parentKind: parent.kind },
    index,
    draggable: true,
    title: node.text,
    url: null,
    faviconUrl: null,
    description: 'Persistent mock note',
    children,
    defaultCollapsed: false
  };
}

function createMockSeparatorNode(
  node: PersistentSeparatorNode,
  index: number,
  parent: PersistentNodeParent,
  children: ExplorerTreeNode[]
): ExplorerTreeLinkNode {
  return {
    id: `explore-saved-separator-${node.id}`,
    kind: 'link',
    source: 'explore',
    reference: { kind: 'saved-separator', id: node.id, parentId: parent.id, parentKind: parent.kind, style: node.style },
    index,
    draggable: true,
    title: SEPARATOR_TITLES[node.style],
    url: null,
    faviconUrl: null,
    description: 'Persistent mock separator',
    children,
    defaultCollapsed: false
  };
}

function activateMockTab(
  nodes: readonly PersistentTreeNode[],
  tabId: string,
  windowId: string
): readonly PersistentTreeNode[] {
  return mapPersistentNodes(nodes, (node) => {
    if (node.kind === 'window' && node.binding.state === 'live') {
      return { ...node, binding: { ...node.binding, focused: String(node.binding.windowId) === windowId } };
    }
    if (node.kind === 'tab' && node.binding.state === 'live') {
      return { ...node, active: String(node.binding.tabId) === tabId };
    }
    return node;
  });
}

function resolveMockTargetId(
  nodes: readonly PersistentTreeNode[],
  target: PersistentItemTarget
): string | null {
  switch (target.kind) {
    case 'root':
      return null;
    case 'saved':
      return target.id;
    case 'live-window': {
      const window = findMockLiveWindow(nodes, target.windowId);
      if (!window) {
        throw new Error('The mock live window no longer exists.');
      }
      return window.id;
    }
    case 'live-tab': {
      const tab = findMockLiveTab(nodes, target.tabId);
      if (!tab) {
        throw new Error('The mock live tab no longer exists.');
      }
      return tab.id;
    }
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function insertMockPersistentNode(
  roots: readonly PersistentTreeNode[],
  placement: PersistentOrganizerPlacement,
  item: PersistentTreeNode
): readonly PersistentTreeNode[] {
  switch (placement.kind) {
    case 'inside':
      return insertPersistentTreeNode(
        roots,
        resolveMockTargetId(roots, placement.target),
        placement.position === 'first' ? 0 : Number.MAX_SAFE_INTEGER,
        item
      );
    case 'tree-end':
      return insertPersistentTreeNode(roots, null, Number.MAX_SAFE_INTEGER, item);
    case 'sibling': {
      const targetId = requireMockTargetId(resolveMockTargetId(roots, placement.target));
      const location = findPersistentTreeLocation(roots, targetId);
      if (!location) {
        throw new Error('The mock organizer insertion anchor no longer exists.');
      }
      return insertPersistentTreeNode(
        roots,
        location.parentId,
        location.index + (placement.position === 'after' ? 1 : 0),
        item
      );
    }
    case 'parent': {
      const targetId = requireMockTargetId(resolveMockTargetId(roots, placement.target));
      const location = findPersistentTreeLocation(roots, targetId);
      if (!location) {
        throw new Error('The mock organizer insertion anchor no longer exists.');
      }
      return insertPersistentTreeNode(
        removePersistentTreeNode(roots, targetId),
        location.parentId,
        location.index,
        { ...item, children: [location.node] }
      );
    }
    default: {
      const exhaustivePlacement: never = placement;
      return exhaustivePlacement;
    }
  }
}

function repositionMockPersistentItem(
  roots: readonly PersistentTreeNode[],
  item: PersistentItemReference,
  placement: PersistentMovePlacement
): readonly PersistentTreeNode[] {
  const sourceId = requireMockTargetId(resolveMockTargetId(roots, item));
  if (placement.kind === 'tree-end') {
    return movePersistentTreeNode(roots, sourceId, null, Number.MAX_SAFE_INTEGER);
  }
  if (placement.kind === 'inside') {
    return movePersistentTreeNode(
      roots,
      sourceId,
      resolveMockTargetId(roots, placement.target),
      placement.position === 'first' ? 0 : Number.MAX_SAFE_INTEGER
    );
  }

  const targetId = requireMockTargetId(resolveMockTargetId(roots, placement.target));
  const [sourceLocation, targetLocation] = [
    findPersistentTreeLocation(roots, sourceId),
    findPersistentTreeLocation(roots, targetId)
  ];
  if (!sourceLocation || !targetLocation) {
    throw new Error('The mock keyboard-move source or destination no longer exists.');
  }
  let targetIndex = targetLocation.index + (placement.position === 'after' ? 1 : 0);
  if (sourceLocation.parentId === targetLocation.parentId && sourceLocation.index < targetIndex) {
    targetIndex -= 1;
  }
  return movePersistentTreeNode(roots, sourceId, targetLocation.parentId, targetIndex);
}

function requireMockTargetId(itemId: string | null): string {
  if (itemId === null) {
    throw new Error('The mock tree root cannot be used as an organizer item anchor.');
  }
  return itemId;
}

function mockTargetWindowId(target: PersistentItemTarget): number {
  switch (target.kind) {
    case 'live-window':
    case 'live-tab': {
      const windowId = Number(target.windowId);
      return Number.isInteger(windowId) ? windowId : -1;
    }
    case 'root':
    case 'saved':
      return -1;
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function retainMockTab(
  nodes: readonly PersistentTreeNode[],
  tabId: string,
  state: 'saved' | 'crashed',
  includeDescendants = false
): readonly PersistentTreeNode[] {
  const node = findMockLiveTab(nodes, tabId);
  if (!node || node.binding.state !== 'live') {
    throw new Error('The mock live tab no longer exists.');
  }
  const retention = { savedAt: Date.now(), sessionId: createMockId('session') } as const;
  return updatePersistentTreeNode(nodes, node.id, (candidate) => {
    if (candidate.kind !== 'tab' || candidate.binding.state !== 'live') {
      throw new Error('The mock tab changed before it could be saved.');
    }
    const savedTab: PersistentTreeNode = {
      ...candidate,
      active: false,
      binding: {
        state,
        ...retention,
        originalWindowId: candidate.binding.windowId,
        originalIndex: candidate.binding.index
      }
    };
    return includeDescendants ? retainHierarchy(savedTab, state, retention) : savedTab;
  });
}

function retainAllMockWindows(nodes: readonly PersistentTreeNode[]): readonly PersistentTreeNode[] {
  const liveWindowIds = nodes.flatMap((node) =>
    node.kind === 'window' && node.binding.state === 'live' ? [String(node.binding.windowId)] : []
  );
  return liveWindowIds.reduce(
    (currentNodes, windowId) => retainMockWindow(currentNodes, windowId, 'saved'),
    nodes
  );
}

function retainMockWindow(
  nodes: readonly PersistentTreeNode[],
  windowId: string,
  state: 'saved' | 'crashed',
  includeDescendants = false
): readonly PersistentTreeNode[] {
  const window = findMockLiveWindow(nodes, windowId);
  if (!window) {
    throw new Error('The mock live window no longer exists.');
  }
  const retention = { savedAt: Date.now(), sessionId: createMockId('session') } as const;
  return updatePersistentTreeNode(nodes, window.id, (candidate) =>
    includeDescendants
      ? retainHierarchy(candidate, state, retention)
      : retainMockBrowserWindow(candidate, Number(windowId), state, retention)
  );
}

function retainMockBrowserWindow(
  node: PersistentTreeNode,
  windowId: number,
  state: 'saved' | 'crashed',
  retention: Readonly<{ savedAt: number; sessionId: string }>
): PersistentTreeNode {
  const children = node.children.map((child) => retainMockBrowserWindow(child, windowId, state, retention));
  if (node.kind === 'window' && node.binding.state === 'live' && node.binding.windowId === windowId) {
    return { ...node, binding: { state, ...retention }, children };
  }
  if (node.kind === 'tab' && node.binding.state === 'live' && node.binding.windowId === windowId) {
    return {
      ...node,
      active: false,
      binding: {
        state,
        ...retention,
        originalWindowId: node.binding.windowId,
        originalIndex: node.binding.index
      },
      children
    };
  }
  return { ...node, children };
}

function retainHierarchy(
  node: PersistentTreeNode,
  state: 'saved' | 'crashed',
  retention: Readonly<{ savedAt: number; sessionId: string }>
): PersistentTreeNode {
  const children = node.children.map((child) => retainHierarchy(child, state, retention));
  if (node.kind === 'window' && node.binding.state === 'live') {
    return { ...node, binding: { state, ...retention }, children };
  }
  if (node.kind === 'tab' && node.binding.state === 'live') {
    return {
      ...node,
      active: false,
      binding: {
        state,
        ...retention,
        originalWindowId: node.binding.windowId,
        originalIndex: node.binding.index
      },
      children
    };
  }
  return { ...node, children };
}

function restoreMockTab(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  tabId: number
): readonly PersistentTreeNode[] {
  const firstWindow = findFirstLiveWindow(nodes);
  const windowId = firstWindow?.binding.state === 'live' ? firstWindow.binding.windowId : tabId + 1;
  return updatePersistentTreeNode(nodes, nodeId, (node) => {
    if (node.kind !== 'tab' || node.binding.state === 'live') {
      throw new Error('The mock saved tab no longer exists.');
    }
    return {
      ...node,
      binding: { state: 'live', tabId, windowId, index: node.binding.originalIndex },
      active: false
    };
  });
}

function restoreMockWindow(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  windowId: number,
  firstTabId: number,
  mode: RestoreMockWindowMode = 'all',
  restoreOriginalBounds = true
): readonly PersistentTreeNode[] {
  const savedWindow = findPersistentTreeNode(nodes, nodeId);
  if (!savedWindow || savedWindow.kind !== 'window' || savedWindow.binding.state === 'live') {
    throw new Error('The mock saved window no longer exists.');
  }
  const sessionId = savedWindow.binding.sessionId;
  if (mode === 'last-session' && countLastWindowSessionTabs(savedWindow) === 0) {
    throw new Error('This saved window has no tabs from its latest saved session.');
  }
  let tabOffset = 0;
  return updatePersistentTreeNode(nodes, nodeId, (node) => {
    return restoreHierarchy(node);
  });

  function restoreHierarchy(node: PersistentTreeNode): PersistentTreeNode {
    const children = node.children.map(restoreHierarchy);
    if (node.kind === 'window' && node.id === nodeId) {
      return {
        ...node,
        bounds: restoreOriginalBounds ? node.bounds ?? DEFAULT_MOCK_WINDOW_BOUNDS : DEFAULT_MOCK_WINDOW_BOUNDS,
        binding: { state: 'live', windowId, focused: true },
        children
      };
    }
    if (node.kind === 'window' && node.binding.state !== 'live') {
      return containsMockWindowTab(children, windowId)
        ? { kind: 'group', id: node.id, title: node.title, children }
        : { ...node, children };
    }
    if (
      node.kind === 'tab' &&
      node.binding.state !== 'live' &&
      (mode === 'all' || node.binding.sessionId === sessionId)
    ) {
      const tabId = firstTabId + tabOffset;
      const index = tabOffset;
      tabOffset += 1;
      return { ...node, binding: { state: 'live', tabId, windowId, index }, children };
    }
    return { ...node, children };
  }
}

function restoreMockGroup(
  nodes: readonly PersistentTreeNode[],
  nodeId: string,
  windowId: number,
  firstTabId: number
): readonly PersistentTreeNode[] {
  const savedGroup = findPersistentTreeNode(nodes, nodeId);
  if (!savedGroup || savedGroup.kind !== 'group') {
    throw new Error('The mock saved group no longer exists.');
  }
  let tabOffset = 0;
  const restored = updatePersistentTreeNode(nodes, nodeId, restoreHierarchy);
  return setMockFocusedWindow(restored, windowId);

  function restoreHierarchy(node: PersistentTreeNode): PersistentTreeNode {
    const children = node.children.map(restoreHierarchy);
    if (node.kind === 'tab') {
      const index = tabOffset;
      const tabId = node.binding.state === 'live' ? node.binding.tabId : firstTabId + tabOffset;
      tabOffset += 1;
      return {
        ...node,
        active: index === 0,
        binding: { state: 'live', tabId, windowId, index },
        children
      };
    }
    if (node.kind === 'group' && node.id === nodeId) {
      const initialChildren = tabOffset === 0
        ? [createMockLiveTab(createMockId('tab'), firstTabId, windowId, 0, 'New Tab', 'about:blank', true)]
        : children;
      return {
        kind: 'window',
        id: node.id,
        title: node.title,
        customTitle: true,
        bounds: DEFAULT_MOCK_WINDOW_BOUNDS,
        binding: { state: 'live', windowId, focused: true },
        children: initialChildren
      };
    }
    if (node.kind === 'window' && node.binding.state !== 'live') {
      return containsMockWindowTab(children, windowId)
        ? { kind: 'group', id: node.id, title: node.title, children }
        : { ...node, children };
    }
    return { ...node, children };
  }
}

type RestoreMockWindowMode = 'all' | 'last-session';

const DEFAULT_MOCK_WINDOW_BOUNDS = {
  left: 100,
  top: 100,
  width: 1200,
  height: 800
} as const satisfies PersistentWindowBounds;

function containsMockWindowTab(nodes: readonly PersistentTreeNode[], windowId: number): boolean {
  return nodes.some((node) =>
    (node.kind === 'tab' && node.binding.state === 'live' && node.binding.windowId === windowId) ||
    containsMockWindowTab(node.children, windowId)
  );
}

function restoreMockItemIntoWindow(
  nodes: readonly PersistentTreeNode[],
  itemId: string,
  targetWindowId: string,
  targetIndex: number,
  createBrowserId: () => number
): readonly PersistentTreeNode[] {
  const targetWindow = findMockLiveWindow(nodes, targetWindowId);
  const item = findPersistentTreeNode(nodes, itemId);
  if (!targetWindow || targetWindow.binding.state !== 'live' || !item) {
    throw new Error('The mock saved hierarchy or destination window no longer exists.');
  }
  const browserWindowId = targetWindow.binding.windowId;
  const moved = movePersistentTreeNode(nodes, itemId, targetWindow.id, targetIndex);
  let tabOffset = 0;
  return updatePersistentTreeNode(moved, itemId, restoreHierarchy);

  function restoreHierarchy(node: PersistentTreeNode): PersistentTreeNode {
    const children = node.children.map(restoreHierarchy);
    if (node.kind === 'tab') {
      const index = targetIndex + tabOffset;
      tabOffset += 1;
      return {
        ...node,
        active: false,
        binding: {
          state: 'live',
          tabId: node.binding.state === 'live' ? node.binding.tabId : createBrowserId(),
          windowId: browserWindowId,
          index
        },
        children
      };
    }
    if (node.kind === 'window' && node.binding.state !== 'live') {
      return { kind: 'group', id: node.id, title: node.title, children };
    }
    return { ...node, children };
  }
}

function moveMockLiveTab(
  nodes: readonly PersistentTreeNode[],
  command: Extract<ExplorerCommand, { kind: 'move-tab' }>
): readonly PersistentTreeNode[] {
  const tab = findMockLiveTab(nodes, command.tabId);
  const targetWindow = findMockLiveWindow(nodes, command.targetWindowId);
  if (!tab || !targetWindow || tab.binding.state !== 'live' || targetWindow.binding.state !== 'live') {
    throw new Error('The mock tab or destination window no longer exists.');
  }
  const targetWindowId = targetWindow.binding.windowId;
  const moved = movePersistentTreeNode(nodes, tab.id, targetWindow.id, command.targetIndex);
  return updatePersistentTreeNode(moved, tab.id, (node) => {
    if (node.kind !== 'tab' || node.binding.state !== 'live') {
      throw new Error('The mock tab changed during the move.');
    }
    return {
      ...node,
      binding: { ...node.binding, windowId: targetWindowId, index: command.targetIndex }
    };
  });
}

function moveMockLiveTabIntoGroup(
  nodes: readonly PersistentTreeNode[],
  tab: PersistentTabNode,
  group: PersistentGroupNode,
  targetIndex: number,
  windowId: number
): readonly PersistentTreeNode[] {
  if (tab.binding.state !== 'live') {
    throw new Error('The mock tab selected for the group is no longer live.');
  }
  let nextRoots = movePersistentTreeNode(nodes, tab.id, group.id, targetIndex);
  nextRoots = updatePersistentTreeNode(nextRoots, tab.id, (node) => {
    if (node.kind !== 'tab' || node.binding.state !== 'live') {
      throw new Error('The mock tab changed while its group became a window.');
    }
    return {
      ...node,
      active: true,
      binding: { ...node.binding, windowId, index: targetIndex }
    };
  });
  nextRoots = updatePersistentTreeNode(nextRoots, group.id, (node) => {
    if (node.kind !== 'group') {
      throw new Error('The mock destination group changed while becoming a window.');
    }
    return {
      kind: 'window',
      id: node.id,
      title: node.title,
      customTitle: true,
      bounds: DEFAULT_MOCK_WINDOW_BOUNDS,
      binding: { state: 'live', windowId, focused: true },
      children: node.children
    };
  });
  return setMockFocusedWindow(nextRoots, windowId);
}

function liberateMockTab(
  nodes: readonly PersistentTreeNode[],
  tabId: string,
  windowId: number,
  targetIndex: number
): readonly PersistentTreeNode[] {
  const tab = findMockLiveTab(nodes, tabId);
  if (!tab || tab.binding.state !== 'live') {
    throw new Error('The mock live tab selected for a new window no longer exists.');
  }
  const liberatedTab = {
    ...tab,
    active: true,
    binding: { ...tab.binding, windowId, index: 0 }
  } satisfies PersistentTabNode;
  const withoutTab = removePersistentTreeNode(nodes, tab.id);
  return insertPersistentTreeNode(
    setMockFocusedWindow(withoutTab, windowId),
    null,
    targetIndex,
    {
      kind: 'window',
      id: createMockId('window'),
      title: tab.title,
      binding: { state: 'live', windowId, focused: true },
      children: [liberatedTab]
    }
  );
}

function openMockTab(
  nodes: readonly PersistentTreeNode[],
  windowId: string,
  index: number,
  url: string,
  tabId: number
): readonly PersistentTreeNode[] {
  const window = findMockLiveWindow(nodes, windowId);
  if (!window || window.binding.state !== 'live') {
    throw new Error('The mock destination window no longer exists.');
  }
  return insertPersistentTreeNode(
    nodes,
    window.id,
    index,
    createMockLiveTab(createMockId('tab'), tabId, window.binding.windowId, index, url, url, false)
  );
}

function openMockLink(
  nodes: readonly PersistentTreeNode[],
  url: string,
  target: Extract<ExplorerCommand, { kind: 'open-link' }>['target'],
  nestUnderActiveTab: boolean,
  createBrowserId: () => number
): readonly PersistentTreeNode[] {
  switch (target) {
    case 'new-window': {
      const windowId = createBrowserId();
      const tabId = createBrowserId();
      return [
        ...setMockFocusedWindow(nodes, windowId),
        {
          kind: 'window',
          id: createMockId('window'),
          title: url,
          binding: { state: 'live', windowId, focused: true },
          children: [createMockLiveTab(createMockId('tab'), tabId, windowId, 0, url, url, true)]
        }
      ];
    }
    case 'last-focused-window': {
      const window = findFocusedMockWindow(nodes) ?? findFirstLiveWindow(nodes);
      if (!window || window.binding.state !== 'live') {
        return openMockLink(nodes, url, 'new-window', false, createBrowserId);
      }
      const windowId = window.binding.windowId;
      const opener = nestUnderActiveTab ? findActiveMockTab(window.children, windowId) : undefined;
      const browserIndex = countMockLiveTabs(window.children, windowId);
      const focusedNodes = setMockFocusedWindow(nodes, windowId).map(clearActiveTabsInWindow);
      return insertPersistentTreeNode(
        focusedNodes,
        opener?.id ?? window.id,
        Number.MAX_SAFE_INTEGER,
        createMockLiveTab(createMockId('tab'), createBrowserId(), windowId, browserIndex, url, url, true)
      );

      function clearActiveTabsInWindow(node: PersistentTreeNode): PersistentTreeNode {
        const children = node.children.map(clearActiveTabsInWindow);
        return node.kind === 'tab' && node.binding.state === 'live' && node.binding.windowId === windowId
          ? { ...node, active: false, children }
          : { ...node, children };
      }
    }
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function findActiveMockTab(
  nodes: readonly PersistentTreeNode[],
  windowId: number
): PersistentTabNode | undefined {
  return findPersistentNode(
    nodes,
    (node): node is PersistentTabNode =>
      node.kind === 'tab' &&
      node.binding.state === 'live' &&
      node.binding.windowId === windowId &&
      node.active
  );
}

function countMockLiveTabs(nodes: readonly PersistentTreeNode[], windowId: number): number {
  return nodes.reduce(
    (count, node) =>
      count +
      (node.kind === 'tab' && node.binding.state === 'live' && node.binding.windowId === windowId ? 1 : 0) +
      countMockLiveTabs(node.children, windowId),
    0
  );
}

function setMockFocusedWindow(
  nodes: readonly PersistentTreeNode[],
  focusedWindowId: number
): readonly PersistentTreeNode[] {
  return mapPersistentNodes(nodes, (node) =>
    node.kind === 'window' && node.binding.state === 'live'
      ? { ...node, binding: { ...node.binding, focused: node.binding.windowId === focusedWindowId } }
      : node
  );
}

function findFocusedMockWindow(nodes: readonly PersistentTreeNode[]): PersistentWindowNode | undefined {
  return findPersistentNode(
    nodes,
    (node): node is PersistentWindowNode =>
      node.kind === 'window' && node.binding.state === 'live' && node.binding.focused
  );
}

function findMockLiveTab(nodes: readonly PersistentTreeNode[], tabId: string): PersistentTabNode | undefined {
  return findPersistentNode(
    nodes,
    (node): node is PersistentTabNode =>
      node.kind === 'tab' && node.binding.state === 'live' && String(node.binding.tabId) === tabId
  );
}

function findMockLiveWindow(nodes: readonly PersistentTreeNode[], windowId: string): PersistentWindowNode | undefined {
  return findPersistentNode(
    nodes,
    (node): node is PersistentWindowNode =>
      node.kind === 'window' && node.binding.state === 'live' && String(node.binding.windowId) === windowId
  );
}

function findFirstLiveWindow(nodes: readonly PersistentTreeNode[]): PersistentWindowNode | undefined {
  return findPersistentNode(
    nodes,
    (node): node is PersistentWindowNode => node.kind === 'window' && node.binding.state === 'live'
  );
}

function findPersistentNode<TNode extends PersistentTreeNode>(
  nodes: readonly PersistentTreeNode[],
  predicate: (node: PersistentTreeNode) => node is TNode
): TNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) {
      return node;
    }
    const descendant = findPersistentNode(node.children, predicate);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

function mapPersistentNodes(
  nodes: readonly PersistentTreeNode[],
  update: (node: PersistentTreeNode) => PersistentTreeNode
): readonly PersistentTreeNode[] {
  return nodes.map((node) => update({ ...node, children: mapPersistentNodes(node.children, update) }));
}

function createMockOrganizer(
  kind: 'group' | 'note' | 'separator',
  title: string,
  separatorStyle: 0 | 1 | 2
): PersistentGroupNode | PersistentNoteNode | PersistentSeparatorNode {
  switch (kind) {
    case 'group':
      return { kind, id: createMockId(kind), title: title || 'Group', children: [] };
    case 'note':
      return { kind, id: createMockId(kind), text: title || 'Note', children: [] };
    case 'separator':
      return { kind, id: createMockId(kind), style: separatorStyle, children: [] };
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

function renameMockPersistentItem(
  nodes: readonly PersistentTreeNode[],
  item: PersistentItemReference,
  title: string
): readonly PersistentTreeNode[] {
  const nodeId =
    item.kind === 'saved'
      ? item.id
      : item.kind === 'live-window'
        ? findMockLiveWindow(nodes, item.windowId)?.id
        : findMockLiveTab(nodes, item.tabId)?.id;
  if (!nodeId) {
    throw new Error('The mock item selected for renaming no longer exists.');
  }
  return updatePersistentTreeNode(nodes, nodeId, (node) => renameMockNode(node, title));
}

function renameMockNode(node: PersistentTreeNode, title: string): PersistentTreeNode {
  if (node.kind === 'window') {
    return { ...node, title, customTitle: true };
  }
  if (node.kind === 'group' || node.kind === 'tab') {
    return { ...node, title };
  }
  if (node.kind === 'note') {
    return { ...node, text: title };
  }
  throw new Error('Only mock groups, windows, tabs, and notes can be renamed.');
}

function cycleMockSeparator(node: PersistentTreeNode): PersistentTreeNode {
  if (node.kind !== 'separator') {
    throw new Error('Only a mock separator can change style.');
  }
  return { ...node, style: node.style === 0 ? 1 : node.style === 1 ? 2 : 0 };
}

function replaceTreeRoots(
  tree: PersistentTreeDocument,
  roots: readonly PersistentTreeNode[]
): PersistentTreeDocument {
  return { ...tree, roots };
}

function countTabs(node: PersistentTreeNode | undefined): number {
  return node
    ? (node.kind === 'tab' ? 1 : 0) + node.children.reduce((total, child) => total + countTabs(child), 0)
    : 0;
}

function countLastWindowSessionTabs(node: PersistentTreeNode | undefined): number {
  if (!node || node.kind !== 'window' || node.binding.state === 'live') {
    return 0;
  }
  const sessionId = node.binding.sessionId;
  return countMatchingTabs(node.children);

  function countMatchingTabs(nodes: readonly PersistentTreeNode[]): number {
    return nodes.reduce(
      (total, candidate) =>
        total +
        (candidate.kind === 'tab' &&
        candidate.binding.state !== 'live' &&
        candidate.binding.sessionId === sessionId
          ? 1
          : 0) +
        countMatchingTabs(candidate.children),
      0
    );
  }
}

function collectPortableLinks(node: PortableExplorerNode): Extract<PortableExplorerNode, { kind: 'link' }>[] {
  return [...(node.kind === 'link' ? [node] : []), ...node.children.flatMap(collectPortableLinks)];
}

function createMockId(kind: string): string {
  return `mock-${kind}-${crypto.randomUUID()}`;
}

const SEPARATOR_TITLES = ['━━━━━━━━━━━━', '════════════', '┄┄┄┄┄┄┄┄┄┄┄┄'] as const;
