import { expect, test } from '@playwright/test';
import {
  createAutomaticGoogleDriveBackupWhenDue,
  createGoogleDriveBackups,
  GOOGLE_DRIVE_CONFIGURATION_STORAGE_KEY
} from '../src/backends/chrome/googleDriveBackups';
import {
  LOCAL_TREE_SNAPSHOTS_STORAGE_KEY,
  SAVED_ITEMS_STORAGE_KEY
} from '../src/backends/chrome/savedItems';
import { createPersistentTreeDocument } from '../src/persistent-tree/model';
import {
  parsePersistentCloudBackupFile,
  type PersistentCloudBackupFile
} from '../src/persistent-tree/cloudBackups';
import { parsePersistentTreeSnapshots } from '../src/persistent-tree/snapshots';

test('uploads, lists, restores, and deletes private Google Drive tree backups', async () => {
  const storage = new Map<string, unknown>();
  storage.set(
    SAVED_ITEMS_STORAGE_KEY,
    createPersistentTreeDocument([
      { kind: 'group', id: 'saved-context', title: 'Saved context', children: [] }
    ])
  );
  const remoteFiles = new Map<string, MockDriveFile>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockGoogleDriveFetch(remoteFiles);
  const chromeApi = createMockGoogleDriveChrome(storage);
  const backups = createGoogleDriveBackups(chromeApi);

  try {
    await expect(backups.status()).resolves.toEqual({ status: 'connected', accountLabel: null });
    await expect(backups.lastAttempt()).resolves.toEqual({ status: 'none' });
    await backups.configure({ machineLabel: 'workstation', automaticBackups: false });
    await backups.create('manual');
    await expect(backups.lastAttempt()).resolves.toMatchObject({ status: 'success', mode: 'manual' });

    const listed = await backups.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ machineLabel: 'workstation', mode: 'manual', nodeCount: 3 });
    const uploaded = [...remoteFiles.values()][0];
    expect(uploaded?.content.document.roots.map((node) => node.id)).toEqual([
      'saved-context',
      'checkpoint-window-71'
    ]);
    const uploadedWindow = uploaded?.content.document.roots[1];
    expect(uploadedWindow?.kind === 'window' ? uploadedWindow.binding.state : null).toBe('saved');
    expect(uploadedWindow?.children[0]?.kind === 'tab' ? uploadedWindow.children[0].binding.state : null).toBe('saved');

    const backupId = listed[0]?.backupId;
    expect(backupId).toBeTruthy();
    const opened = await backups.read(backupId ?? 'missing');
    expect(opened.title).toContain('Google Drive backup');
    expect(opened.sources.explore).toMatchObject([
      { kind: 'group', groupKind: 'group', title: 'Saved context' },
      { kind: 'group', groupKind: 'window' }
    ]);
    expect(storage.get(SAVED_ITEMS_STORAGE_KEY)).toEqual(
      createPersistentTreeDocument([
        { kind: 'group', id: 'saved-context', title: 'Saved context', children: [] }
      ])
    );

    storage.set(
      SAVED_ITEMS_STORAGE_KEY,
      createPersistentTreeDocument([
        { kind: 'group', id: 'pre-restore', title: 'Pre-restore safety point', children: [] }
      ])
    );
    await backups.restore(backupId ?? 'missing');
    expect(storage.get(SAVED_ITEMS_STORAGE_KEY)).toEqual(uploaded?.content.document);
    const snapshots = parsePersistentTreeSnapshots(storage.get(LOCAL_TREE_SNAPSHOTS_STORAGE_KEY));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.document.roots[0]?.id).toBe('pre-restore');

    await backups.delete(backupId ?? 'missing');
    await expect(backups.list()).resolves.toEqual([]);
    expect(storage.get(GOOGLE_DRIVE_CONFIGURATION_STORAGE_KEY)).toEqual({
      machineLabel: 'workstation',
      automaticBackups: false
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('records a failed Google Drive upload attempt for the current browser session', async () => {
  const storage = new Map<string, unknown>();
  storage.set(SAVED_ITEMS_STORAGE_KEY, createPersistentTreeDocument());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('simulated failure', { status: 503 });
  const backups = createGoogleDriveBackups(createMockGoogleDriveChrome(storage));

  try {
    await expect(backups.create('manual')).rejects.toThrow(/503/u);
    await expect(backups.lastAttempt()).resolves.toMatchObject({
      status: 'failure',
      mode: 'manual',
      message: expect.stringMatching(/503/u)
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('creates Google Drive automatic backups only when the newest daily copy is due', async () => {
  const storage = new Map<string, unknown>();
  storage.set(SAVED_ITEMS_STORAGE_KEY, createPersistentTreeDocument());
  const remoteFiles = new Map<string, MockDriveFile>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockGoogleDriveFetch(remoteFiles);
  const chromeApi = createMockGoogleDriveChrome(storage);

  try {
    await createGoogleDriveBackups(chromeApi).configure({
      machineLabel: 'daily-machine',
      automaticBackups: true
    });
    expect(remoteFiles.size).toBe(1);
    await createAutomaticGoogleDriveBackupWhenDue(chromeApi);
    expect(remoteFiles.size).toBe(1);

    const [backupId, newest] = [...remoteFiles.entries()][0] ?? [];
    if (!backupId || !newest) {
      throw new Error('Expected the first automatic mock Drive file.');
    }
    const oldCreatedAt = Date.now() - 25 * 60 * 60 * 1_000;
    remoteFiles.set(backupId, {
      ...newest,
      createdTime: new Date(oldCreatedAt).toISOString(),
      appProperties: { ...newest.appProperties, createdAt: String(oldCreatedAt) }
    });
    await createAutomaticGoogleDriveBackupWhenDue(chromeApi);
    expect(remoteFiles.size).toBe(2);
    expect([...remoteFiles.values()].every((file) => file.appProperties.mode === 'automatic')).toBe(true);
    await expect(createGoogleDriveBackups(chromeApi).lastAttempt()).resolves.toMatchObject({
      status: 'success',
      mode: 'automatic'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

type MockDriveFile = Readonly<{
  id: string;
  createdTime: string;
  size: string;
  appProperties: Readonly<Record<string, string>>;
  content: PersistentCloudBackupFile;
}>;

function createMockGoogleDriveFetch(remoteFiles: Map<string, MockDriveFile>): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = init?.method ?? 'GET';
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { metadata, content } = parseMultipartUpload(init);
      const id = `remote-${remoteFiles.size + 1}`;
      const serialized = JSON.stringify(content);
      remoteFiles.set(id, {
        id,
        createdTime: new Date(Number(metadata.appProperties.createdAt)).toISOString(),
        size: String(new TextEncoder().encode(serialized).byteLength),
        appProperties: metadata.appProperties,
        content
      });
      return jsonResponse({ id });
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      return jsonResponse({
        files: [...remoteFiles.values()].map(({ content: _content, ...file }) => file)
      });
    }
    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/u.exec(url.pathname);
    const fileId = fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : null;
    if (fileId && method === 'GET' && url.searchParams.get('alt') === 'media') {
      const file = remoteFiles.get(fileId);
      return file ? jsonResponse(file.content) : jsonResponse({ error: { message: 'Not found' } }, 404);
    }
    if (fileId && method === 'DELETE') {
      remoteFiles.delete(fileId);
      return new Response(null, { status: 204 });
    }
    return jsonResponse({ error: { message: `Unexpected mock request: ${method} ${url}` } }, 500);
  };
}

type MultipartMetadata = Readonly<{ appProperties: Readonly<Record<string, string>> }>;

function parseMultipartUpload(init: RequestInit | undefined): {
  metadata: MultipartMetadata;
  content: MockDriveFile['content'];
} {
  const contentType = new Headers(init?.headers).get('Content-Type') ?? '';
  const boundary = /boundary=([^;]+)/u.exec(contentType)?.[1];
  if (!boundary || typeof init?.body !== 'string') {
    throw new Error('Expected a multipart Google Drive upload.');
  }
  const parts = init.body
    .split(`--${boundary}`)
    .map((part) => part.split('\r\n\r\n')[1]?.trim())
    .filter((part): part is string => Boolean(part) && part !== '--');
  const metadata: unknown = JSON.parse(parts[0] ?? 'null');
  const content: unknown = JSON.parse(parts[1] ?? 'null');
  if (!isRecord(metadata) || !isStringRecord(metadata.appProperties)) {
    throw new Error('Expected Browser Atlas backup metadata and content.');
  }
  return {
    metadata: { appProperties: metadata.appProperties },
    content: parsePersistentCloudBackupFile(content)
  };
}

function createMockGoogleDriveChrome(storage: Map<string, unknown>): typeof chrome {
  const storageLocal = {
    async get(keys: string | string[]): Promise<Record<string, unknown>> {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.map((key) => [key, storage.get(key)]));
    },
    async set(values: Record<string, unknown>): Promise<void> {
      for (const [key, value] of Object.entries(values)) {
        storage.set(key, value);
      }
    }
  };
  return {
    identity: {
      getAuthToken: async () => ({ token: 'mock-google-token' }),
      removeCachedAuthToken: async () => undefined,
      clearAllCachedAuthTokens: async () => undefined
    },
    runtime: {
      getManifest: () => ({
        oauth2: { client_id: '123-browser-atlas.apps.googleusercontent.com' }
      })
    },
    storage: { local: storageLocal, session: storageLocal },
    windows: {
      getAll: async () => [{
        id: 71,
        focused: true,
        type: 'normal',
        tabs: [{
          id: 81,
          windowId: 71,
          index: 0,
          active: true,
          highlighted: true,
          incognito: false,
          pinned: false,
          selected: true,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
          title: 'Live reference',
          url: 'https://example.com/live'
        }]
      }]
    }
  } as unknown as typeof chrome;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
