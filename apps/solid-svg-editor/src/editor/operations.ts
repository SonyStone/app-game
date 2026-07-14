import type { EditorCommand, EditorCommandId } from './commands';
import { svgCapabilities, type SvgCapabilityRegistry } from './capabilities';
import {
  findNode,
  moveNode,
  moveNodesTo,
  removeAttribute,
  removeNode,
  setAttribute,
  updateNode,
  cloneRoot,
  type DropPosition,
  type SvgElementNode,
  type SvgNode,
  type SvgNodeId
} from '../svg-model';

export type EditorOperation =
  | {
      readonly kind: 'svg.replace-root';
      readonly root: SvgElementNode;
    }
  | {
      readonly kind: 'svg.set-attribute';
      readonly nodeId: SvgNodeId;
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly kind: 'svg.remove-attribute';
      readonly nodeId: SvgNodeId;
      readonly name: string;
    }
  | {
      readonly kind: 'svg.insert-node';
      readonly parentId: SvgNodeId;
      readonly index: number;
      readonly node: SvgNode;
    }
  | {
      readonly kind: 'svg.remove-node';
      readonly nodeId: SvgNodeId;
    }
  | {
      readonly kind: 'svg.move-node-in-parent';
      readonly nodeId: SvgNodeId;
      readonly direction: -1 | 1;
    }
  | {
      readonly kind: 'svg.move-nodes';
      readonly nodeIds: readonly SvgNodeId[];
      readonly targetId: SvgNodeId;
      readonly position: DropPosition;
    }
  | {
      readonly kind: 'svg.restore-node-locations';
      readonly locations: readonly SvgNodeRestoreLocation[];
    }
  | {
      readonly kind: 'svg.update-text-node';
      readonly nodeId: SvgNodeId;
      readonly text: string;
    };

export interface SvgNodeLocation {
  readonly parent: SvgElementNode;
  readonly node: SvgNode;
  readonly index: number;
}

export interface SvgNodeRestoreLocation {
  readonly nodeId: SvgNodeId;
  readonly parentId: SvgNodeId;
  readonly index: number;
}

export interface OperationBackedEditorCommand extends EditorCommand {
  readonly durability: { readonly kind: 'operation' };
  readonly resolveOperations: (root: SvgElementNode) => readonly EditorOperation[];
}

export type OperationCapabilityIndex = Pick<SvgCapabilityRegistry, 'isValidChild'>;

export interface OperationCommandConfig {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly mergeKey?: string;
  readonly operations: readonly EditorOperation[] | ((root: SvgElementNode) => readonly EditorOperation[]);
  readonly invert?: EditorCommand['invert'];
  readonly merge?: EditorCommand['merge'];
}

export function createOperationCommand(config: OperationCommandConfig): OperationBackedEditorCommand {
  const operations = config.operations;
  const resolveOperations: (root: SvgElementNode) => readonly EditorOperation[] =
    typeof operations === 'function' ? operations : () => operations;

  return {
    id: config.id,
    label: config.label,
    durability: { kind: 'operation' },
    ...(config.mergeKey ? { mergeKey: config.mergeKey } : {}),
    resolveOperations,
    apply: (root) => applyEditorOperations(root, resolveOperations(root)),
    ...(config.invert ? { invert: config.invert } : {}),
    ...(config.merge ? { merge: config.merge } : {})
  } satisfies OperationBackedEditorCommand;
}

export function isOperationBackedEditorCommand(command: EditorCommand): command is OperationBackedEditorCommand {
  const candidate = command as { readonly resolveOperations?: unknown };
  return typeof candidate.resolveOperations === 'function';
}

export function toSvgNodeId(id: string): SvgNodeId {
  return id as SvgNodeId;
}

export function applyEditorOperations(
  root: SvgElementNode,
  operations: readonly EditorOperation[],
  capabilities: OperationCapabilityIndex = svgCapabilities
): SvgElementNode {
  return operations.reduce((currentRoot, operation) => applyEditorOperation(currentRoot, operation, capabilities), root);
}

export function applyEditorOperation(
  root: SvgElementNode,
  operation: EditorOperation,
  capabilities: OperationCapabilityIndex = svgCapabilities
): SvgElementNode {
  switch (operation.kind) {
    case 'svg.replace-root':
      return cloneRoot(operation.root);
    case 'svg.set-attribute':
      return updateNode(root, operation.nodeId, (node) => {
        if (node.kind !== 'element') {
          return node;
        }

        return setAttribute(node, operation.name, operation.value);
      });
    case 'svg.remove-attribute':
      return updateNode(root, operation.nodeId, (node) => {
        if (node.kind !== 'element') {
          return node;
        }

        return removeAttribute(node, operation.name);
      });
    case 'svg.insert-node':
      return insertNodeAt(root, operation.parentId, operation.node, operation.index);
    case 'svg.remove-node':
      return removeNode(root, operation.nodeId);
    case 'svg.move-node-in-parent':
      return moveNode(root, operation.nodeId, operation.direction);
    case 'svg.move-nodes':
      return moveNodesTo(root, operation.nodeIds, operation.targetId, operation.position, capabilities.isValidChild);
    case 'svg.restore-node-locations':
      return restoreNodeLocations(root, operation.locations);
    case 'svg.update-text-node':
      return updateNode(root, operation.nodeId, (node) => {
        if (node.kind === 'text' || node.kind === 'comment' || node.kind === 'cdata') {
          return { ...node, text: operation.text };
        }

        return node;
      });
  }
}

export function invertEditorOperation(
  beforeRoot: SvgElementNode,
  operation: EditorOperation
): readonly EditorOperation[] | undefined {
  switch (operation.kind) {
    case 'svg.replace-root':
      return [{ kind: 'svg.replace-root', root: cloneRoot(beforeRoot) }];
    case 'svg.set-attribute': {
      const node = findNode(beforeRoot, operation.nodeId);

      if (!node || node.kind !== 'element') {
        return undefined;
      }

      const previous = node.attrs.find((attr) => attr.name === operation.name);
      return previous
        ? [{ kind: 'svg.set-attribute', nodeId: operation.nodeId, name: operation.name, value: previous.value }]
        : [{ kind: 'svg.remove-attribute', nodeId: operation.nodeId, name: operation.name }];
    }
    case 'svg.remove-attribute': {
      const node = findNode(beforeRoot, operation.nodeId);

      if (!node || node.kind !== 'element') {
        return undefined;
      }

      const previous = node.attrs.find((attr) => attr.name === operation.name);
      return previous
        ? [{ kind: 'svg.set-attribute', nodeId: operation.nodeId, name: operation.name, value: previous.value }]
        : [];
    }
    case 'svg.insert-node':
      return [{ kind: 'svg.remove-node', nodeId: operation.node.id }];
    case 'svg.remove-node': {
      const location = findNodeLocation(beforeRoot, operation.nodeId);
      return location
        ? [
            {
              kind: 'svg.insert-node',
              parentId: location.parent.id,
              index: location.index,
              node: location.node
            }
          ]
        : undefined;
    }
    case 'svg.move-node-in-parent':
      return [{ ...operation, direction: operation.direction === 1 ? -1 : 1 }];
    case 'svg.move-nodes':
      return restoreNodeLocationOperations(beforeRoot, operation.nodeIds);
    case 'svg.restore-node-locations':
      return restoreNodeLocationOperations(
        beforeRoot,
        operation.locations.map((location) => location.nodeId)
      );
    case 'svg.update-text-node': {
      const node = findNode(beforeRoot, operation.nodeId);
      return node && (node.kind === 'text' || node.kind === 'comment' || node.kind === 'cdata')
        ? [{ kind: 'svg.update-text-node', nodeId: operation.nodeId, text: node.text }]
        : undefined;
    }
  }
}

export function mergeEditorOperation(
  previous: EditorOperation,
  next: EditorOperation
): EditorOperation | undefined {
  if (previous.kind === 'svg.replace-root' && next.kind === 'svg.replace-root') {
    return next;
  }

  if (
    previous.kind === 'svg.set-attribute' &&
    next.kind === 'svg.set-attribute' &&
    previous.nodeId === next.nodeId &&
    previous.name === next.name
  ) {
    return next;
  }

  if (
    previous.kind === 'svg.update-text-node' &&
    next.kind === 'svg.update-text-node' &&
    previous.nodeId === next.nodeId
  ) {
    return next;
  }

  return undefined;
}

export function findNodeLocation(root: SvgElementNode, id: string): SvgNodeLocation | undefined {
  return findNodeLocationInChildren(root, root.children, id);
}

function insertNodeAt(root: SvgElementNode, parentId: SvgNodeId, nodeToInsert: SvgNode, index: number): SvgElementNode {
  if (findNode(root, nodeToInsert.id)) {
    return root;
  }

  return updateNode(root, parentId, (node) => {
    if (node.kind !== 'element') {
      return node;
    }

    const children = [...node.children];
    children.splice(clampIndex(index, children.length), 0, nodeToInsert);
    return { ...node, children, expanded: true };
  });
}

function restoreNodeLocationOperations(
  root: SvgElementNode,
  nodeIds: readonly SvgNodeId[]
): readonly EditorOperation[] | undefined {
  const locations = snapshotNodeRestoreLocations(root, nodeIds);

  if (!locations) {
    return undefined;
  }

  return [{ kind: 'svg.restore-node-locations', locations }];
}

function snapshotNodeRestoreLocations(
  root: SvgElementNode,
  nodeIds: readonly SvgNodeId[]
): readonly SvgNodeRestoreLocation[] | undefined {
  const movingIds = topLevelOperationNodeIds(root, nodeIds).filter((id) => id !== root.id);
  const locations: SvgNodeRestoreLocation[] = [];

  for (const id of movingIds) {
    const location = findNodeLocation(root, id);

    if (!location) {
      return undefined;
    }

    locations.push({
      nodeId: location.node.id,
      parentId: location.parent.id,
      index: location.index
    });
  }

  return locations;
}

function restoreNodeLocations(
  root: SvgElementNode,
  locations: readonly SvgNodeRestoreLocation[]
): SvgElementNode {
  const uniqueLocations = uniqueNodeLocations(locations);

  if (uniqueLocations.length === 0) {
    return root;
  }

  const nodesById = new Map<SvgNodeId, SvgNode>();

  for (const location of uniqueLocations) {
    if (location.nodeId === root.id) {
      return root;
    }

    const node = findNode(root, location.nodeId);
    const parent = findNode(root, location.parentId);

    if (!node || !parent || parent.kind !== 'element' || nodeContainsId(node, location.parentId)) {
      return root;
    }

    nodesById.set(location.nodeId, node);
  }

  const withoutMoving = uniqueLocations.reduce(
    (currentRoot, location) => removeNode(currentRoot, location.nodeId),
    root
  );
  let nextRoot = withoutMoving;

  for (const group of groupLocationsByParent(uniqueLocations).values()) {
    const sortedGroup = [...group].sort((first, second) => first.index - second.index);

    for (const location of sortedGroup) {
      const parent = findNode(nextRoot, location.parentId);
      const node = nodesById.get(location.nodeId);

      if (!node || !parent || parent.kind !== 'element') {
        return root;
      }

      nextRoot = insertNodeAt(nextRoot, location.parentId, node, location.index);
    }
  }

  return nextRoot;
}

function uniqueNodeLocations(locations: readonly SvgNodeRestoreLocation[]): readonly SvgNodeRestoreLocation[] {
  const seen = new Set<SvgNodeId>();
  const uniqueLocations: SvgNodeRestoreLocation[] = [];

  for (const location of locations) {
    if (seen.has(location.nodeId)) {
      continue;
    }

    seen.add(location.nodeId);
    uniqueLocations.push(location);
  }

  return uniqueLocations;
}

function groupLocationsByParent(
  locations: readonly SvgNodeRestoreLocation[]
): Map<SvgNodeId, readonly SvgNodeRestoreLocation[]> {
  const groups = new Map<SvgNodeId, SvgNodeRestoreLocation[]>();

  for (const location of locations) {
    const group = groups.get(location.parentId);

    if (group) {
      group.push(location);
      continue;
    }

    groups.set(location.parentId, [location]);
  }

  return groups;
}

function topLevelOperationNodeIds(root: SvgElementNode, ids: readonly SvgNodeId[]): readonly SvgNodeId[] {
  const selected = new Set<SvgNodeId>(ids);
  const ordered: SvgNodeId[] = [];

  function visit(node: SvgNode, selectedAncestor: boolean): void {
    const isSelected = selected.has(node.id);

    if (isSelected && !selectedAncestor) {
      ordered.push(node.id);
    }

    if (node.kind !== 'element') {
      return;
    }

    for (const child of node.children) {
      visit(child, selectedAncestor || isSelected);
    }
  }

  visit(root, false);
  return ordered;
}

function nodeContainsId(node: SvgNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }

  if (node.kind !== 'element') {
    return false;
  }

  return node.children.some((child) => nodeContainsId(child, id));
}

function findNodeLocationInChildren(
  parent: SvgElementNode,
  nodes: readonly SvgNode[],
  id: string
): SvgNodeLocation | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (!node) {
      continue;
    }

    if (node.id === id) {
      return { parent, node, index };
    }

    if (node.kind === 'element') {
      const found = findNodeLocationInChildren(node, node.children, id);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return length;
  }

  return Math.max(0, Math.min(Math.trunc(index), length));
}
