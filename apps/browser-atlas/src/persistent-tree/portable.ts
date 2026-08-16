import {
  EXPLORER_DOCUMENT_FORMAT,
  EXPLORER_DOCUMENT_VERSION,
  type ExplorerDocument,
  type PortableExplorerNode
} from '../explorer/portable';
import type { PersistentTreeDocument, PersistentTreeNode } from './model';

/** Inputs that bind backend-independent portable nodes to one persistent browser tree. */
export type PersistentPortableImportOptions = Readonly<{
  /** Timestamp assigned to every imported saved tab and window. */
  savedAt: number;
  /** Shared identity marking imported tabs as one restorable window session. */
  sessionId: string;
  /** Browser window hint used if an imported tab is restored later. */
  originalWindowId: number;
  /** Creates a durable ID scoped to the destination persistent tree. */
  createId: (kind: PersistentTreeNode['kind']) => string;
}>;

/** Materializes portable hierarchies as saved Persistent Tree nodes without flattening semantic kinds. */
export function createPersistentNodesFromPortable(
  nodes: readonly PortableExplorerNode[],
  options: PersistentPortableImportOptions
): PersistentTreeNode[] {
  let originalIndex = 0;
  return nodes.map(createNode);

  function createNode(node: PortableExplorerNode): PersistentTreeNode {
    const children = node.children.map(createNode);
    switch (node.kind) {
      case 'group':
        return node.groupKind === 'window'
          ? {
              kind: 'window',
              id: options.createId('window'),
              title: node.title,
              customTitle: true,
              binding: { state: 'saved', savedAt: options.savedAt, sessionId: options.sessionId },
              children
            }
          : { kind: 'group', id: options.createId('group'), title: node.title, children };
      case 'link': {
        const index = originalIndex;
        originalIndex += 1;
        return {
          kind: 'tab',
          id: options.createId('tab'),
          title: node.title,
          url: node.url,
          active: false,
          pinned: false,
          binding: {
            state: 'saved',
            savedAt: options.savedAt,
            sessionId: options.sessionId,
            originalWindowId: options.originalWindowId,
            originalIndex: index
          },
          children,
          ...(node.keepOnClose === true ? { keepOnClose: true } : {})
        };
      }
      case 'note':
        return { kind: 'note', id: options.createId('note'), text: node.text, children };
      case 'separator':
        return { kind: 'separator', id: options.createId('separator'), style: node.style, children };
      default: {
        const exhaustiveNode: never = node;
        return exhaustiveNode;
      }
    }
  }
}

/** Converts durable browser-tree nodes into a detached hierarchy for backup browsing and transfer. */
export function createPortableNodesFromPersistent(
  nodes: readonly PersistentTreeNode[]
): PortableExplorerNode[] {
  return nodes.map(createNode);

  function createNode(node: PersistentTreeNode): PortableExplorerNode {
    const children = node.children.map(createNode);
    switch (node.kind) {
      case 'window':
        return {
          kind: 'group',
          groupKind: 'window',
          title: node.title,
          children,
          defaultCollapsed: false
        };
      case 'group':
        return {
          kind: 'group',
          groupKind: 'group',
          title: node.title,
          children,
          defaultCollapsed: false
        };
      case 'tab':
        return {
          kind: 'link',
          title: node.title,
          url: node.url,
          faviconUrl: null,
          description: node.url,
          children,
          defaultCollapsed: false,
          ...(node.keepOnClose === true ? { keepOnClose: true } : {})
        };
      case 'note':
        return { kind: 'note', text: node.text, children, defaultCollapsed: false };
      case 'separator':
        return { kind: 'separator', style: node.style, children, defaultCollapsed: false };
      default: {
        const exhaustiveNode: never = node;
        return exhaustiveNode;
      }
    }
  }
}

/** Creates an editable Explore-only document from a point-in-time persistent browser tree. */
export function createExplorerDocumentFromPersistent(
  document: PersistentTreeDocument,
  title: string
): ExplorerDocument {
  return {
    format: EXPLORER_DOCUMENT_FORMAT,
    version: EXPLORER_DOCUMENT_VERSION,
    title,
    sources: {
      explore: createPortableNodesFromPersistent(document.roots),
      bookmarks: [],
      history: []
    }
  };
}
