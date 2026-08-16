import type {
  ExplorerCloudBackupAttempt,
  ExplorerCloudBackupConfiguration,
  ExplorerCloudBackups,
  ExplorerCloudBackupSummary
} from '../../explorer/backend';
import {
  createPersistentTreeDocument,
  type PersistentTreeDocument,
  type PersistentTreeNode,
  type PersistentWindowNode
} from '../../persistent-tree/model';
import {
  createPersistentCloudBackupFile,
  parsePersistentCloudBackupFile,
  summarizePersistentCloudBackup,
  type PersistentCloudBackupFile
} from '../../persistent-tree/cloudBackups';
import {
  appendPersistentTreeSnapshot,
  createPersistentTreeSnapshot,
  parsePersistentTreeSnapshots
} from '../../persistent-tree/snapshots';
import { createExplorerDocumentFromPersistent } from '../../persistent-tree/portable';
import { captureLiveTree, reconcilePersistentLiveNodes } from './liveCheckpoint';
import {
  LOCAL_TREE_SNAPSHOTS_STORAGE_KEY,
  loadSavedItems,
  SAVED_ITEMS_STORAGE_KEY
} from './savedItems';

/** Creates the real extension provider backed by Google Drive's private app-data folder. */
export function createGoogleDriveBackups(chromeApi: typeof chrome): ExplorerCloudBackups {
  return {
    providerName: 'Google Drive',
    status: async () => {
      const unavailableReason = googleDriveUnavailableReason(chromeApi);
      if (unavailableReason) {
        return { status: 'unavailable', reason: unavailableReason };
      }
      try {
        return (await requestAccessToken(chromeApi, false))
          ? { status: 'connected', accountLabel: null }
          : { status: 'disconnected' };
      } catch {
        return { status: 'disconnected' };
      }
    },
    connect: async () => {
      requireGoogleDriveConfiguration(chromeApi);
      await requireAccessToken(chromeApi, true);
    },
    disconnect: async () => {
      requireGoogleDriveConfiguration(chromeApi);
      await chromeApi.identity.clearAllCachedAuthTokens();
    },
    configuration: () => readGoogleDriveBackupConfiguration(chromeApi),
    lastAttempt: () => readGoogleDriveBackupAttempt(chromeApi),
    configure: async (configuration) => {
      await writeGoogleDriveBackupConfiguration(chromeApi, configuration);
      if (configuration.automaticBackups) {
        await createAutomaticGoogleDriveBackupWhenDue(chromeApi);
      }
    },
    list: () => listGoogleDriveBackups(chromeApi),
    create: async (mode) => {
      try {
        requireGoogleDriveConfiguration(chromeApi);
        const document = await createCompleteCloudTree(chromeApi);
        const configuration = await readGoogleDriveBackupConfiguration(chromeApi);
        const file = createPersistentCloudBackupFile(document, configuration.machineLabel, mode);
        await uploadGoogleDriveBackup(chromeApi, file);
        await enforceGoogleDriveRetention(chromeApi);
        await writeGoogleDriveBackupAttempt(chromeApi, { status: 'success', attemptedAt: Date.now(), mode });
      } catch (reason: unknown) {
        await writeGoogleDriveBackupAttempt(chromeApi, {
          status: 'failure',
          attemptedAt: Date.now(),
          mode,
          message: reason instanceof Error ? reason.message : 'The Google Drive backup failed.'
        });
        throw reason;
      }
    },
    read: async (backupId) => {
      const backup = await downloadGoogleDriveBackup(chromeApi, backupId);
      return createExplorerDocumentFromPersistent(
        backup.document,
        `Google Drive backup · ${new Date(backup.createdAt).toLocaleString()}`
      );
    },
    restore: (backupId) => restoreGoogleDriveBackup(chromeApi, backupId),
    delete: (backupId) => deleteGoogleDriveBackup(chromeApi, backupId)
  };
}

/** Runs a due daily backup without showing account UI; safe for the MV3 background worker. */
export async function createAutomaticGoogleDriveBackupWhenDue(chromeApi: typeof chrome): Promise<void> {
  if (googleDriveUnavailableReason(chromeApi)) {
    return;
  }
  const configuration = await readGoogleDriveBackupConfiguration(chromeApi);
  if (!configuration.automaticBackups) {
    return;
  }
  try {
    if (!(await requestAccessToken(chromeApi, false))) {
      return;
    }
    const backups = await listGoogleDriveBackups(chromeApi);
    const newestAutomatic = backups.find((backup) => backup.mode === 'automatic');
    if (!newestAutomatic || Date.now() - newestAutomatic.createdAt >= AUTOMATIC_BACKUP_INTERVAL_MS) {
      await createGoogleDriveBackups(chromeApi).create('automatic');
    }
  } catch (reason: unknown) {
    console.error('Browser Atlas could not create its automatic Google Drive backup.', reason);
  }
}

async function listGoogleDriveBackups(chromeApi: typeof chrome): Promise<readonly ExplorerCloudBackupSummary[]> {
  requireGoogleDriveConfiguration(chromeApi);
  const files = await listGoogleDriveFiles(chromeApi);
  return files.flatMap((file): readonly ExplorerCloudBackupSummary[] => {
    const summary = summarizeDriveFile(file);
    return summary ? [summary] : [];
  });
}

async function uploadGoogleDriveBackup(
  chromeApi: typeof chrome,
  file: PersistentCloudBackupFile
): Promise<void> {
  const summary = summarizePersistentCloudBackup('pending', file);
  const boundary = `browser-atlas-${crypto.randomUUID()}`;
  const metadata = {
    name: GOOGLE_DRIVE_BACKUP_FILENAME,
    mimeType: 'application/json',
    parents: ['appDataFolder'],
    appProperties: {
      format: file.format,
      version: String(file.version),
      createdAt: String(file.createdAt),
      machineLabel: truncateUtf8(file.machineLabel, MAX_APP_PROPERTY_BYTES),
      mode: file.mode,
      nodeCount: String(summary.nodeCount)
    }
  };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(file),
    `--${boundary}--`,
    ''
  ].join('\r\n');
  await googleDriveFetch(chromeApi, `${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
}

async function restoreGoogleDriveBackup(chromeApi: typeof chrome, backupId: string): Promise<void> {
  requireGoogleDriveConfiguration(chromeApi);
  const backup = await downloadGoogleDriveBackup(chromeApi, backupId);
  const [currentRoots, storage] = await Promise.all([
    loadSavedItems(chromeApi),
    chromeApi.storage.local.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY)
  ]);
  const snapshots = parsePersistentTreeSnapshots(storage[LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]);
  await chromeApi.storage.local.set({
    [SAVED_ITEMS_STORAGE_KEY]: backup.document,
    [LOCAL_TREE_SNAPSHOTS_STORAGE_KEY]: appendPersistentTreeSnapshot(
      snapshots,
      createPersistentTreeSnapshot(createPersistentTreeDocument(currentRoots))
    )
  });
}

async function downloadGoogleDriveBackup(
  chromeApi: typeof chrome,
  backupId: string
): Promise<PersistentCloudBackupFile> {
  requireGoogleDriveConfiguration(chromeApi);
  const response = await googleDriveFetch(
    chromeApi,
    `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(backupId)}?alt=media`
  );
  const value: unknown = await response.json();
  return parsePersistentCloudBackupFile(value);
}

async function deleteGoogleDriveBackup(chromeApi: typeof chrome, backupId: string): Promise<void> {
  requireGoogleDriveConfiguration(chromeApi);
  await googleDriveFetch(chromeApi, `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(backupId)}`, {
    method: 'DELETE'
  });
}

async function enforceGoogleDriveRetention(chromeApi: typeof chrome): Promise<void> {
  const files = await listGoogleDriveFiles(chromeApi);
  await Promise.all(
    files.slice(MAX_GOOGLE_DRIVE_BACKUPS).map((file) => deleteGoogleDriveBackup(chromeApi, file.id))
  );
}

type GoogleDriveFile = Readonly<{
  id: string;
  createdTime: string;
  size: string;
  appProperties: Readonly<Record<string, string>>;
}>;

async function listGoogleDriveFiles(chromeApi: typeof chrome): Promise<readonly GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${GOOGLE_DRIVE_BACKUP_FILENAME}' and trashed = false`,
      fields: 'nextPageToken,files(id,createdTime,size,appProperties)',
      orderBy: 'createdTime desc',
      pageSize: '100'
    });
    if (pageToken) {
      query.set('pageToken', pageToken);
    }
    const response = await googleDriveFetch(chromeApi, `${GOOGLE_DRIVE_API}/files?${query}`);
    const value: unknown = await response.json();
    const page = parseGoogleDriveFilePage(value);
    files.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files.sort((left, right) => driveFileCreatedAt(right) - driveFileCreatedAt(left));
}

type GoogleDriveFilePage = Readonly<{ files: readonly GoogleDriveFile[]; nextPageToken?: string }>;

function parseGoogleDriveFilePage(value: unknown): GoogleDriveFilePage {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new Error('Google Drive returned an invalid Browser Atlas backup list.');
  }
  const files = value.files.flatMap((candidate): readonly GoogleDriveFile[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      typeof candidate.createdTime !== 'string' ||
      typeof candidate.size !== 'string'
    ) {
      return [];
    }
    return [{
      id: candidate.id,
      createdTime: candidate.createdTime,
      size: candidate.size,
      appProperties: parseStringRecord(candidate.appProperties)
    }];
  });
  return {
    files,
    ...(typeof value.nextPageToken === 'string' ? { nextPageToken: value.nextPageToken } : {})
  };
}

function summarizeDriveFile(file: GoogleDriveFile): ExplorerCloudBackupSummary | null {
  const { appProperties } = file;
  if (
    appProperties.format !== 'browser-atlas-cloud-backup' ||
    appProperties.version !== '1' ||
    (appProperties.mode !== 'manual' && appProperties.mode !== 'automatic')
  ) {
    return null;
  }
  const createdAt = readFiniteNumber(appProperties.createdAt) ?? Date.parse(file.createdTime);
  const nodeCount = readFiniteNumber(appProperties.nodeCount);
  const sizeBytes = readFiniteNumber(file.size);
  if (!Number.isFinite(createdAt) || nodeCount === null || sizeBytes === null) {
    return null;
  }
  return {
    backupId: file.id,
    createdAt,
    nodeCount,
    sizeBytes,
    machineLabel: appProperties.machineLabel ?? '',
    mode: appProperties.mode
  };
}

async function googleDriveFetch(
  chromeApi: typeof chrome,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let token = await requireAccessToken(chromeApi, false);
  let response = await fetchWithGoogleToken(url, init, token);
  if (response.status === 401) {
    await chromeApi.identity.removeCachedAuthToken({ token });
    token = await requireAccessToken(chromeApi, false);
    response = await fetchWithGoogleToken(url, init, token);
  }
  if (!response.ok) {
    throw new Error(await googleDriveResponseError(response));
  }
  return response;
}

function fetchWithGoogleToken(url: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function googleDriveResponseError(response: Response): Promise<string> {
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string') {
      return `Google Drive: ${value.error.message}`;
    }
  } catch {
    // Fall through to the HTTP status when Drive did not return its JSON error envelope.
  }
  return `Google Drive request failed (${response.status} ${response.statusText}).`;
}

async function requestAccessToken(chromeApi: typeof chrome, interactive: boolean): Promise<string | null> {
  const result = await chromeApi.identity.getAuthToken({ interactive });
  return result.token?.trim() || null;
}

async function requireAccessToken(chromeApi: typeof chrome, interactive: boolean): Promise<string> {
  const token = await requestAccessToken(chromeApi, interactive);
  if (!token) {
    throw new Error('Google Drive authorization did not return an access token.');
  }
  return token;
}

function googleDriveUnavailableReason(chromeApi: typeof chrome): string | null {
  if (typeof chromeApi.identity?.getAuthToken !== 'function') {
    return 'This browser build does not expose the extension identity API.';
  }
  const manifest: unknown = chromeApi.runtime.getManifest();
  if (!isRecord(manifest) || !isRecord(manifest.oauth2) || typeof manifest.oauth2.client_id !== 'string') {
    return 'This Browser Atlas build has no Google OAuth client ID. Configure BROWSER_ATLAS_GOOGLE_OAUTH_CLIENT_ID and rebuild the extension.';
  }
  return manifest.oauth2.client_id.trim() ? null : 'This Browser Atlas build has an empty Google OAuth client ID.';
}

function requireGoogleDriveConfiguration(chromeApi: typeof chrome): void {
  const reason = googleDriveUnavailableReason(chromeApi);
  if (reason) {
    throw new Error(reason);
  }
}

/** Reads the machine label and automatic-copy preference used by the page and background worker. */
export async function readGoogleDriveBackupConfiguration(
  chromeApi: typeof chrome
): Promise<ExplorerCloudBackupConfiguration> {
  const storage = await chromeApi.storage.local.get(GOOGLE_DRIVE_CONFIGURATION_STORAGE_KEY);
  const value: unknown = storage[GOOGLE_DRIVE_CONFIGURATION_STORAGE_KEY];
  if (!isRecord(value)) {
    return DEFAULT_GOOGLE_DRIVE_CONFIGURATION;
  }
  return {
    machineLabel: typeof value.machineLabel === 'string' ? value.machineLabel : '',
    automaticBackups: value.automaticBackups === true
  };
}

/** Reads the upload result retained for the lifetime of the current Chromium session. */
export async function readGoogleDriveBackupAttempt(
  chromeApi: typeof chrome
): Promise<ExplorerCloudBackupAttempt> {
  if (!chromeApi.storage.session) {
    return { status: 'none' };
  }
  try {
    const storage = await chromeApi.storage.session.get(GOOGLE_DRIVE_ATTEMPT_STORAGE_KEY);
    return parseGoogleDriveBackupAttempt(storage[GOOGLE_DRIVE_ATTEMPT_STORAGE_KEY]);
  } catch {
    return { status: 'none' };
  }
}

function parseGoogleDriveBackupAttempt(value: unknown): ExplorerCloudBackupAttempt {
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
}

async function writeGoogleDriveBackupAttempt(
  chromeApi: typeof chrome,
  attempt: ExplorerCloudBackupAttempt
): Promise<void> {
  try {
    await chromeApi.storage.session?.set({ [GOOGLE_DRIVE_ATTEMPT_STORAGE_KEY]: attempt });
  } catch {
    // A successful remote backup must not be reported as failed only because its status strip could not persist.
  }
}

async function writeGoogleDriveBackupConfiguration(
  chromeApi: typeof chrome,
  configuration: ExplorerCloudBackupConfiguration
): Promise<void> {
  await chromeApi.storage.local.set({
    [GOOGLE_DRIVE_CONFIGURATION_STORAGE_KEY]: {
      machineLabel: configuration.machineLabel.trim(),
      automaticBackups: configuration.automaticBackups
    } satisfies ExplorerCloudBackupConfiguration
  });
}

async function createCompleteCloudTree(chromeApi: typeof chrome): Promise<PersistentTreeDocument> {
  const capturedAt = Date.now();
  const [storedRoots, liveDocument] = await Promise.all([
    loadSavedItems(chromeApi),
    captureLiveTree(chromeApi)
  ]);
  const reconciledRoots = reconcilePersistentLiveNodes(storedRoots, liveDocument.roots, capturedAt);
  const representedTabIds = collectLiveTabIds(reconciledRoots);
  const representedWindowIds = collectLiveWindowIds(reconciledRoots);
  const mergedRoots = appendMissingLiveTabs(reconciledRoots, liveDocument.roots, representedTabIds);
  const completeRoots = [
    ...mergedRoots,
    ...liveDocument.roots
      .filter((node) =>
        node.kind === 'window' &&
        node.binding.state === 'live' &&
        !representedWindowIds.has(node.binding.windowId)
      )
      .map((node) => ({
        ...node,
        children: node.children.filter(
          (child) =>
            child.kind !== 'tab' ||
            child.binding.state !== 'live' ||
            !representedTabIds.has(child.binding.tabId)
        )
      }))
  ];
  return createPersistentTreeDocument(retainCloudSnapshot(completeRoots, capturedAt));
}

function appendMissingLiveTabs(
  nodes: readonly PersistentTreeNode[],
  liveWindows: readonly PersistentTreeNode[],
  representedTabIds: ReadonlySet<number>
): readonly PersistentTreeNode[] {
  return nodes.map((node) => {
    const children = appendMissingLiveTabs(node.children, liveWindows, representedTabIds);
    if (node.kind !== 'window' || node.binding.state !== 'live') {
      return { ...node, children };
    }
    const windowId = node.binding.windowId;
    const liveWindow = liveWindows.find(
      (candidate): candidate is PersistentWindowNode =>
        candidate.kind === 'window' &&
        candidate.binding.state === 'live' &&
        candidate.binding.windowId === windowId
    );
    if (!liveWindow) {
      return { ...node, children };
    }
    const missingTabs = liveWindow.children.filter(
      (child) =>
        child.kind === 'tab' &&
        child.binding.state === 'live' &&
        !representedTabIds.has(child.binding.tabId)
    );
    return { ...node, title: liveWindow.title, binding: liveWindow.binding, children: [...children, ...missingTabs] };
  });
}

function retainCloudSnapshot(
  nodes: readonly PersistentTreeNode[],
  savedAt: number
): readonly PersistentTreeNode[] {
  const sessionByWindowId = new Map<number, string>();
  collectCloudSessions(nodes);
  return nodes.map(retainNode);

  function collectCloudSessions(candidates: readonly PersistentTreeNode[]): void {
    for (const candidate of candidates) {
      if (candidate.kind === 'window' && candidate.binding.state === 'live') {
        sessionByWindowId.set(candidate.binding.windowId, `cloud-${candidate.id}-${savedAt}`);
      }
      collectCloudSessions(candidate.children);
    }
  }

  function retainNode(node: PersistentTreeNode): PersistentTreeNode {
    const children = node.children.map(retainNode);
    if (node.kind === 'window' && node.binding.state === 'live') {
      return {
        ...node,
        binding: {
          state: 'saved',
          savedAt,
          sessionId: sessionByWindowId.get(node.binding.windowId) ?? `cloud-${node.id}-${savedAt}`
        },
        children
      };
    }
    if (node.kind === 'tab' && node.binding.state === 'live') {
      return {
        ...node,
        active: false,
        binding: {
          state: 'saved',
          savedAt,
          sessionId: sessionByWindowId.get(node.binding.windowId) ?? `cloud-${node.id}-${savedAt}`,
          originalWindowId: node.binding.windowId,
          originalIndex: node.binding.index
        },
        children
      };
    }
    return { ...node, children };
  }
}

function collectLiveTabIds(nodes: readonly PersistentTreeNode[]): ReadonlySet<number> {
  const ids = new Set<number>();
  visitPersistentNodes(nodes, (node) => {
    if (node.kind === 'tab' && node.binding.state === 'live') {
      ids.add(node.binding.tabId);
    }
  });
  return ids;
}

function collectLiveWindowIds(nodes: readonly PersistentTreeNode[]): ReadonlySet<number> {
  const ids = new Set<number>();
  visitPersistentNodes(nodes, (node) => {
    if (node.kind === 'window' && node.binding.state === 'live') {
      ids.add(node.binding.windowId);
    }
  });
  return ids;
}

function visitPersistentNodes(
  nodes: readonly PersistentTreeNode[],
  visit: (node: PersistentTreeNode) => void
): void {
  for (const node of nodes) {
    visit(node);
    visitPersistentNodes(node.children, visit);
  }
}

function driveFileCreatedAt(file: GoogleDriveFile): number {
  return readFiniteNumber(file.appProperties.createdAt) ?? Date.parse(file.createdTime);
}

function readFiniteNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = value;
  while (result && encoder.encode(result).byteLength > maxBytes) {
    result = result.slice(0, -1);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const DEFAULT_GOOGLE_DRIVE_CONFIGURATION = {
  machineLabel: '',
  automaticBackups: false
} as const satisfies ExplorerCloudBackupConfiguration;

export const GOOGLE_DRIVE_CONFIGURATION_STORAGE_KEY = 'browserAtlas.googleDriveBackups.v1';
export const GOOGLE_DRIVE_BACKUP_ALARM = 'browserAtlas.googleDriveBackup';

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_DRIVE_BACKUP_FILENAME = 'browser-atlas-backup.json';
const MAX_GOOGLE_DRIVE_BACKUPS = 30;
const MAX_APP_PROPERTY_BYTES = 100;
const AUTOMATIC_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const GOOGLE_DRIVE_ATTEMPT_STORAGE_KEY = 'browserAtlas.googleDriveBackupAttempt.v1';
