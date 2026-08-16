import { expect, test } from '@playwright/test';
import { reconcilePersistentLiveNodes, recoverMissingCheckpointNodes } from '../src/backends/chrome/liveCheckpoint';
import { createDocumentExplorerBackend } from '../src/backends/document/createDocumentExplorerBackend';
import {
  parseExplorerClipboardPayload,
  serializeClipboardHtml,
  serializeClipboardText
} from '../src/explorer/clipboard';
import { parseExplorerHtmlDocument, serializeExplorerHtml } from '../src/explorer/files';
import {
  createEmptyExplorerDocument,
  parseExplorerDocument,
  serializeExplorerDocument
} from '../src/explorer/portable';
import type { PortableExplorerNode } from '../src/explorer/portable';
import {
  appendPersistentCloudBackupRecord,
  createPersistentCloudBackupFile,
  parsePersistentCloudBackupFile,
  parsePersistentCloudBackupRecords,
  summarizePersistentCloudBackupRecords,
  type PersistentCloudBackupRecord
} from '../src/persistent-tree/cloudBackups';
import {
  createPersistentTreeDocument,
  flattenPersistentTabsHierarchy,
  movePersistentTreeNode,
  type PersistentTabNode,
  type PersistentTreeNode,
  type PersistentWindowNode
} from '../src/persistent-tree/model';
import { createPersistentNodesFromPortable } from '../src/persistent-tree/portable';
import {
  appendPersistentTreeSnapshot,
  createPersistentTreeSnapshot,
  parsePersistentTreeSnapshots,
  shouldCreateAutomaticSnapshot,
  type PersistentTreeSnapshot
} from '../src/persistent-tree/snapshots';

test('moves complete hierarchies into every semantic node kind and rejects cycles', () => {
  const tab = createSavedTab('tab', 'https://example.com/tab');
  const roots: readonly PersistentTreeNode[] = [
    { kind: 'group', id: 'group', title: 'Group', children: [tab] },
    { kind: 'note', id: 'note', text: 'Note', children: [] }
  ];

  const moved = movePersistentTreeNode(roots, 'group', 'note', 0);
  expect(moved[0]?.kind).toBe('note');
  expect(moved[0]?.children[0]?.id).toBe('group');
  expect(() => movePersistentTreeNode(moved, 'note', 'tab', 0)).toThrow('cannot be moved into itself');
});

test('flattens nested tabs without crossing organizer boundaries', () => {
  const roots: readonly PersistentTreeNode[] = [{
    kind: 'group',
    id: 'target',
    title: 'Target',
    children: [
      {
        ...createSavedTab('outer', 'https://example.com/outer'),
        children: [
          { kind: 'note', id: 'note', text: 'Attached note', children: [createSavedTab('inner', 'https://example.com/inner')] },
          { kind: 'separator', id: 'separator', style: 0, children: [] }
        ]
      },
      {
        kind: 'group',
        id: 'boundary',
        title: 'Boundary',
        children: [createSavedTab('bounded', 'https://example.com/bounded')]
      }
    ]
  }];

  const flattened = flattenPersistentTabsHierarchy(roots, 'target');
  const target = flattened[0];
  expect(target?.children.map((node) => node.id)).toEqual(['outer', 'inner', 'separator', 'boundary']);
  expect(target?.children[0]?.children.map((node) => node.id)).toEqual(['note']);
  expect(target?.children[3]?.children.map((node) => node.id)).toEqual(['bounded']);
});

test('round-trips notes and separators through portable v2 and persistent import', async () => {
  const document = createEmptyExplorerDocument('Semantic tree');
  document.sources.explore = [
    {
      kind: 'note',
      text: 'Selected context',
      defaultCollapsed: false,
      children: [
        {
          kind: 'separator',
          style: 2,
          defaultCollapsed: false,
          children: [
            {
              kind: 'link',
              title: 'Reference',
              url: 'https://example.com/reference',
              faviconUrl: null,
              description: 'Reference',
              children: [],
              defaultCollapsed: false,
              keepOnClose: true
            }
          ]
        }
      ]
    }
  ];

  const parsed = parseExplorerDocument(serializeExplorerDocument(document));
  expect(parsed).toEqual(document);
  expect(parsed.version).toBe(2);
  const editableDocument = createDocumentExplorerBackend(parsed);
  const documentTree = await editableDocument.backend.load('explore');
  const importedDocumentNode = documentTree.kind === 'group' ? documentTree.children[0] : undefined;
  expect(importedDocumentNode?.kind === 'link' ? importedDocumentNode.reference.kind : null).toBe('document-note');
  const importedSeparator = importedDocumentNode?.kind === 'link' ? importedDocumentNode.children[0] : undefined;
  const protectedDocumentLink = importedSeparator?.kind === 'link' || importedSeparator?.kind === 'group'
    ? importedSeparator.children[0]
    : undefined;
  expect(protectedDocumentLink?.kind === 'link' ? protectedDocumentLink.keepOnClose : undefined).toBe(true);
  expect(editableDocument.readDocument()).toEqual(parsed);

  let nextId = 0;
  const persistent = createPersistentNodesFromPortable(parsed.sources.explore, {
    savedAt: 123,
    sessionId: 'portable-test-session',
    originalWindowId: 7,
    createId: (kind) => `${kind}-${nextId++}`
  });
  expect(persistent[0]?.kind).toBe('note');
  expect(persistent[0]?.children[0]?.kind).toBe('separator');
  expect(persistent[0]?.children[0]?.children[0]?.kind).toBe('tab');
  const protectedPersistentTab = persistent[0]?.children[0]?.children[0];
  expect(protectedPersistentTab?.kind === 'tab' ? protectedPersistentTab.keepOnClose : undefined).toBe(true);
});

test('serializes complete clipboard hierarchies for Browser Atlas and external applications', () => {
  const hierarchy = {
    kind: 'group',
    groupKind: 'group',
    title: 'Research & review',
    defaultCollapsed: false,
    children: [
      {
        kind: 'note',
        text: 'Read <carefully>',
        defaultCollapsed: false,
        children: [
          {
            kind: 'link',
            title: 'Reference',
            url: 'https://example.com/?one=1&two=2',
            faviconUrl: null,
            description: 'Reference',
            children: [],
            defaultCollapsed: false
          }
        ]
      }
    ]
  } satisfies PortableExplorerNode;
  const payload = JSON.stringify({ format: 'browser-atlas-clipboard', version: 2, items: [hierarchy] });

  expect(parseExplorerClipboardPayload(payload)?.items).toEqual([hierarchy]);
  expect(parseExplorerClipboardPayload('{"format":"unrelated"}')).toBeNull();
  expect(serializeClipboardText([hierarchy])).toBe(
    'Research & review\n  Read <carefully>\n    Reference\thttps://example.com/?one=1&two=2'
  );
  expect(serializeClipboardHtml([hierarchy])).toContain('Research &amp; review');
  expect(serializeClipboardHtml([hierarchy])).toContain('Read &lt;carefully&gt;');
  expect(serializeClipboardHtml([hierarchy])).toContain('one=1&amp;two=2');
});

test('round-trips a structural Browser Atlas tree through standalone HTML', () => {
  const document = createEmptyExplorerDocument('Structural HTML');
  document.sources.explore = [{
    kind: 'group',
    groupKind: 'window',
    title: 'Research window',
    defaultCollapsed: false,
    children: [{
      kind: 'note',
      text: '</script><script>alert("not executable")</script>',
      defaultCollapsed: true,
      children: [{
        kind: 'separator',
        style: 2,
        defaultCollapsed: false,
        children: [{
          kind: 'link',
          title: 'Reference',
          url: 'https://example.com/reference',
          faviconUrl: 'https://example.com/favicon.ico',
          description: 'Retained link metadata',
          keepOnClose: true,
          defaultCollapsed: false,
          children: []
        }]
      }]
    }]
  }];

  const html = serializeExplorerHtml(
    document.title,
    [{ depth: 0, title: 'Research window', url: null, description: '' }],
    document
  );

  expect(html).toContain('id="browser-atlas-document"');
  expect(html).not.toContain('</script><script>alert');
  expect(parseExplorerHtmlDocument(html)).toEqual(document);
});

test('bounds and validates automatic local tree snapshots', () => {
  let snapshots: readonly PersistentTreeSnapshot[] = [];
  for (let index = 0; index < 35; index += 1) {
    const document = createPersistentTreeDocument([
      { kind: 'group', id: `snapshot-${index}`, title: `Snapshot ${index}`, children: [] }
    ]);
    snapshots = appendPersistentTreeSnapshot(
      snapshots,
      createPersistentTreeSnapshot(document, index * 300_000)
    );
  }

  expect(snapshots).toHaveLength(30);
  expect(snapshots[0]?.document.roots[0]?.id).toBe('snapshot-5');
  expect(snapshots.at(-1)?.document.roots[0]?.id).toBe('snapshot-34');
  expect(parsePersistentTreeSnapshots([null, { createdAt: 1 }, snapshots[0]])).toEqual([snapshots[0]]);
  expect(shouldCreateAutomaticSnapshot([], 0)).toBe(true);
  expect(shouldCreateAutomaticSnapshot(snapshots, 34 * 300_000 + 299_999)).toBe(false);
  expect(shouldCreateAutomaticSnapshot(snapshots, 35 * 300_000)).toBe(true);
});

test('validates, summarizes, and retains the newest 30 cloud backup files', () => {
  let records: readonly PersistentCloudBackupRecord[] = [];
  for (let index = 0; index < 35; index += 1) {
    const document = createPersistentTreeDocument([
      { kind: 'group', id: `cloud-${index}`, title: `Cloud ${index}`, children: [] }
    ]);
    records = appendPersistentCloudBackupRecord(records, {
      backupId: `backup-${index}`,
      file: createPersistentCloudBackupFile(document, 'workstation', index % 2 === 0 ? 'automatic' : 'manual', index)
    });
  }

  expect(records).toHaveLength(30);
  expect(records[0]?.backupId).toBe('backup-5');
  expect(records.at(-1)?.backupId).toBe('backup-34');
  expect(parsePersistentCloudBackupFile(records[0]?.file).document.roots[0]?.id).toBe('cloud-5');
  expect(() => parsePersistentCloudBackupFile({ format: 'not-a-backup' })).toThrow('not a valid Browser Atlas backup');
  expect(parsePersistentCloudBackupRecords([null, { backupId: 'bad' }, records[0]])).toEqual([records[0]]);
  expect(summarizePersistentCloudBackupRecords(records)[0]).toMatchObject({
    backupId: 'backup-34',
    machineLabel: 'workstation',
    mode: 'automatic',
    nodeCount: 1
  });
});

test('recovers only checkpoint tabs missing from both live and saved state', () => {
  const checkpointWindow = createLiveWindow('checkpoint', [
    createLiveTab('open', 'https://example.com/open', 1),
    createLiveTab('saved', 'https://example.com/saved', 2),
    createLiveTab('missing', 'https://example.com/missing', 3)
  ]);
  const currentWindow = createLiveWindow('current', [createLiveTab('still-open', 'https://example.com/open', 10)]);
  let nextId = 0;

  const recovered = recoverMissingCheckpointNodes(
    [checkpointWindow],
    [currentWindow],
    [createSavedTab('already-saved', 'https://example.com/saved')],
    123,
    (kind) => `${kind}-${nextId++}`
  );

  expect(recovered).toHaveLength(1);
  expect(recovered[0]?.binding.state).toBe('crashed');
  expect(recovered[0]?.children.map((node) => (node.kind === 'tab' ? node.url : null))).toEqual([
    'https://example.com/missing'
  ]);
});

test('rebinds annotated live shadows across browser IDs and crashes only missing context', () => {
  const attachedTab = {
    ...createLiveTab('attached', 'https://example.com/attached', 1),
    children: [{ kind: 'note', id: 'note', text: 'Context', children: [] }]
  } satisfies PersistentTabNode;
  const emptyTab = createLiveTab('empty', 'https://example.com/gone', 2);
  const storedWindow = createLiveWindow('stored-window', [attachedTab, emptyTab]);
  const currentTab = {
    ...createLiveTab('current-tab', 'https://example.com/attached', 20),
    binding: { state: 'live', tabId: 20, windowId: 10, index: 0 }
  } satisfies PersistentTabNode;
  const currentWindow = {
    ...createLiveWindow('current-window', [currentTab]),
    binding: { state: 'live', windowId: 10, focused: true }
  } satisfies PersistentWindowNode;

  const rebound = reconcilePersistentLiveNodes([storedWindow], [currentWindow], 456);
  const reboundWindow = rebound[0];
  expect(reboundWindow?.kind).toBe('window');
  if (reboundWindow?.kind !== 'window' || reboundWindow.binding.state !== 'live') {
    throw new Error('Expected the stored window to remain live.');
  }
  expect(reboundWindow.binding.windowId).toBe(10);
  expect(reboundWindow.children).toHaveLength(1);
  const reboundTab = reboundWindow.children[0];
  expect(reboundTab?.kind).toBe('tab');
  if (reboundTab?.kind !== 'tab' || reboundTab.binding.state !== 'live') {
    throw new Error('Expected the annotated tab to be rebound.');
  }
  expect(reboundTab.binding.tabId).toBe(20);
  expect(reboundTab.children[0]?.kind).toBe('note');

  const crashed = reconcilePersistentLiveNodes([storedWindow], [], 456);
  const crashedWindow = crashed[0];
  expect(crashedWindow?.kind === 'window' ? crashedWindow.binding.state : null).toBe('crashed');
  expect(crashedWindow?.children).toHaveLength(1);
  const crashedTab = crashedWindow?.children[0];
  expect(crashedTab?.kind === 'tab' ? crashedTab.binding.state : null).toBe('crashed');
});

function createLiveWindow(id: string, children: readonly PersistentTreeNode[]): PersistentWindowNode {
  return {
    kind: 'window',
    id,
    title: id,
    binding: { state: 'live', windowId: 1, focused: false },
    children
  };
}

function createLiveTab(id: string, url: string, tabId: number): PersistentTabNode {
  return {
    kind: 'tab',
    id,
    title: id,
    url,
    active: false,
    pinned: false,
    binding: { state: 'live', tabId, windowId: 1, index: tabId },
    children: []
  };
}

function createSavedTab(id: string, url: string): PersistentTabNode {
  return {
    kind: 'tab',
    id,
    title: id,
    url,
    active: false,
    pinned: false,
    binding: {
      state: 'saved',
      savedAt: 1,
      sessionId: `saved-tab-${id}`,
      originalWindowId: 1,
      originalIndex: 0
    },
    children: []
  };
}
