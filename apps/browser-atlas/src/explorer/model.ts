/** Identifies one collection displayed by an explorer pane. */
export type ExplorerSourceId = 'explore' | 'bookmarks' | 'history';

/** Describes a branch in the platform-neutral explorer tree. */
export type ExplorerTreeGroupNode = {
  /** Stable identifier scoped to the explorer backend. */
  id: string;
  /** Distinguishes branches from links and status messages. */
  kind: 'group';
  /** Controls the explorer-specific icon and label treatment. */
  groupKind: 'source' | 'window' | 'folder' | 'date' | 'group';
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
  /** Whether an open browser window will remain in the tree after Chromium closes it. */
  protectedFromClose?: true;
  /** Session-only reason this saved window is highlighted until the browser exits. */
  transientStatus?: ExplorerTransientWindowStatus;
};

/** Session-only reason a saved window receives temporary visual emphasis. */
export type ExplorerTransientWindowStatus = 'recently-saved' | 'crash-recovered';

/** Opaque semantic identity for an explorer group. */
export type ExplorerGroupReference =
  | { kind: 'source'; source: ExplorerSourceId }
  | { kind: 'window'; id: string; focused: boolean }
  | { kind: 'saved-items' }
  | { kind: 'saved-window'; id: string; parentId: string | null; parentKind: SavedParentKind }
  | { kind: 'saved-group'; id: string; parentId: string | null; parentKind: SavedParentKind }
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
  /** Whether this tab carries an explicit durable keep-on-close mark. */
  keepOnClose?: true;
  /** Whether this open browser tab is active in its window. */
  active?: true;
  /** Whether an open browser tab will remain in the tree after Chromium closes it. */
  protectedFromClose?: true;
};

/** Opaque semantic identity for an explorer link. */
export type ExplorerLinkReference =
  | { kind: 'tab'; id: string; windowId: string }
  | { kind: 'saved-tab'; id: string; parentId: string | null; parentKind: SavedParentKind }
  | { kind: 'saved-note'; id: string; parentId: string | null; parentKind: SavedParentKind }
  | { kind: 'saved-separator'; id: string; parentId: string | null; parentKind: SavedParentKind; style: 0 | 1 | 2 }
  | { kind: 'bookmark'; id: string; folderId: string }
  | { kind: 'history'; id: string }
  | { kind: 'document-link'; id: string; parentId: string | null }
  | { kind: 'document-note'; id: string; parentId: string | null }
  | { kind: 'document-separator'; id: string; parentId: string | null; style: 0 | 1 | 2 }
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

/** Container type used to validate saved-tree drag destinations before persistence. */
export type SavedParentKind = 'root' | 'group' | 'window' | 'tab' | 'note' | 'separator';

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
    left.protectedFromClose !== right.protectedFromClose ||
    !equalExplorerReferences(left.reference, right.reference)
  ) {
    return false;
  }
  if (left.kind === 'group') {
    return (
      right.kind === 'group' &&
      left.groupKind === right.groupKind &&
      left.acceptsDrop === right.acceptsDrop &&
      left.transientStatus === right.transientStatus
    );
  }
  if (right.kind === 'group') {
    return false;
  }
  return (
    left.url === right.url &&
    left.faviconUrl === right.faviconUrl &&
    left.description === right.description &&
    left.keepOnClose === right.keepOnClose &&
    left.active === right.active
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
      return right.kind === 'window' && left.id === right.id && left.focused === right.focused;
    case 'history-date':
    case 'fixture-group':
    case 'history':
    case 'fixture-link':
      return right.kind === left.kind && left.id === right.id;
    case 'saved-window':
    case 'saved-group':
      return (
        right.kind === left.kind &&
        left.id === right.id &&
        left.parentId === right.parentId &&
        left.parentKind === right.parentKind
      );
    case 'saved-items':
      return right.kind === 'saved-items';
    case 'bookmark-folder':
      return right.kind === 'bookmark-folder' && left.id === right.id && left.parentId === right.parentId;
    case 'document-group':
      return right.kind === 'document-group' && left.id === right.id && left.parentId === right.parentId;
    case 'tab':
      return right.kind === 'tab' && left.id === right.id && left.windowId === right.windowId;
    case 'saved-tab':
      return (
        right.kind === 'saved-tab' &&
        left.id === right.id &&
        left.parentId === right.parentId &&
        left.parentKind === right.parentKind
      );
    case 'saved-note':
      return (
        right.kind === 'saved-note' &&
        left.id === right.id &&
        left.parentId === right.parentId &&
        left.parentKind === right.parentKind
      );
    case 'saved-separator':
      return (
        right.kind === 'saved-separator' &&
        left.id === right.id &&
        left.parentId === right.parentId &&
        left.parentKind === right.parentKind &&
        left.style === right.style
      );
    case 'bookmark':
      return right.kind === 'bookmark' && left.id === right.id && left.folderId === right.folderId;
    case 'document-link':
      return right.kind === 'document-link' && left.id === right.id && left.parentId === right.parentId;
    case 'document-note':
      return right.kind === 'document-note' && left.id === right.id && left.parentId === right.parentId;
    case 'document-separator':
      return (
        right.kind === 'document-separator' &&
        left.id === right.id &&
        left.parentId === right.parentId &&
        left.style === right.style
      );
    default: {
      const exhaustiveReference: never = left;
      return exhaustiveReference;
    }
  }
}
