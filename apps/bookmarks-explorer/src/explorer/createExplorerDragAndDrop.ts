import { createTreeDragAndDrop, type TreeDropEffect, type TreeDropPlacement } from '../tree-view/createTreeDragAndDrop';
import type { ExplorerCommand } from './backend';
import type { ExplorerSourceId, ExplorerTreeNode } from './model';
import type { PortableExplorerNode } from './portable';
import {
  createEmptyExplorerDocument,
  createPortableExplorerNode,
  parseExplorerText,
  parsePortableExplorerNode
} from './portable';

const EXPLORER_DRAG_DATA_TYPE = 'application/x-bookmarks-explorer-transfer+json';
const EXPLORER_TEXT_TRANSFER_PREFIX = 'bookmarks-explorer-transfer:v1\n';

/** Composes generic tree drag gestures with portable cross-backend explorer transfers. */
export function createExplorerDragAndDrop(props: {
  onCommand: (backendId: string, command: ExplorerCommand) => Promise<void>;
}) {
  const dragAndDrop = createTreeDragAndDrop<ExplorerDragNode, ExplorerTransfer, ExplorerDropTarget>({
    dataType: EXPLORER_DRAG_DATA_TYPE,
    createItem: ({ node, backendId }) => createTransfer(node, backendId),
    canDrag: ({ node }) => canDragNode(node),
    getItemLabel: (transfer) => transfer.item.title,
    serializeItem: JSON.stringify,
    parseItem: parseTransfer,
    additionalDataTypes: ['application/json', 'text/uri-list', 'text/plain'],
    writeItem: writeInteroperableTransfer,
    readItem: readInteroperableTransfer,
    resolveTarget: ({ node, backendId }, pointerRatio) => resolveDropTarget(node, backendId, pointerRatio),
    canDrop,
    getDropEffect,
    getPlacement: (target) => target.placement,
    onDrop: (transfer, target) => props.onCommand(target.backendId, createDropCommand(transfer, target)),
    formatError: (reason) => (reason instanceof Error ? reason.message : 'The explorer could not complete the drop.')
  });

  return {
    ...dragAndDrop,
    /** Native drag and drop properties bound to the backend rendering this node. */
    rowProps(node: ExplorerTreeNode, backendId: string) {
      return dragAndDrop.rowProps({ node, backendId });
    },
    /** Native drop events bound to a node without making the surface draggable. */
    dropZoneProps(node: ExplorerTreeNode, backendId: string) {
      return dragAndDrop.dropZoneProps({ node, backendId });
    },
    /** Whether a normalized node contains portable data that can be dragged. */
    canDrag(node: ExplorerTreeNode): boolean {
      return canDragNode(node);
    }
  } as const;
}

/** Collections affected by a successful command and requiring refresh. */
export function affectedSources(command: ExplorerCommand): readonly ExplorerSourceId[] {
  switch (command.kind) {
    case 'move-tab':
    case 'open-tab':
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
    default: {
      const exhaustiveCommand: never = command;
      return exhaustiveCommand;
    }
  }
}

type ExplorerDragNode = { node: ExplorerTreeNode; backendId: string };

type ExplorerTransfer = {
  format: 'bookmarks-explorer-transfer';
  version: 1;
  origin: ExplorerTransferOrigin;
  item: PortableExplorerNode;
  hasLinks: boolean;
};

type ExplorerTransferOrigin =
  | PositionedTransferOrigin<'tab'>
  | PositionedTransferOrigin<'bookmark'>
  | PositionedTransferOrigin<'document'> & { source: ExplorerSourceId }
  | { kind: 'copy'; backendId: string; nodeId: string; source: ExplorerSourceId };

type PositionedTransferOrigin<TKind extends 'tab' | 'bookmark' | 'document'> = {
  kind: TKind;
  backendId: string;
  nodeId: string;
  itemId: string;
  parentId: string | null;
  index: number;
};

type ExplorerDropTarget =
  | { backendId: string; nodeId: string; kind: 'tabs'; windowId: string; index: number; placement: TreeDropPlacement }
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
    };

function createTransfer(node: ExplorerTreeNode, backendId: string): ExplorerTransfer | null {
  if (!canDragNode(node)) {
    return null;
  }
  const item = createPortableExplorerNode(node);
  if (!item) {
    return null;
  }

  return {
    format: 'bookmarks-explorer-transfer',
    version: 1,
    origin: createTransferOrigin(node, backendId),
    item,
    hasLinks: hasPortableLink(item)
  };
}

function canDragNode(node: ExplorerTreeNode): node is Exclude<ExplorerTreeNode, { kind: 'message' }> {
  return node.kind !== 'message' && node.draggable && (node.kind === 'group' || node.url !== null);
}

function createTransferOrigin(node: Exclude<ExplorerTreeNode, { kind: 'message' }>, backendId: string): ExplorerTransferOrigin {
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
      case 'source':
      case 'window':
      case 'history-date':
      case 'fixture-group':
        return createCopyOrigin(node, backendId);
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

function resolveDropTarget(
  node: ExplorerTreeNode,
  backendId: string,
  pointerRatio: number
): ExplorerDropTarget | null {
  const siblingTarget = resolveSiblingTarget(node, backendId, pointerRatio);
  if (siblingTarget) {
    return siblingTarget;
  }
  if (node.kind === 'link' && node.reference.kind === 'document-link') {
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
    case 'source':
      return {
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
        return { backendId, nodeId: node.id, kind: 'tabs', windowId: node.reference.windowId, index, placement };
      case 'bookmark':
        return node.draggable
          ? { backendId, nodeId: node.id, kind: 'bookmarks', folderId: node.reference.folderId, index, placement }
          : null;
      case 'document-link':
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
      case 'history':
      case 'fixture-link':
        return null;
      default: {
        const exhaustiveReference: never = node.reference;
        return exhaustiveReference;
      }
    }
  }

  if (node.kind !== 'group' || pointerRatio >= 0.25 && pointerRatio <= 0.75) {
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
  return null;
}

function canDrop(transfer: ExplorerTransfer, target: ExplorerDropTarget): boolean {
  if (target.kind === 'tabs' && !transfer.hasLinks) {
    return false;
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

function getDropEffect(transfer: ExplorerTransfer, target: ExplorerDropTarget): TreeDropEffect {
  if (transfer.origin.backendId !== target.backendId) {
    return 'copy';
  }
  if (
    (transfer.origin.kind === 'tab' && target.kind === 'tabs') ||
    (transfer.origin.kind === 'bookmark' && target.kind === 'bookmarks') ||
    (transfer.origin.kind === 'document' && target.kind === 'document')
  ) {
    return 'move';
  }
  return 'copy';
}

function createDropCommand(transfer: ExplorerTransfer, target: ExplorerDropTarget): ExplorerCommand {
  if (transfer.origin.backendId === target.backendId) {
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
  }

  return {
    kind: 'import-items',
    target:
      target.kind === 'tabs'
        ? { kind: 'window', id: target.windowId }
        : target.kind === 'bookmarks'
          ? { kind: 'bookmark-folder', id: target.folderId }
          : { kind: 'document', source: target.source, parentId: target.parentId },
    index: target.index,
    items: [transfer.item]
  };
}

function adjustSameParentIndex(
  sourceParentId: string | null,
  sourceIndex: number,
  targetParentId: string,
  targetIndex: number
): number {
  return sourceParentId === targetParentId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

function parseTransfer(serialized: string): ExplorerTransfer | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.format !== 'bookmarks-explorer-transfer' || value.version !== 1) {
      return null;
    }
    const origin = parseTransferOrigin(value.origin);
    if (!origin) {
      return null;
    }
    const item = parsePortableExplorerNode(value.item);
    return {
      format: 'bookmarks-explorer-transfer',
      version: 1,
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
  transfer: ExplorerTransfer,
  serializedTransfer: string
): () => void {
  setTransferData(dataTransfer, 'application/json', serializedTransfer);
  setTransferData(dataTransfer, 'text/plain', `${EXPLORER_TEXT_TRANSFER_PREFIX}${serializedTransfer}`);
  const download = createDownload(transfer);
  setTransferData(dataTransfer, 'DownloadURL', download.value);
  // Publishing text/uri-list makes Chrome treat an internal tree drag as a web-link drag and offer split view.
  return download.release;
}

function createDownload(transfer: ExplorerTransfer): { value: string; release: () => void } {
  const document = createEmptyExplorerDocument(transfer.item.title);
  document.sources[transferSource(transfer.origin)] = [transfer.item];
  const filename = `${safeTransferFilename(transfer.item.title)}.bookmarks-explorer.json`;
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' }));
  return {
    value: `application/json:${filename}:${objectUrl}`,
    release: () => URL.revokeObjectURL(objectUrl)
  };
}

function transferSource(origin: ExplorerTransferOrigin): ExplorerSourceId {
  switch (origin.kind) {
    case 'tab':
      return 'explore';
    case 'bookmark':
      return 'bookmarks';
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
  return filename || 'bookmarks-explorer-item';
}

function readInteroperableTransfer(dataTransfer: DataTransfer): ExplorerTransfer | null {
  const serializedJson = dataTransfer.getData('application/json');
  if (serializedJson) {
    const transfer = parseTransfer(serializedJson);
    if (transfer) {
      return transfer;
    }
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText.startsWith(EXPLORER_TEXT_TRANSFER_PREFIX)) {
    const transfer = parseTransfer(plainText.slice(EXPLORER_TEXT_TRANSFER_PREFIX.length));
    if (transfer) {
      return transfer;
    }
  }

  const serializedLinks = dataTransfer.getData('text/uri-list') || plainText;
  if (!serializedLinks) {
    return null;
  }
  try {
    const nodes = parseExplorerText(serializedLinks, 'Dropped links').sources.explore;
    const firstNode = nodes[0];
    const item =
      nodes.length === 1 && firstNode
        ? firstNode
        : ({
            kind: 'group',
            groupKind: 'folder',
            title: 'Dropped links',
            children: nodes,
            defaultCollapsed: false
          } satisfies PortableExplorerNode);
    return {
      format: 'bookmarks-explorer-transfer',
      version: 1,
      origin: { kind: 'copy', backendId: 'external', nodeId: 'external-urls', source: 'explore' },
      item,
      hasLinks: hasPortableLink(item)
    };
  } catch {
    return null;
  }
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
  if (
    (value.kind === 'tab' || value.kind === 'bookmark' || value.kind === 'document') &&
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
    return value.kind === 'tab' ? { kind: 'tab', ...positioned } : { kind: 'bookmark', ...positioned };
  }
  return null;
}

function importTargetSource(target: Extract<ExplorerCommand, { kind: 'import-items' }>['target']): ExplorerSourceId {
  switch (target.kind) {
    case 'window':
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
