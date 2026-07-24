import type { ExplorerBackend, ExplorerCommand } from '../../explorer/backend';
import type { ExplorerSourceId, ExplorerTreeNode } from '../../explorer/model';
import type { ExplorerDocument, PortableExplorerNode } from '../../explorer/portable';
import {
  createEmptyExplorerDocument,
  EXPLORER_DOCUMENT_FORMAT,
  EXPLORER_DOCUMENT_VERSION
} from '../../explorer/portable';
import { createExplorerSourceRoot } from '../../explorer/treeFactories';

/** Creates an editable, in-memory backend that can be loaded from and saved to files. */
export function createDocumentExplorerBackend(initialDocument = createEmptyExplorerDocument()) {
  let documentTitle = initialDocument.title;
  let sources = hydrateSources(initialDocument.sources);
  let nextNodeId = countNodes(sources) + 1;
  const listeners = new Set<(source: ExplorerSourceId) => void>();

  const backend: ExplorerBackend = {
    capabilities: DOCUMENT_EXPLORER_CAPABILITIES,
    async load(source) {
      return createDocumentTree(source, documentTitle, sources[source]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async execute(command) {
      executeDocumentCommand(command);
    }
  };

  return {
    backend,
    /** Replaces all editable collections with a validated portable document. */
    replaceDocument(document: ExplorerDocument): void {
      documentTitle = document.title;
      sources = hydrateSources(document.sources);
      nextNodeId = countNodes(sources) + 1;
      notifySources(EXPLORER_SOURCE_IDS);
    },
    /** Returns a detached portable snapshot suitable for saving or transfer. */
    readDocument(): ExplorerDocument {
      return {
        format: EXPLORER_DOCUMENT_FORMAT,
        version: EXPLORER_DOCUMENT_VERSION,
        title: documentTitle,
        sources: {
          explore: sources.explore.map(dehydrateNode),
          bookmarks: sources.bookmarks.map(dehydrateNode),
          history: sources.history.map(dehydrateNode)
        }
      };
    },
    /** Current document title. */
    title(): string {
      return documentTitle;
    }
  } as const;

  function executeDocumentCommand(command: ExplorerCommand): void {
    switch (command.kind) {
      case 'import-items':
        importItems(command);
        return;
      case 'move-document-node':
        moveNode(command);
        return;
      case 'move-tab':
      case 'open-tab':
      case 'move-bookmark':
      case 'create-bookmark':
        throw new Error(`A JSON document cannot execute ${command.kind}.`);
      default: {
        const exhaustiveCommand: never = command;
        throw new Error(`Unsupported document command: ${String(exhaustiveCommand)}`);
      }
    }
  }

  function importItems(command: Extract<ExplorerCommand, { kind: 'import-items' }>): void {
    if (command.target.kind !== 'document') {
      throw new Error('A JSON document requires a document drop target.');
    }
    const children = findChildren(command.target.source, command.target.parentId);
    const index = clampIndex(command.index, children.length);
    children.splice(index, 0, ...command.items.map(hydrateNode));
    notifySources([command.target.source]);
  }

  function moveNode(command: Extract<ExplorerCommand, { kind: 'move-document-node' }>): void {
    const sourceChildren = findChildren(command.source.source, command.source.parentId);
    const sourceIndex = sourceChildren.findIndex((node) => node.id === command.source.nodeId);
    const node = sourceChildren[sourceIndex];
    if (!node) {
      throw new Error('The JSON document source node no longer exists.');
    }
    if (command.target.parentId !== null && containsNode(node, command.target.parentId)) {
      throw new Error('A group cannot be moved into one of its descendants.');
    }

    sourceChildren.splice(sourceIndex, 1);
    const targetChildren = findChildren(command.target.source, command.target.parentId);
    const targetIndex =
      sourceChildren === targetChildren && sourceIndex < command.target.index
        ? command.target.index - 1
        : command.target.index;
    targetChildren.splice(clampIndex(targetIndex, targetChildren.length), 0, node);
    notifySources(
      command.source.source === command.target.source
        ? [command.source.source]
        : [command.source.source, command.target.source]
    );
  }

  function hydrateNode(node: PortableExplorerNode): DocumentNode {
    const id = `document-node-${nextNodeId}`;
    nextNodeId += 1;
    const children = node.children.map(hydrateNode);
    return node.kind === 'group'
      ? {
          id,
          kind: 'group',
          groupKind: node.groupKind,
          title: node.title,
          children,
          defaultCollapsed: node.defaultCollapsed
        }
      : {
          id,
          kind: 'link',
          title: node.title,
          url: node.url,
          faviconUrl: node.faviconUrl,
          description: node.description,
          children,
          defaultCollapsed: node.defaultCollapsed
        };
  }

  function findChildren(source: ExplorerSourceId, parentId: string | null): DocumentNode[] {
    if (parentId === null) {
      return sources[source];
    }
    const parent = findNode(sources[source], parentId);
    if (!parent) {
      throw new Error('The JSON document destination no longer exists.');
    }
    return parent.children;
  }

  function notifySources(changedSources: readonly ExplorerSourceId[]): void {
    for (const source of changedSources) {
      for (const listener of listeners) {
        listener(source);
      }
    }
  }
}

/** Editable document backend and file lifecycle methods. */
export type DocumentExplorerBackend = ReturnType<typeof createDocumentExplorerBackend>;

type DocumentNode = DocumentGroupNode | DocumentLinkNode;

type DocumentGroupNode = {
  id: string;
  kind: 'group';
  groupKind: 'window' | 'folder' | 'date';
  title: string;
  children: DocumentNode[];
  defaultCollapsed: boolean;
};

type DocumentLinkNode = {
  id: string;
  kind: 'link';
  title: string;
  url: string;
  faviconUrl: string | null;
  description: string;
  children: DocumentNode[];
  defaultCollapsed: boolean;
};

function createDocumentTree(
  source: ExplorerSourceId,
  documentTitle: string,
  nodes: readonly DocumentNode[]
): ExplorerTreeNode {
  const sourceTitle = source === 'explore' ? 'Tabs' : source === 'bookmarks' ? 'Bookmarks' : 'History';
  return createExplorerSourceRoot(
    source,
    `${documentTitle} · ${sourceTitle}`,
    nodes.map((node, index) => createDocumentNode(source, node, null, index)),
    true
  );
}

function createDocumentNode(
  source: ExplorerSourceId,
  node: DocumentNode,
  parentId: string | null,
  index: number
): ExplorerTreeNode {
  const children = node.children.map((child, childIndex) => createDocumentNode(source, child, node.id, childIndex));
  if (node.kind === 'group') {
    return {
      id: `${source}-${node.id}`,
      kind: 'group',
      groupKind: node.groupKind,
      source,
      reference: { kind: 'document-group', id: node.id, parentId },
      index,
      draggable: true,
      acceptsDrop: true,
      title: node.title,
      children,
      defaultCollapsed: node.defaultCollapsed
    };
  }
  return {
    id: `${source}-${node.id}`,
    kind: 'link',
    source,
    reference: { kind: 'document-link', id: node.id, parentId },
    index,
    draggable: true,
    title: node.title,
    url: node.url,
    faviconUrl: node.faviconUrl,
    description: node.description,
    children,
    defaultCollapsed: node.defaultCollapsed
  };
}

function hydrateSources(sources: ExplorerDocument['sources']): Record<ExplorerSourceId, DocumentNode[]> {
  let nextNodeId = 1;
  const hydrate = (node: PortableExplorerNode): DocumentNode => {
    const id = `document-node-${nextNodeId}`;
    nextNodeId += 1;
    const children = node.children.map(hydrate);
    return node.kind === 'group'
      ? { id, kind: 'group', groupKind: node.groupKind, title: node.title, children, defaultCollapsed: node.defaultCollapsed }
      : {
          id,
          kind: 'link',
          title: node.title,
          url: node.url,
          faviconUrl: node.faviconUrl,
          description: node.description,
          children,
          defaultCollapsed: node.defaultCollapsed
        };
  };
  return {
    explore: sources.explore.map(hydrate),
    bookmarks: sources.bookmarks.map(hydrate),
    history: sources.history.map(hydrate)
  };
}

function dehydrateNode(node: DocumentNode): PortableExplorerNode {
  const children = node.children.map(dehydrateNode);
  return node.kind === 'group'
    ? {
        kind: 'group',
        groupKind: node.groupKind,
        title: node.title,
        children,
        defaultCollapsed: node.defaultCollapsed
      }
    : {
        kind: 'link',
        title: node.title,
        url: node.url,
        faviconUrl: node.faviconUrl,
        description: node.description,
        children,
        defaultCollapsed: node.defaultCollapsed
      };
}

function findNode(nodes: readonly DocumentNode[], id: string): DocumentNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const descendant = findNode(node.children, id);
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

function containsNode(node: DocumentNode, id: string): boolean {
  return node.id === id || node.children.some((child) => containsNode(child, id));
}

function countNodes(sources: Record<ExplorerSourceId, readonly DocumentNode[]>): number {
  return EXPLORER_SOURCE_IDS.reduce(
    (total, source) => total + sources[source].reduce((count, node) => count + countNode(node), 0),
    0
  );
}

function countNode(node: DocumentNode): number {
  return 1 + node.children.reduce((total, child) => total + countNode(child), 0);
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

const EXPLORER_SOURCE_IDS = ['explore', 'bookmarks', 'history'] as const satisfies readonly ExplorerSourceId[];

const DOCUMENT_EXPLORER_CAPABILITIES = {
  sources: { explore: true, bookmarks: true, history: true },
  commands: {
    'move-tab': false,
    'open-tab': false,
    'move-bookmark': false,
    'create-bookmark': false,
    'import-items': true,
    'move-document-node': true
  }
} as const satisfies ExplorerBackend['capabilities'];
