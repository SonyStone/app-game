import {
  createTreeDragAndDrop,
  type TreeDragModifiers,
  type TreeDropEffect,
  type TreeDropPlacement
} from '../tree-view/createTreeDragAndDrop';
import type {
  ExplorerBatchableCommand,
  ExplorerCommand,
  PersistentItemTarget,
  PersistentMovePlacement,
  PersistentOrganizerPlacement
} from './backend';
import { batchExplorerCommands } from './backend';
import type { ExplorerSourceId, ExplorerTreeNode, SavedParentKind } from './model';
import type { PortableExplorerNode } from './portable';
import { serializeClipboardHtml, serializeClipboardText } from './clipboard';
import { executeAcknowledgedHandoff } from './crossBackendHandoff';
import { parseExplorerHtmlDocument } from './files';
import { planSequentialInsertion } from './sequentialInsertion';
import {
  createEmptyExplorerDocument,
  createPortableExplorerNode,
  createPortableTextNote,
  parseExplorerText,
  parsePortableExplorerNode,
  portableNodeTitle
} from './portable';

const EXPLORER_DRAG_DATA_TYPE = 'application/x-browser-atlas-transfer+json';
const EXPLORER_TEXT_TRANSFER_PREFIX = 'browser-atlas-transfer:v2\n';
const EXPLORER_HTML_TRANSFER_PREFIX = '<!--browser-atlas-transfer:v2\n';
const EXPLORER_HTML_TRANSFER_SUFFIX = '\nbrowser-atlas-transfer:end-->';
const EXTERNAL_URL_PROTOCOLS = new Set([
  'about:',
  'chrome:',
  'chrome-extension:',
  'edge:',
  'file:',
  'ftp:',
  'http:',
  'https:',
  'mailto:'
]);

/**
 * Composes generic tree drag gestures with portable cross-backend explorer transfers. A row may
 * drag several hierarchies at once, such as the selection it belongs to; they are dropped side by
 * side in document order, and each one moves or copies as it would when dragged alone.
 */
export function createExplorerDragAndDrop(props: {
  onCommand: (backendId: string, command: ExplorerCommand) => Promise<void>;
  /** Whether two backend identities represent browsers that support acknowledged handoff. */
  canMoveAcrossBackends: (sourceBackendId: string, targetBackendId: string) => boolean;
  createOrganizerCommand: (
    itemKind: ExplorerOrganizerKind,
    placement: PersistentOrganizerPlacement
  ) => Extract<ExplorerCommand, { kind: 'create-saved-organizer' }> | null | Promise<Extract<ExplorerCommand, { kind: 'create-saved-organizer' }> | null>;
}) {
  const dragAndDrop = createTreeDragAndDrop<ExplorerDragNode, ExplorerTransferSet, ExplorerDropTarget>({
    dataType: EXPLORER_DRAG_DATA_TYPE,
    createItem: ({ node, backendId, dragNodes }) => createTransferSet(dragNodes?.() ?? [node], backendId),
    canDrag: ({ node }) => canDragNode(node),
    getItemLabel: (transfers) =>
      transfers.length === 1 && transfers[0] ? portableNodeTitle(transfers[0].item) : `${transfers.length} items`,
    serializeItem: serializeTransferSet,
    parseItem: parseTransferSet,
    additionalDataTypes: ['application/json', 'text/uri-list', 'text/plain', 'text/html'],
    writeItem: writeInteroperableTransfer,
    readItem: readInteroperableTransfer,
    resolveTarget: ({ node, backendId }, pointerRatio) => resolveDropTarget(node, backendId, pointerRatio),
    canDrop: (transfers, target) => transfers.every((transfer) => canDrop(transfer, target)),
    getDropEffect: (transfers, target, modifiers) =>
      transfers.some((transfer) => getDropEffect(transfer, target, modifiers, props.canMoveAcrossBackends) === 'move')
        ? 'move'
        : 'copy',
    getPlacement: (target) => target.placement,
    onDrop: (transfers, target, effect) => {
      const [transfer] = transfers;
      if (transfers.length === 1 && transfer) {
        return dropTransfer(transfer, target, effect);
      }
      return dropTransfers(transfers, target, effect);
    },
    formatError: (reason) => (reason instanceof Error ? reason.message : 'The explorer could not complete the drop.')
  });

  return {
    ...dragAndDrop,
    /**
     * Native drag and drop properties bound to the backend rendering this node. `dragNodes`
     * returns the nodes a drag from this row carries, such as the selected hierarchies, when the
     * drag starts; by default a row drags only its own node.
     */
    rowProps(node: ExplorerTreeNode, backendId: string, dragNodes?: () => readonly ExplorerTreeNode[]) {
      return dragAndDrop.rowProps({ node, backendId, ...(dragNodes ? { dragNodes } : {}) });
    },
    /** Native drop events bound to a node without making the surface draggable. */
    dropZoneProps(node: ExplorerTreeNode, backendId: string) {
      return dragAndDrop.dropZoneProps({ node, backendId });
    },
    /** Drag properties for an original-style toolbar organizer fabric. */
    organizerDragProps(itemKind: ExplorerOrganizerKind, backendId: string) {
      return dragAndDrop.dragSourceProps([createOrganizerTransfer(itemKind, backendId)]);
    },
    /** Drag properties for the original-style new-window toolbar fabric. */
    windowDragProps(backendId: string) {
      return dragAndDrop.dragSourceProps([createWindowTransfer(backendId)]);
    },
    /** Drag properties for the original-style Google Doc toolbar fabric. */
    googleDocDragProps(backendId: string) {
      return dragAndDrop.dragSourceProps([createGoogleDocTransfer(backendId)]);
    },
    /** Whether a normalized node contains portable data that can be dragged. */
    canDrag(node: ExplorerTreeNode): boolean {
      return canDragNode(node);
    }
  } as const;

  async function dropTransfer(transfer: ExplorerTransfer, target: ExplorerDropTarget, effect: TreeDropEffect) {
    if (transfer.origin.kind === 'new-window') {
      await props.onCommand(target.backendId, {
        kind: 'create-window-at-placement',
        placement: organizerPlacementForDrop(target)
      });
      return;
    }
    if (transfer.origin.kind === 'new-google-doc') {
      await props.onCommand(target.backendId, {
        kind: 'create-google-doc-at-placement',
        placement: organizerPlacementForDrop(target)
      });
      return;
    }
    if (transfer.origin.kind === 'new-organizer') {
      const command = await props.createOrganizerCommand(
        transfer.origin.itemKind,
        organizerPlacementForDrop(target)
      );
      if (command) {
        await props.onCommand(target.backendId, command);
      }
      return;
    }
    const sourceOrigin = transfer.origin;
    if (
      effect === 'move' &&
      sourceOrigin.backendId !== target.backendId &&
      canRemoveSourceAfterImport(sourceOrigin)
    ) {
      await executeAcknowledgedHandoff(
        () => props.onCommand(target.backendId, createDropCommand(transfer, target, 'copy')),
        () => props.onCommand(sourceOrigin.backendId, createSourceRemovalCommand(sourceOrigin, transfer.item))
      );
      return;
    }
    await props.onCommand(target.backendId, createDropCommand(transfer, target, effect));
  }

  /**
   * Drops several hierarchies as one change per browser. Same-browser moves run first, each right
   * after the previous one; copies and moves from other browsers are imported after them in one
   * command, and those other browsers remove their sources only after the import succeeded.
   */
  async function dropTransfers(
    transfers: ExplorerTransferSet,
    target: ExplorerDropTarget,
    effect: TreeDropEffect
  ): Promise<void> {
    const entryEffect = (transfer: ExplorerTransfer): TreeDropEffect =>
      effect === 'copy'
        ? 'copy'
        : getDropEffect(transfer, target, { copyRequested: false }, props.canMoveAcrossBackends);
    const moves = transfers.flatMap((transfer) =>
      entryEffect(transfer) === 'move' &&
      transfer.origin.backendId === target.backendId &&
      canRemoveSourceAfterImport(transfer.origin)
        ? [{ transfer, origin: transfer.origin }]
        : []
    );
    const imports = transfers.filter((transfer) => !moves.some((move) => move.transfer === transfer));
    const handoffs = imports.flatMap((transfer) =>
      entryEffect(transfer) === 'move' && canRemoveSourceAfterImport(transfer.origin)
        ? [{ origin: transfer.origin, item: transfer.item }]
        : []
    );

    const plan = planSequentialInsertion(
      moves.map(({ origin }) => ({ key: transferParentKey(origin), index: origin.index })),
      { key: dropTargetParentKey(target), index: target.index }
    );
    const commands = moves.map(({ transfer, origin }, moveNumber): ExplorerBatchableCommand => {
      const position = plan.positions[moveNumber]!;
      return createDropCommand(
        { ...transfer, origin: { ...origin, index: position.sourceIndex } },
        { ...target, index: position.targetIndex },
        'move'
      );
    });
    if (imports.length > 0) {
      commands.push(
        createImportCommand(
          { ...target, index: plan.nextIndex },
          imports.map((transfer) => transfer.item),
          imports.some((transfer) => transfer.hasLinks)
        )
      );
    }

    const receive = () => props.onCommand(target.backendId, batchExplorerCommands(commands));
    if (handoffs.length === 0) {
      await receive();
      return;
    }
    await executeAcknowledgedHandoff(receive, () => removeHandoffSources(handoffs));
  }

  async function removeHandoffSources(
    handoffs: readonly Readonly<{ origin: RemovableTransferOrigin; item: PortableExplorerNode }>[]
  ): Promise<void> {
    for (const backendId of new Set(handoffs.map(({ origin }) => origin.backendId))) {
      const removals = handoffs
        .filter(({ origin }) => origin.backendId === backendId)
        .map(({ origin, item }) => createSourceRemovalCommand(origin, item));
      await props.onCommand(backendId, batchExplorerCommands(removals));
    }
  }
}

/** Collections affected by a successful command and requiring refresh. */
export function affectedSources(command: ExplorerCommand): readonly ExplorerSourceId[] {
  switch (command.kind) {
    case 'create-tree-snapshot':
      return [];
    case 'delete-tree-item':
      return [deleteTargetSource(command.target)];
    case 'activate-tab':
    case 'activate-window':
    case 'create-window':
    case 'create-window-at-placement':
    case 'create-google-doc-at-placement':
    case 'restore-latest-tree-snapshot':
    case 'save-close-tab':
    case 'save-close-window':
    case 'save-close-all-windows':
    case 'restore-saved-tab':
    case 'restore-saved-window':
    case 'restore-saved-window-session':
    case 'restore-saved-group':
    case 'create-saved-organizer':
    case 'rename-persistent-item':
    case 'cycle-saved-separator':
    case 'delete-saved-organizer':
    case 'undo-persistent-tree':
    case 'redo-persistent-tree':
    case 'move-saved-item':
    case 'reposition-persistent-item':
    case 'flatten-persistent-tabs':
    case 'move-tab':
    case 'move-tab-to-new-window':
    case 'move-live-tab-in-tree':
    case 'restore-saved-item-into-window':
    case 'open-tab':
    case 'open-link':
      return ['explore'];
    case 'move-bookmark':
    case 'create-bookmark':
      return ['bookmarks'];
    case 'import-items':
      return [importTargetSource(command.target)];
    case 'move-document-node':
      return command.source.source === command.target.source
        ? [command.source.source]
        : [command.source.source, command.target.source];
    case 'batch':
      return [...new Set(command.commands.flatMap(affectedSources))];
    default: {
      const exhaustiveCommand: never = command;
      return exhaustiveCommand;
    }
  }
}

type ExplorerDragNode = {
  node: ExplorerTreeNode;
  backendId: string;
  /** Nodes a drag from this row carries, in document order; defaults to the row's own node. */
  dragNodes?: () => readonly ExplorerTreeNode[];
};

/** Hierarchies dragged together in document order; a plain row or toolbar drag carries one. */
type ExplorerTransferSet = readonly ExplorerTransfer[];

/** Persistent organizer kind that can be dragged from the explorer toolbar. */
export type ExplorerOrganizerKind = Extract<ExplorerCommand, { kind: 'create-saved-organizer' }>['itemKind'];

type ExplorerTransfer = {
  format: 'browser-atlas-transfer';
  version: 2;
  origin: ExplorerTransferOrigin;
  item: PortableExplorerNode;
  hasLinks: boolean;
};

type ExplorerTransferOrigin =
  | PositionedTransferOrigin<'tab'>
  | PositionedTransferOrigin<'window'>
  | PositionedTransferOrigin<'bookmark'>
  | PositionedTransferOrigin<'saved'>
  | (PositionedTransferOrigin<'document'> & { source: ExplorerSourceId })
  | { kind: 'new-window'; backendId: string; nodeId: string }
  | { kind: 'new-google-doc'; backendId: string; nodeId: string }
  | { kind: 'new-organizer'; backendId: string; nodeId: string; itemKind: ExplorerOrganizerKind }
  | { kind: 'copy'; backendId: string; nodeId: string; source: ExplorerSourceId };

type PositionedTransferOrigin<TKind extends 'tab' | 'window' | 'bookmark' | 'saved' | 'document'> = {
  kind: TKind;
  backendId: string;
  nodeId: string;
  itemId: string;
  parentId: string | null;
  index: number;
};

type ExplorerDropTarget =
  | { backendId: string; nodeId: string; kind: 'explore-root'; index: number; placement: TreeDropPlacement }
  | {
      backendId: string;
      nodeId: string;
      kind: 'tabs';
      windowId: string;
      anchorTabId: string | null;
      index: number;
      placement: TreeDropPlacement;
    }
  | {
      backendId: string;
      nodeId: string;
      kind: 'live-tab';
      tabId: string;
      windowId: string;
      index: number;
      placement: TreeDropPlacement;
    }
  | {
      backendId: string;
      nodeId: string;
      kind: 'bookmarks';
      folderId: string;
      index: number;
      placement: TreeDropPlacement;
    }
  | {
      backendId: string;
      nodeId: string;
      kind: 'document';
      source: ExplorerSourceId;
      parentId: string | null;
      index: number;
      placement: TreeDropPlacement;
    }
  | {
      backendId: string;
      nodeId: string;
      kind: 'saved';
      parentId: string | null;
      parentKind: SavedParentKind;
      anchorItemId: string | null;
      index: number;
      placement: TreeDropPlacement;
    };

function createOrganizerTransfer(itemKind: ExplorerOrganizerKind, backendId: string): ExplorerTransfer {
  const item: PortableExplorerNode = itemKind === 'group'
    ? { kind: 'group', groupKind: 'group', title: 'New group', children: [], defaultCollapsed: false }
    : itemKind === 'note'
      ? { kind: 'note', text: 'New note', children: [], defaultCollapsed: false }
      : { kind: 'separator', style: 0, children: [], defaultCollapsed: false };
  return {
    format: 'browser-atlas-transfer',
    version: 2,
    origin: { kind: 'new-organizer', backendId, nodeId: `toolbar-${itemKind}`, itemKind },
    item,
    hasLinks: false
  };
}

function createWindowTransfer(backendId: string): ExplorerTransfer {
  return {
    format: 'browser-atlas-transfer',
    version: 2,
    origin: { kind: 'new-window', backendId, nodeId: 'toolbar-window' },
    item: { kind: 'group', groupKind: 'window', title: 'New window', children: [], defaultCollapsed: false },
    hasLinks: false
  };
}

function createGoogleDocTransfer(backendId: string): ExplorerTransfer {
  return {
    format: 'browser-atlas-transfer',
    version: 2,
    origin: { kind: 'new-google-doc', backendId, nodeId: 'toolbar-google-doc' },
    item: {
      kind: 'link',
      title: 'Untitled document',
      url: 'https://docs.google.com/document/create',
      faviconUrl: null,
      description: 'Create a new Google document',
      children: [],
      defaultCollapsed: false
    },
    hasLinks: true
  };
}

function createTransfer(node: ExplorerTreeNode, backendId: string): ExplorerTransfer | null {
  if (!canDragNode(node)) {
    return null;
  }
  const item = createPortableExplorerNode(node);
  if (!item) {
    return null;
  }

  return {
    format: 'browser-atlas-transfer',
    version: 2,
    origin: createTransferOrigin(node, backendId),
    item,
    hasLinks: hasPortableLink(item)
  };
}

function createTransferSet(nodes: readonly ExplorerTreeNode[], backendId: string): ExplorerTransferSet | null {
  const transfers = nodes.flatMap((node) => createTransfer(node, backendId) ?? []);
  return transfers.length > 0 ? transfers : null;
}

function canDragNode(node: ExplorerTreeNode): node is Exclude<ExplorerTreeNode, { kind: 'message' }> {
  return (
    node.kind !== 'message' &&
    node.draggable &&
    (node.kind === 'group' ||
      node.url !== null ||
      node.reference.kind === 'saved-note' ||
      node.reference.kind === 'saved-separator' ||
      node.reference.kind === 'document-note' ||
      node.reference.kind === 'document-separator')
  );
}

function createTransferOrigin(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
  backendId: string
): ExplorerTransferOrigin {
  if (node.kind === 'group') {
    switch (node.reference.kind) {
      case 'bookmark-folder':
        return node.reference.parentId === null
          ? createCopyOrigin(node, backendId)
          : {
              kind: 'bookmark',
              backendId,
              nodeId: node.id,
              itemId: node.reference.id,
              parentId: node.reference.parentId,
              index: node.index
            };
      case 'document-group':
        return {
          kind: 'document',
          backendId,
          nodeId: node.id,
          itemId: node.reference.id,
          parentId: node.reference.parentId,
          index: node.index,
          source: node.source
        };
      case 'saved-window':
      case 'saved-group':
        return {
          kind: 'saved',
          backendId,
          nodeId: node.id,
          itemId: node.reference.id,
          parentId: node.reference.parentId,
          index: node.index
        };
      case 'source':
      case 'saved-items':
      case 'history-date':
      case 'fixture-group':
        return createCopyOrigin(node, backendId);
      case 'window':
        return {
          kind: 'window',
          backendId,
          nodeId: node.id,
          itemId: node.reference.id,
          parentId: null,
          index: node.index
        };
      default: {
        const exhaustiveReference: never = node.reference;
        return exhaustiveReference;
      }
    }
  }

  switch (node.reference.kind) {
    case 'tab':
      return {
        kind: 'tab',
        backendId,
        nodeId: node.id,
        itemId: node.reference.id,
        parentId: node.reference.windowId,
        index: node.index
      };
    case 'saved-tab':
    case 'saved-note':
    case 'saved-separator':
      return {
        kind: 'saved',
        backendId,
        nodeId: node.id,
        itemId: node.reference.id,
        parentId: node.reference.parentId,
        index: node.index
      };
    case 'bookmark':
      return {
        kind: 'bookmark',
        backendId,
        nodeId: node.id,
        itemId: node.reference.id,
        parentId: node.reference.folderId,
        index: node.index
      };
    case 'document-link':
    case 'document-note':
    case 'document-separator':
      return {
        kind: 'document',
        backendId,
        nodeId: node.id,
        itemId: node.reference.id,
        parentId: node.reference.parentId,
        index: node.index,
        source: node.source
      };
    case 'history':
    case 'fixture-link':
      return createCopyOrigin(node, backendId);
    default: {
      const exhaustiveReference: never = node.reference;
      return exhaustiveReference;
    }
  }
}

function createCopyOrigin(
  node: Exclude<ExplorerTreeNode, { kind: 'message' }>,
  backendId: string
): Extract<ExplorerTransferOrigin, { kind: 'copy' }> {
  return { kind: 'copy', backendId, nodeId: node.id, source: node.source };
}

function resolveDropTarget(node: ExplorerTreeNode, backendId: string, pointerRatio: number): ExplorerDropTarget | null {
  const siblingTarget = resolveSiblingTarget(node, backendId, pointerRatio);
  if (siblingTarget) {
    return siblingTarget;
  }
  if (
    node.kind === 'link' &&
    (node.reference.kind === 'document-link' ||
      node.reference.kind === 'document-note' ||
      node.reference.kind === 'document-separator')
  ) {
    return {
      backendId,
      nodeId: node.id,
      kind: 'document',
      source: node.source,
      parentId: node.reference.id,
      index: node.children.length,
      placement: 'inside'
    };
  }
  if (node.kind === 'link' && node.reference.kind === 'tab') {
    return {
      backendId,
      nodeId: node.id,
      kind: 'live-tab',
      tabId: node.reference.id,
      windowId: node.reference.windowId,
      index: node.children.length,
      placement: 'inside'
    };
  }
  if (
    node.kind === 'link' &&
    (node.reference.kind === 'saved-tab' ||
      node.reference.kind === 'saved-note' ||
      node.reference.kind === 'saved-separator')
  ) {
    return {
      backendId,
      nodeId: node.id,
      kind: 'saved',
      parentId: node.reference.id,
      parentKind: savedReferenceParentKind(node.reference.kind),
      anchorItemId: null,
      index: node.children.length,
      placement: 'inside'
    };
  }
  if (node.kind !== 'group' || !node.acceptsDrop) {
    return null;
  }

  switch (node.reference.kind) {
    case 'window':
      return {
        backendId,
        nodeId: node.id,
        kind: 'tabs',
        windowId: node.reference.id,
        anchorTabId: null,
        index: node.children.length,
        placement: 'inside'
      };
    case 'bookmark-folder':
      return {
        backendId,
        nodeId: node.id,
        kind: 'bookmarks',
        folderId: node.reference.id,
        index: node.children.length,
        placement: 'inside'
      };
    case 'document-group':
      return {
        backendId,
        nodeId: node.id,
        kind: 'document',
        source: node.source,
        parentId: node.reference.id,
        index: node.children.length,
        placement: 'inside'
      };
    case 'saved-items':
      return {
        backendId,
        nodeId: node.id,
        kind: 'saved',
        parentId: null,
        parentKind: 'root',
        anchorItemId: null,
        index: node.children.length,
        placement: 'inside'
      };
    case 'saved-window':
      return {
        backendId,
        nodeId: node.id,
        kind: 'saved',
        parentId: node.reference.id,
        parentKind: 'window',
        anchorItemId: null,
        index: node.children.length,
        placement: 'inside'
      };
    case 'saved-group':
      return {
        backendId,
        nodeId: node.id,
        kind: 'saved',
        parentId: node.reference.id,
        parentKind: 'group',
        anchorItemId: null,
        index: node.children.length,
        placement: 'inside'
      };
    case 'source':
      return node.source === 'explore'
        ? {
            backendId,
            nodeId: node.id,
            kind: 'explore-root',
            index: node.children.length,
            placement: 'inside'
          }
        : {
            backendId,
            nodeId: node.id,
            kind: 'document',
            source: node.source,
            parentId: null,
            index: node.children.length,
            placement: 'inside'
          };
    case 'history-date':
    case 'fixture-group':
      return null;
    default: {
      const exhaustiveReference: never = node.reference;
      return exhaustiveReference;
    }
  }
}

function resolveSiblingTarget(
  node: ExplorerTreeNode,
  backendId: string,
  pointerRatio: number
): ExplorerDropTarget | null {
  if (node.kind === 'message') {
    return null;
  }
  const placement = pointerRatio < 0.5 ? 'before' : 'after';
  const index = node.index + (placement === 'after' ? 1 : 0);

  if (node.kind === 'link') {
    switch (node.reference.kind) {
      case 'tab':
        return pointerRatio >= 0.25 && pointerRatio <= 0.75
          ? null
          : {
              backendId,
              nodeId: node.id,
              kind: 'tabs',
              windowId: node.reference.windowId,
              anchorTabId: node.reference.id,
              index,
              placement
            };
      case 'bookmark':
        return node.draggable
          ? { backendId, nodeId: node.id, kind: 'bookmarks', folderId: node.reference.folderId, index, placement }
          : null;
      case 'document-link':
      case 'document-note':
      case 'document-separator':
        return pointerRatio >= 0.25 && pointerRatio <= 0.75
          ? null
          : {
              backendId,
              nodeId: node.id,
              kind: 'document',
              source: node.source,
              parentId: node.reference.parentId,
              index,
              placement
            };
      case 'saved-tab':
      case 'saved-note':
      case 'saved-separator':
        return pointerRatio >= 0.25 && pointerRatio <= 0.75
          ? null
          : {
              backendId,
              nodeId: node.id,
              kind: 'saved',
              parentId: node.reference.parentId,
              parentKind: node.reference.parentKind,
              anchorItemId: node.reference.id,
              index,
              placement
            };
      case 'history':
      case 'fixture-link':
        return null;
      default: {
        const exhaustiveReference: never = node.reference;
        return exhaustiveReference;
      }
    }
  }

  if (node.kind !== 'group' || (pointerRatio >= 0.25 && pointerRatio <= 0.75)) {
    return null;
  }
  const groupPlacement = pointerRatio < 0.25 ? 'before' : 'after';
  const groupIndex = node.index + (groupPlacement === 'after' ? 1 : 0);
  if (node.reference.kind === 'bookmark-folder' && node.draggable && node.reference.parentId !== null) {
    return {
      backendId,
      nodeId: node.id,
      kind: 'bookmarks',
      folderId: node.reference.parentId,
      index: groupIndex,
      placement: groupPlacement
    };
  }
  if (node.reference.kind === 'document-group') {
    return {
      backendId,
      nodeId: node.id,
      kind: 'document',
      source: node.source,
      parentId: node.reference.parentId,
      index: groupIndex,
      placement: groupPlacement
    };
  }
  if (node.reference.kind === 'saved-window' || node.reference.kind === 'saved-group') {
    return {
      backendId,
      nodeId: node.id,
      kind: 'saved',
      parentId: node.reference.parentId,
      parentKind: node.reference.parentKind,
      anchorItemId: node.reference.id,
      index: groupIndex,
      placement: groupPlacement
    };
  }
  return null;
}

function canDrop(transfer: ExplorerTransfer, target: ExplorerDropTarget): boolean {
  if (
    transfer.origin.kind === 'new-window' ||
    transfer.origin.kind === 'new-google-doc' ||
    transfer.origin.kind === 'new-organizer'
  ) {
    return (
      transfer.origin.backendId === target.backendId &&
      (target.kind === 'explore-root' || target.kind === 'saved' || target.kind === 'live-tab' || target.kind === 'tabs')
    );
  }
  if (target.kind === 'explore-root') {
    return transfer.origin.nodeId !== target.nodeId;
  }
  if (target.kind === 'saved') {
    return transfer.origin.kind === 'saved' && transfer.origin.backendId === target.backendId
      ? transfer.origin.itemId !== target.parentId
      : transfer.origin.nodeId !== target.nodeId;
  }
  if (target.kind === 'live-tab') {
    return transfer.origin.nodeId !== target.nodeId;
  }
  if (transfer.origin.kind === 'saved' && transfer.origin.backendId === target.backendId) {
    return target.kind === 'tabs';
  }
  if (transfer.origin.backendId !== target.backendId) {
    return true;
  }
  if (transfer.origin.nodeId === target.nodeId) {
    return false;
  }
  if (transfer.origin.kind === 'bookmark' && target.kind === 'bookmarks') {
    return transfer.origin.itemId !== target.folderId;
  }
  if (transfer.origin.kind === 'document' && target.kind === 'document') {
    return transfer.origin.itemId !== target.parentId;
  }
  return true;
}

function getDropEffect(
  transfer: ExplorerTransfer,
  target: ExplorerDropTarget,
  modifiers: TreeDragModifiers,
  canMoveAcrossBackends: (sourceBackendId: string, targetBackendId: string) => boolean
): TreeDropEffect {
  if (
    transfer.origin.kind === 'new-window' ||
    transfer.origin.kind === 'new-google-doc' ||
    transfer.origin.kind === 'new-organizer'
  ) {
    return 'copy';
  }
  if (modifiers.copyRequested) {
    return 'copy';
  }
  if (transfer.origin.backendId !== target.backendId) {
    return canRemoveSourceAfterImport(transfer.origin) &&
      canMoveAcrossBackends(transfer.origin.backendId, target.backendId)
      ? 'move'
      : 'copy';
  }
  if (
    (transfer.origin.kind === 'tab' && target.kind === 'tabs') ||
    (transfer.origin.kind === 'tab' && target.kind === 'explore-root') ||
    (transfer.origin.kind === 'tab' && (target.kind === 'saved' || target.kind === 'live-tab')) ||
    (transfer.origin.kind === 'bookmark' && target.kind === 'bookmarks') ||
    (transfer.origin.kind === 'saved' &&
      (target.kind === 'saved' || target.kind === 'live-tab' || target.kind === 'tabs' || target.kind === 'explore-root')) ||
    (transfer.origin.kind === 'document' && target.kind === 'document')
  ) {
    return 'move';
  }
  return 'copy';
}

type RemovableTransferOrigin = Extract<
  ExplorerTransferOrigin,
  { kind: 'tab' | 'window' | 'bookmark' | 'saved' | 'document' }
>;

function canRemoveSourceAfterImport(origin: ExplorerTransferOrigin): origin is RemovableTransferOrigin {
  return (
    origin.kind === 'tab' ||
    origin.kind === 'window' ||
    origin.kind === 'bookmark' ||
    origin.kind === 'saved' ||
    origin.kind === 'document'
  );
}

function createSourceRemovalCommand(
  origin: RemovableTransferOrigin,
  item: PortableExplorerNode
): Extract<ExplorerCommand, { kind: 'delete-tree-item' }> {
  switch (origin.kind) {
    case 'tab':
      return { kind: 'delete-tree-item', target: { kind: 'live-tab', id: origin.itemId }, mode: 'subtree' };
    case 'window':
      return { kind: 'delete-tree-item', target: { kind: 'live-window', id: origin.itemId }, mode: 'subtree' };
    case 'saved':
      return { kind: 'delete-tree-item', target: { kind: 'saved', id: origin.itemId }, mode: 'subtree' };
    case 'bookmark':
      return {
        kind: 'delete-tree-item',
        target: { kind: 'bookmark', id: origin.itemId, itemKind: item.kind === 'group' ? 'folder' : 'bookmark' },
        mode: 'subtree'
      };
    case 'document':
      return {
        kind: 'delete-tree-item',
        target: { kind: 'document', source: origin.source, nodeId: origin.itemId, parentId: origin.parentId },
        mode: 'subtree'
      };
    default: {
      const exhaustiveOrigin: never = origin;
      return exhaustiveOrigin;
    }
  }
}

function organizerPlacementForDrop(target: ExplorerDropTarget): PersistentMovePlacement {
  switch (target.kind) {
    case 'explore-root':
      return { kind: 'inside', target: { kind: 'root' }, position: 'last' };
    case 'live-tab':
      return {
        kind: 'inside',
        target: { kind: 'live-tab', tabId: target.tabId, windowId: target.windowId },
        position: 'last'
      };
    case 'tabs':
      return target.placement === 'inside' || target.anchorTabId === null
        ? { kind: 'inside', target: { kind: 'live-window', windowId: target.windowId }, position: 'last' }
        : {
            kind: 'sibling',
            target: { kind: 'live-tab', tabId: target.anchorTabId, windowId: target.windowId },
            position: target.placement
          };
    case 'saved':
      if (target.placement !== 'inside' && target.anchorItemId !== null) {
        return {
          kind: 'sibling',
          target: { kind: 'saved', id: target.anchorItemId },
          position: target.placement
        };
      }
      return {
        kind: 'inside',
        target: target.parentId === null ? { kind: 'root' } : { kind: 'saved', id: target.parentId },
        position: 'last'
      };
    case 'bookmarks':
    case 'document':
      throw new Error('Toolbar organizers can only be dropped into the Explore tree.');
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function createDropCommand(
  transfer: ExplorerTransfer,
  target: ExplorerDropTarget,
  effect: TreeDropEffect
): ExplorerBatchableCommand {
  if (
    transfer.origin.kind === 'new-window' ||
    transfer.origin.kind === 'new-google-doc' ||
    transfer.origin.kind === 'new-organizer'
  ) {
    throw new Error('Toolbar organizer drops must be resolved before regular explorer transfers.');
  }
  if (effect === 'move' && transfer.origin.backendId === target.backendId) {
    if (transfer.origin.kind === 'tab' && target.kind === 'explore-root') {
      return {
        kind: 'move-tab-to-new-window',
        tabId: transfer.origin.itemId,
        targetIndex: target.index
      };
    }
    if (transfer.origin.kind === 'tab' && target.kind === 'tabs') {
      return {
        kind: 'move-tab',
        tabId: transfer.origin.itemId,
        sourceWindowId: transfer.origin.parentId ?? '',
        sourceIndex: transfer.origin.index,
        targetWindowId: target.windowId,
        targetIndex: adjustSameParentIndex(
          transfer.origin.parentId,
          transfer.origin.index,
          target.windowId,
          target.index
        )
      };
    }
    if (
      transfer.origin.kind === 'tab' &&
      (target.kind === 'saved' || target.kind === 'live-tab')
    ) {
      return {
        kind: 'move-live-tab-in-tree',
        tabId: transfer.origin.itemId,
        target: target.kind === 'saved'
          ? target.parentId === null
            ? { kind: 'root' }
            : { kind: 'saved', id: target.parentId }
          : { kind: 'live-tab', tabId: target.tabId, windowId: target.windowId },
        targetIndex: target.index
      };
    }
    if (transfer.origin.kind === 'bookmark' && target.kind === 'bookmarks') {
      return {
        kind: 'move-bookmark',
        bookmarkId: transfer.origin.itemId,
        itemKind: transfer.item.kind === 'group' ? 'folder' : 'bookmark',
        sourceFolderId: transfer.origin.parentId ?? '',
        sourceIndex: transfer.origin.index,
        targetFolderId: target.folderId,
        targetIndex: adjustSameParentIndex(
          transfer.origin.parentId,
          transfer.origin.index,
          target.folderId,
          target.index
        )
      };
    }
    if (transfer.origin.kind === 'document' && target.kind === 'document') {
      return {
        kind: 'move-document-node',
        source: {
          source: transfer.origin.source,
          nodeId: transfer.origin.itemId,
          parentId: transfer.origin.parentId,
          index: transfer.origin.index
        },
        target: { source: target.source, parentId: target.parentId, index: target.index }
      };
    }
    if (transfer.origin.kind === 'saved' && target.kind === 'saved') {
      return {
        kind: 'move-saved-item',
        itemId: transfer.origin.itemId,
        sourceParentId: transfer.origin.parentId,
        sourceIndex: transfer.origin.index,
        target: target.parentId === null ? { kind: 'root' } : { kind: 'saved', id: target.parentId },
        targetIndex: adjustSameParentIndex(
          transfer.origin.parentId,
          transfer.origin.index,
          target.parentId,
          target.index
        )
      };
    }
    if (transfer.origin.kind === 'saved' && target.kind === 'explore-root') {
      return {
        kind: 'move-saved-item',
        itemId: transfer.origin.itemId,
        sourceParentId: transfer.origin.parentId,
        sourceIndex: transfer.origin.index,
        target: { kind: 'root' },
        targetIndex: adjustSameParentIndex(
          transfer.origin.parentId,
          transfer.origin.index,
          null,
          target.index
        )
      };
    }
    if (transfer.origin.kind === 'saved' && target.kind === 'live-tab') {
      return {
        kind: 'move-saved-item',
        itemId: transfer.origin.itemId,
        sourceParentId: transfer.origin.parentId,
        sourceIndex: transfer.origin.index,
        target: { kind: 'live-tab', tabId: target.tabId, windowId: target.windowId },
        targetIndex: target.index
      };
    }
    if (transfer.origin.kind === 'saved' && target.kind === 'tabs') {
      return {
        kind: 'restore-saved-item-into-window',
        itemId: transfer.origin.itemId,
        targetWindowId: target.windowId,
        targetIndex: target.index
      };
    }
  }

  return createImportCommand(target, [transfer.item], transfer.hasLinks);
}

function createImportCommand(
  target: ExplorerDropTarget,
  items: readonly PortableExplorerNode[],
  hasLinks: boolean
): Extract<ExplorerCommand, { kind: 'import-items' }> {
  return {
    kind: 'import-items',
    target: target.kind === 'tabs' && hasLinks
      ? { kind: 'window', id: target.windowId }
      : target.kind === 'bookmarks'
        ? { kind: 'bookmark-folder', id: target.folderId }
        : target.kind === 'document'
          ? { kind: 'document', source: target.source, parentId: target.parentId }
          : { kind: 'persistent', target: persistentTargetForDrop(target) },
    index: target.index,
    items: [...items]
  };
}

/**
 * Names the sibling list a dragged item leaves, matching the parent identities that single-item
 * drops compare when they shift an index within one list.
 */
function transferParentKey(origin: RemovableTransferOrigin): string {
  switch (origin.kind) {
    case 'tab':
      return `tabs:${origin.parentId ?? ''}`;
    case 'window':
    case 'saved':
      return `saved:${origin.parentId ?? ''}`;
    case 'bookmark':
      return `bookmarks:${origin.parentId ?? ''}`;
    case 'document':
      return `document:${origin.source}:${origin.parentId ?? ''}`;
    default: {
      const exhaustiveOrigin: never = origin;
      return exhaustiveOrigin;
    }
  }
}

/** Names the sibling list a drop inserts into, in the same terms as {@link transferParentKey}. */
function dropTargetParentKey(target: ExplorerDropTarget): string {
  switch (target.kind) {
    case 'explore-root':
      return 'saved:';
    case 'tabs':
      return `tabs:${target.windowId}`;
    case 'live-tab':
      return `live-tab:${target.tabId}`;
    case 'bookmarks':
      return `bookmarks:${target.folderId}`;
    case 'document':
      return `document:${target.source}:${target.parentId ?? ''}`;
    case 'saved':
      return `saved:${target.parentId ?? ''}`;
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function adjustSameParentIndex(
  sourceParentId: string | null,
  sourceIndex: number,
  targetParentId: string | null,
  targetIndex: number
): number {
  return sourceParentId === targetParentId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

function persistentTargetForDrop(
  target: Extract<ExplorerDropTarget, { kind: 'explore-root' | 'saved' | 'live-tab' | 'tabs' }>
): PersistentItemTarget {
  switch (target.kind) {
    case 'explore-root':
      return { kind: 'root' };
    case 'saved':
      return target.parentId === null ? { kind: 'root' } : { kind: 'saved', id: target.parentId };
    case 'live-tab':
      return { kind: 'live-tab', tabId: target.tabId, windowId: target.windowId };
    case 'tabs':
      return { kind: 'live-window', windowId: target.windowId };
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function savedReferenceParentKind(
  kind: 'saved-tab' | 'saved-note' | 'saved-separator'
): Extract<SavedParentKind, 'tab' | 'note' | 'separator'> {
  switch (kind) {
    case 'saved-tab':
      return 'tab';
    case 'saved-note':
      return 'note';
    case 'saved-separator':
      return 'separator';
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

/**
 * Serializes a single transfer in the version 2 format every Browser Atlas reads, and several in
 * version 3, which older versions reject so they fall back to the plain-text and HTML copies.
 */
function serializeTransferSet(transfers: ExplorerTransferSet): string {
  const [transfer] = transfers;
  if (transfers.length === 1 && transfer) {
    return JSON.stringify(transfer);
  }
  return JSON.stringify({
    format: 'browser-atlas-transfer',
    version: 3,
    entries: transfers.map(({ origin, item }) => ({ origin, item }))
  });
}

function parseTransferSet(serialized: string): ExplorerTransferSet | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.format !== 'browser-atlas-transfer') {
      return null;
    }
    if (value.version === 2) {
      const transfer = parseTransfer(serialized);
      return transfer ? [transfer] : null;
    }
    if (value.version !== 3 || !Array.isArray(value.entries) || value.entries.length === 0) {
      return null;
    }
    const transfers = value.entries.map((entry: unknown) =>
      parseTransfer(JSON.stringify({ ...(isRecord(entry) ? entry : {}), format: 'browser-atlas-transfer', version: 2 }))
    );
    return transfers.every((transfer) => transfer !== null) ? transfers : null;
  } catch {
    return null;
  }
}

function parseTransfer(serialized: string): ExplorerTransfer | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.format !== 'browser-atlas-transfer' || value.version !== 2) {
      return null;
    }
    const origin = parseTransferOrigin(value.origin);
    if (!origin) {
      return null;
    }
    const item = parsePortableExplorerNode(value.item);
    return {
      format: 'browser-atlas-transfer',
      version: 2,
      origin,
      item,
      hasLinks: hasPortableLink(item)
    };
  } catch {
    return null;
  }
}

function writeInteroperableTransfer(
  dataTransfer: DataTransfer,
  transfers: ExplorerTransferSet,
  serializedTransfer: string
): () => void {
  const items = transfers.map((transfer) => transfer.item);
  setTransferData(dataTransfer, 'application/json', serializedTransfer);
  setTransferData(dataTransfer, 'text/plain', serializeClipboardText(items));
  setTransferData(
    dataTransfer,
    'text/html',
    `${serializeHtmlTransferEnvelope(serializedTransfer)}${serializeClipboardHtml(items)}`
  );
  const urls = items.flatMap((item) => firstPortableUrl(item) ?? []);
  if (urls.length > 0) {
    setTransferData(dataTransfer, 'text/uri-list', urls.join('\r\n'));
  }
  const download = createDownload(transfers);
  setTransferData(dataTransfer, 'DownloadURL', download.value);
  return download.release;
}

function serializeHtmlTransferEnvelope(serializedTransfer: string): string {
  const encoded = encodeURIComponent(serializedTransfer).replaceAll('-', '%2D');
  return `${EXPLORER_HTML_TRANSFER_PREFIX}${encoded}${EXPLORER_HTML_TRANSFER_SUFFIX}`;
}

function firstPortableUrl(node: PortableExplorerNode): string | null {
  if (node.kind === 'link') {
    return node.url;
  }
  for (const child of node.children) {
    const url = firstPortableUrl(child);
    if (url) {
      return url;
    }
  }
  return null;
}

function createDownload(transfers: ExplorerTransferSet): { value: string; release: () => void } {
  const [first] = transfers;
  const title = first && transfers.length === 1 ? portableNodeTitle(first.item) : 'Browser Atlas items';
  const document = createEmptyExplorerDocument(title);
  for (const transfer of transfers) {
    document.sources[transferSource(transfer.origin)].push(transfer.item);
  }
  const filename = `${safeTransferFilename(title)}.browser-atlas.json`;
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' }));
  return {
    value: `application/json:${filename}:${objectUrl}`,
    release: () => URL.revokeObjectURL(objectUrl)
  };
}

function transferSource(origin: ExplorerTransferOrigin): ExplorerSourceId {
  switch (origin.kind) {
    case 'tab':
    case 'window':
    case 'new-window':
    case 'new-google-doc':
    case 'new-organizer':
      return 'explore';
    case 'bookmark':
      return 'bookmarks';
    case 'saved':
      return 'explore';
    case 'document':
    case 'copy':
      return origin.source;
    default: {
      const exhaustiveOrigin: never = origin;
      return exhaustiveOrigin;
    }
  }
}

function safeTransferFilename(value: string): string {
  const filename = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-');
  return filename || 'browser-atlas-item';
}

function readInteroperableTransfer(dataTransfer: DataTransfer): ExplorerTransferSet | null {
  const serializedJson = dataTransfer.getData('application/json');
  if (serializedJson) {
    const transfers = parseTransferSet(serializedJson);
    if (transfers) {
      return transfers;
    }
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText.startsWith(EXPLORER_TEXT_TRANSFER_PREFIX)) {
    const transfers = parseTransferSet(plainText.slice(EXPLORER_TEXT_TRANSFER_PREFIX.length));
    if (transfers) {
      return transfers;
    }
  }

  const html = dataTransfer.getData('text/html');
  const htmlTransfers = parseHtmlTransferEnvelope(html);
  if (htmlTransfers) {
    return htmlTransfers;
  }
  const htmlDocumentTransfer = parseExplorerHtmlDocumentTransfer(html);
  if (htmlDocumentTransfer) {
    return [htmlDocumentTransfer];
  }

  const serializedLinks = dataTransfer.getData('text/uri-list') || plainText;
  if (serializedLinks) {
    try {
      const nodes = applyExternalHtmlTitles(
        parseExplorerText(serializedLinks, 'Dropped links').sources.explore,
        html
      );
      return asTransferSet(createExternalTransfer(nodes, 'external-urls'));
    } catch {
      if (plainText.trim()) {
        return asTransferSet(createExternalTransfer([createPortableTextNote(plainText)], 'external-text'));
      }
    }
  }

  const htmlNodes = parseExternalHtml(html);
  return htmlNodes.length > 0 ? asTransferSet(createExternalTransfer(htmlNodes, 'external-html')) : null;
}

function asTransferSet(transfer: ExplorerTransfer | null): ExplorerTransferSet | null {
  return transfer ? [transfer] : null;
}

function parseExplorerHtmlDocumentTransfer(html: string): ExplorerTransfer | null {
  try {
    const document = parseExplorerHtmlDocument(html);
    const populatedSources = (['explore', 'bookmarks', 'history'] as const).flatMap((source) =>
      document.sources[source].length > 0 ? [{ source, nodes: document.sources[source] }] : []
    );
    const onlySource = populatedSources[0];
    if (populatedSources.length === 1 && onlySource) {
      return createExternalTransfer(onlySource.nodes, 'external-browser-atlas-html');
    }
    const nodes: PortableExplorerNode[] = populatedSources.map(({ source, nodes }) => ({
      kind: 'group',
      groupKind: 'folder',
      title: source[0]!.toLocaleUpperCase() + source.slice(1),
      children: [...nodes],
      defaultCollapsed: false
    }));
    return createExternalTransfer(nodes, 'external-browser-atlas-html');
  } catch {
    return null;
  }
}

function parseHtmlTransferEnvelope(html: string): ExplorerTransferSet | null {
  if (!html.startsWith(EXPLORER_HTML_TRANSFER_PREFIX)) {
    return null;
  }
  const suffixIndex = html.indexOf(EXPLORER_HTML_TRANSFER_SUFFIX, EXPLORER_HTML_TRANSFER_PREFIX.length);
  if (suffixIndex < 0) {
    return null;
  }
  try {
    const encoded = html.slice(EXPLORER_HTML_TRANSFER_PREFIX.length, suffixIndex);
    return parseTransferSet(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

function applyExternalHtmlTitles(
  nodes: readonly PortableExplorerNode[],
  html: string
): readonly PortableExplorerNode[] {
  const titles = new Map(parseExternalHtmlAnchors(html).map((anchor) => [anchor.url, anchor.title]));
  return nodes.map(applyTitle);

  function applyTitle(node: PortableExplorerNode): PortableExplorerNode {
    const children = node.children.map(applyTitle);
    if (node.kind !== 'link') {
      return { ...node, children };
    }
    return { ...node, title: titles.get(node.url) || node.title, children };
  }
}

function parseExternalHtml(html: string): readonly PortableExplorerNode[] {
  if (!html.trim()) {
    return [];
  }
  const anchors = parseExternalHtmlAnchors(html);
  if (anchors.length > 0) {
    return anchors.map((anchor) => ({
      kind: 'link',
      title: anchor.title,
      url: anchor.url,
      faviconUrl: null,
      description: anchor.title,
      children: [],
      defaultCollapsed: false
    }));
  }
  const document = new DOMParser().parseFromString(html, 'text/html');
  const text = document.body.textContent?.trim();
  return text ? [createPortableTextNote(text)] : [];
}

type ExternalHtmlAnchor = Readonly<{ title: string; url: string }>;

function parseExternalHtmlAnchors(html: string): readonly ExternalHtmlAnchor[] {
  if (!html.trim()) {
    return [];
  }
  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll('a[href]')].flatMap((anchor): readonly ExternalHtmlAnchor[] => {
    const url = anchor.getAttribute('href')?.trim();
    if (!url || !isSupportedExternalUrl(url)) {
      return [];
    }
    return [{ title: anchor.textContent?.trim() || url, url }];
  });
}

function isSupportedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return EXTERNAL_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function createExternalTransfer(
  nodes: readonly PortableExplorerNode[],
  nodeId: string
): ExplorerTransfer | null {
  const firstNode = nodes[0];
  if (!firstNode) {
    return null;
  }
  const item = nodes.length === 1
    ? firstNode
    : {
        kind: 'group',
        groupKind: 'folder',
        title: 'Dropped links',
        children: [...nodes],
        defaultCollapsed: false
      } satisfies PortableExplorerNode;
  return {
    format: 'browser-atlas-transfer',
    version: 2,
    origin: { kind: 'copy', backendId: 'external', nodeId, source: 'explore' },
    item,
    hasLinks: hasPortableLink(item)
  };
}

function parseTransferOrigin(value: unknown): ExplorerTransferOrigin | null {
  if (
    !isRecord(value) ||
    typeof value.kind !== 'string' ||
    typeof value.backendId !== 'string' ||
    typeof value.nodeId !== 'string'
  ) {
    return null;
  }
  if (value.kind === 'copy' && isExplorerSource(value.source)) {
    return { kind: 'copy', backendId: value.backendId, nodeId: value.nodeId, source: value.source };
  }
  if (value.kind === 'new-window') {
    return { kind: 'new-window', backendId: value.backendId, nodeId: value.nodeId };
  }
  if (value.kind === 'new-google-doc') {
    return { kind: 'new-google-doc', backendId: value.backendId, nodeId: value.nodeId };
  }
  if (
    value.kind === 'new-organizer' &&
    (value.itemKind === 'group' || value.itemKind === 'note' || value.itemKind === 'separator')
  ) {
    return {
      kind: 'new-organizer',
      backendId: value.backendId,
      nodeId: value.nodeId,
      itemKind: value.itemKind
    };
  }
  if (
    (value.kind === 'tab' ||
      value.kind === 'window' ||
      value.kind === 'bookmark' ||
      value.kind === 'saved' ||
      value.kind === 'document') &&
    typeof value.itemId === 'string' &&
    (typeof value.parentId === 'string' || value.parentId === null) &&
    typeof value.index === 'number' &&
    Number.isInteger(value.index) &&
    value.index >= 0
  ) {
    const positioned = {
      backendId: value.backendId,
      nodeId: value.nodeId,
      itemId: value.itemId,
      parentId: value.parentId,
      index: value.index
    };
    if (value.kind === 'document') {
      return isExplorerSource(value.source) ? { kind: 'document', ...positioned, source: value.source } : null;
    }
    if (value.kind === 'tab') {
      return { kind: 'tab', ...positioned };
    }
    if (value.kind === 'window') {
      return { kind: 'window', ...positioned };
    }
    return value.kind === 'bookmark'
      ? { kind: 'bookmark', ...positioned }
      : { kind: 'saved', ...positioned };
  }
  return null;
}

function importTargetSource(target: Extract<ExplorerCommand, { kind: 'import-items' }>['target']): ExplorerSourceId {
  switch (target.kind) {
    case 'window':
    case 'persistent':
      return 'explore';
    case 'bookmark-folder':
      return 'bookmarks';
    case 'document':
      return target.source;
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function deleteTargetSource(target: Extract<ExplorerCommand, { kind: 'delete-tree-item' }>['target']): ExplorerSourceId {
  switch (target.kind) {
    case 'live-tab':
    case 'live-window':
    case 'saved':
      return 'explore';
    case 'bookmark':
      return 'bookmarks';
    case 'document':
      return target.source;
    default: {
      const exhaustiveTarget: never = target;
      return exhaustiveTarget;
    }
  }
}

function hasPortableLink(node: PortableExplorerNode): boolean {
  return node.kind === 'link' || node.children.some(hasPortableLink);
}

function isExplorerSource(value: unknown): value is ExplorerSourceId {
  return value === 'explore' || value === 'bookmarks' || value === 'history';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function setTransferData(dataTransfer: DataTransfer, type: string, value: string): void {
  try {
    dataTransfer.setData(type, value);
  } catch {
    // The remaining MIME representations can still make the transfer usable.
  }
}
