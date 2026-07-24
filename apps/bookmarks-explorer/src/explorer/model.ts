/** Identifies one collection displayed by an explorer pane. */
export type ExplorerSourceId = 'explore' | 'bookmarks' | 'history';

/** Describes a branch in the platform-neutral explorer tree. */
export type ExplorerTreeGroupNode = {
  /** Stable identifier scoped to the explorer backend. */
  id: string;
  /** Distinguishes branches from links and status messages. */
  kind: 'group';
  /** Controls the explorer-specific icon and label treatment. */
  groupKind: 'source' | 'window' | 'folder' | 'date';
  /** Collection that owns the branch. */
  source: ExplorerSourceId;
  /** Opaque backend reference used by explorer operations. */
  reference: ExplorerGroupReference;
  /** Position within the containing backend collection. */
  index: number;
  /** Whether this branch may initiate a drag operation. */
  draggable: boolean;
  /** Whether items may be inserted into this branch. */
  acceptsDrop: boolean;
  /** Text shown beside the branch icon. */
  title: string;
  /** Child branches and links in display order. */
  children: ExplorerTreeNode[];
  /** Whether the branch starts collapsed when first rendered. */
  defaultCollapsed: boolean;
};

/** Opaque semantic identity for an explorer group. */
export type ExplorerGroupReference =
  | { kind: 'source'; source: ExplorerSourceId }
  | { kind: 'window'; id: string }
  | { kind: 'bookmark-folder'; id: string; parentId: string | null }
  | { kind: 'history-date'; id: string }
  | { kind: 'document-group'; id: string; parentId: string | null }
  | { kind: 'fixture-group'; id: string };

/** Describes a tab, bookmark, or history result. */
export type ExplorerTreeLinkNode = {
  /** Stable identifier scoped to the explorer backend. */
  id: string;
  /** Distinguishes navigable links from branches and status messages. */
  kind: 'link';
  /** Collection that owns the item. */
  source: ExplorerSourceId;
  /** Opaque backend reference used by explorer operations. */
  reference: ExplorerLinkReference;
  /** Position within the containing backend collection. */
  index: number;
  /** Whether this item may initiate a drag operation. */
  draggable: boolean;
  /** Text shown for the item. */
  title: string;
  /** Destination opened when the item is activated, or null when unavailable. */
  url: string | null;
  /** Renderable favicon URL supplied by the backend, or null when unavailable. */
  faviconUrl: string | null;
  /** Secondary information exposed as a tooltip. */
  description: string;
  /** Nested links and groups, supported by imported and fixture trees. */
  children: ExplorerTreeNode[];
  /** Whether nested descendants start collapsed when first rendered. */
  defaultCollapsed: boolean;
};

/** Opaque semantic identity for an explorer link. */
export type ExplorerLinkReference =
  | { kind: 'tab'; id: string; windowId: string }
  | { kind: 'bookmark'; id: string; folderId: string }
  | { kind: 'history'; id: string }
  | { kind: 'document-link'; id: string; parentId: string | null }
  | { kind: 'fixture-link'; id: string };

/** Describes a non-interactive tree row such as an unavailable-data notice. */
export type ExplorerTreeMessageNode = {
  /** Stable identifier scoped to the explorer backend. */
  id: string;
  /** Distinguishes status messages from branches and navigable links. */
  kind: 'message';
  /** Message displayed in the tree. */
  title: string;
};

/** A renderable node supplied by any explorer backend. */
export type ExplorerTreeNode = ExplorerTreeGroupNode | ExplorerTreeLinkNode | ExplorerTreeMessageNode;

/** Source tabs shown above every explorer pane. */
export const EXPLORER_SOURCES = [
  { id: 'explore', label: 'Explore' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'history', label: 'History' }
] as const satisfies readonly { id: ExplorerSourceId; label: string }[];

/** Returns an explorer node's direct children, or `undefined` for leaves. */
export function getExplorerChildren(node: ExplorerTreeNode): readonly ExplorerTreeNode[] | undefined {
  return node.kind === 'group' || node.kind === 'link' ? node.children : undefined;
}

/** Compares row-visible and operation-relevant node data while ignoring separately reconciled children. */
export function equalExplorerTreeNodes(left: ExplorerTreeNode, right: ExplorerTreeNode): boolean {
  if (left.id !== right.id || left.kind !== right.kind || left.title !== right.title) {
    return false;
  }
  if (left.kind === 'message' || right.kind === 'message') {
    return left.kind === right.kind;
  }
  if (
    left.source !== right.source ||
    left.index !== right.index ||
    left.draggable !== right.draggable ||
    left.defaultCollapsed !== right.defaultCollapsed ||
    !equalExplorerReferences(left.reference, right.reference)
  ) {
    return false;
  }
  if (left.kind === 'group') {
    return right.kind === 'group' && left.groupKind === right.groupKind && left.acceptsDrop === right.acceptsDrop;
  }
  if (right.kind === 'group') {
    return false;
  }
  return (
    left.url === right.url &&
    left.faviconUrl === right.faviconUrl &&
    left.description === right.description
  );
}

function equalExplorerReferences(
  left: ExplorerGroupReference | ExplorerLinkReference,
  right: ExplorerGroupReference | ExplorerLinkReference
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case 'source':
      return right.kind === 'source' && left.source === right.source;
    case 'window':
    case 'history-date':
    case 'fixture-group':
    case 'history':
    case 'fixture-link':
      return right.kind === left.kind && left.id === right.id;
    case 'bookmark-folder':
      return right.kind === 'bookmark-folder' && left.id === right.id && left.parentId === right.parentId;
    case 'document-group':
      return right.kind === 'document-group' && left.id === right.id && left.parentId === right.parentId;
    case 'tab':
      return right.kind === 'tab' && left.id === right.id && left.windowId === right.windowId;
    case 'bookmark':
      return right.kind === 'bookmark' && left.id === right.id && left.folderId === right.folderId;
    case 'document-link':
      return right.kind === 'document-link' && left.id === right.id && left.parentId === right.parentId;
    default: {
      const exhaustiveReference: never = left;
      return exhaustiveReference;
    }
  }
}
