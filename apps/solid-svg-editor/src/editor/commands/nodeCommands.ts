import {
  cloneWithFreshIds,
  createId,
  findNode,
  type DropPosition,
  type SvgElementNode,
  type SvgNode
} from '../../svg-model';
import type { EditorCommandId } from '../commands';
import {
  applyEditorOperation,
  createOperationCommand,
  findNodeLocation,
  toSvgNodeId,
  type EditorOperation,
  type OperationBackedEditorCommand
} from '../operations';

export interface AddElementCapabilityIndex {
  readonly isValidChild: (parentName: string, childName: string) => boolean;
  readonly createElement: (name: string) => SvgElementNode;
}

export interface InsertedNodeCommand {
  readonly command: OperationBackedEditorCommand;
  readonly nodeId: string;
}

export function createDeleteNodesCommand(ids: readonly string[]): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.delete-selection',
    label: ids.length === 1 ? 'Delete node' : `Delete ${ids.length} nodes`,
    operations: ids.map((id) => ({ kind: 'svg.remove-node', nodeId: toSvgNodeId(id) }))
  });
}

export function createDuplicateNodesCommand(
  root: SvgElementNode,
  ids: readonly string[]
): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.duplicate-selection',
    label: ids.length === 1 ? 'Duplicate node' : `Duplicate ${ids.length} nodes`,
    operations: duplicateNodeOperations(root, ids)
  });
}

export function createAddElementCommand(options: {
  readonly root: SvgElementNode;
  readonly selectedNodes: readonly SvgNode[];
  readonly name: string;
  readonly capabilities: AddElementCapabilityIndex;
}): InsertedNodeCommand {
  const selectedElement = options.selectedNodes.find((node): node is SvgElementNode => node.kind === 'element');
  const parent =
    selectedElement && options.capabilities.isValidChild(selectedElement.name, options.name)
      ? selectedElement
      : options.root;
  const node = options.capabilities.createElement(options.name);

  return {
    nodeId: node.id,
    command: createInsertNodeCommand({ id: 'svg.add-element', parent, node, label: `Add ${options.name}` })
  };
}

export function createAddTextNodeCommand(options: {
  readonly root: SvgElementNode;
  readonly selectedNodes: readonly SvgNode[];
  readonly kind: 'text' | 'comment' | 'cdata';
}): InsertedNodeCommand {
  const parent =
    options.selectedNodes.find((node): node is SvgElementNode => node.kind === 'element') ?? options.root;
  const text = options.kind === 'comment' ? ' Comment ' : '';
  const node = { id: createId(), kind: options.kind, text } satisfies SvgNode;

  return {
    nodeId: node.id,
    command: createInsertNodeCommand({
      id: 'svg.add-text-node',
      parent,
      node,
      label: `Add ${options.kind}`
    })
  };
}

export function createMoveNodesInParentCommand(
  ids: readonly string[],
  direction: -1 | 1
): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.move-selection',
    label: direction === -1 ? 'Move selection up' : 'Move selection down',
    operations: moveNodesInParentOperations(ids, direction)
  });
}

export function moveNodesInParentOperations(
  ids: readonly string[],
  direction: -1 | 1
): readonly EditorOperation[] {
  return ids.map((id) => ({
    kind: 'svg.move-node-in-parent',
    nodeId: toSvgNodeId(id),
    direction
  }));
}

export function createReorderNodesCommand(
  ids: readonly string[],
  targetId: string,
  position: DropPosition
): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.reorder-nodes',
    label: 'Reorder nodes',
    operations: [
      {
        kind: 'svg.move-nodes',
        nodeIds: ids.map(toSvgNodeId),
        targetId: toSvgNodeId(targetId),
        position
      }
    ]
  });
}

export function createInsertNodeCommand(options: {
  readonly id?: EditorCommandId;
  readonly parent: SvgElementNode;
  readonly node: SvgNode;
  readonly label: string;
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: options.id ?? 'svg.insert-node',
    label: options.label,
    operations: [
      {
        kind: 'svg.insert-node',
        parentId: options.parent.id,
        index: options.parent.children.length,
        node: options.node
      }
    ]
  });
}

export function createInsertNodeAfterCommand(options: {
  readonly id?: EditorCommandId;
  readonly root: SvgElementNode;
  readonly targetId: string;
  readonly node: SvgNode;
  readonly label: string;
}): OperationBackedEditorCommand {
  return createOperationCommand({
    id: options.id ?? 'svg.insert-node-after',
    label: options.label,
    operations: insertNodeAfterOperations(options.root, options.targetId, options.node)
  });
}

export function insertNodeAfterOperations(
  root: SvgElementNode,
  targetId: string,
  node: SvgNode
): readonly EditorOperation[] {
  const location = findNodeLocation(root, targetId);

  return location
    ? [
        {
          kind: 'svg.insert-node',
          parentId: location.parent.id,
          index: location.index + 1,
          node
        }
      ]
    : [];
}

export function createUpdateTextNodeCommand(nodeId: string, text: string): OperationBackedEditorCommand {
  return createOperationCommand({
    id: 'svg.update-text-node',
    label: 'Update text node',
    mergeKey: `svg.update-text-node:${nodeId}`,
    operations: [{ kind: 'svg.update-text-node', nodeId: toSvgNodeId(nodeId), text }]
  });
}

export function duplicateNodeOperations(root: SvgElementNode, ids: readonly string[]): readonly EditorOperation[] {
  const operations: EditorOperation[] = [];
  let nextRoot = root;

  for (const id of ids) {
    const node = findNode(nextRoot, id);
    const location = findNodeLocation(nextRoot, id);

    if (!node || !location) {
      continue;
    }

    const operation = {
      kind: 'svg.insert-node',
      parentId: location.parent.id,
      index: location.index + 1,
      node: cloneWithFreshIds(node)
    } satisfies EditorOperation;
    operations.push(operation);
    nextRoot = applyEditorOperation(nextRoot, operation);
  }

  return operations;
}
