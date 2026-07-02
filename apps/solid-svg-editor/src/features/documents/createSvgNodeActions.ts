import type { Accessor } from 'solid-js';

import { insertPathCommand, optimizeNode } from '../../editor/tree-utils';
import type { AppSettings } from '../../editor/types';
import { formatPathData, parsePathData } from '../../path-data';
import { isValidChild, type RecognizedElement } from '../../svg-db';
import {
  appendChild,
  cloneWithFreshIds,
  createDefaultElement,
  createId,
  findNode,
  getAttribute,
  insertSibling,
  moveNode,
  moveNodesTo,
  removeAttribute,
  removeNode,
  setAttribute,
  updateNode,
  type DropPosition,
  type SvgElementNode,
  type SvgNode
} from '../../svg-model';
import type { PathCommandSelection } from '../selection/createEditorSelection';

export function createSvgNodeActions(options: {
  readonly settings: Accessor<AppSettings>;
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedNodes: Accessor<readonly SvgNode[]>;
  readonly selectedPathCommand: Accessor<PathCommandSelection | undefined>;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setSelectionPivot: (id: string | undefined) => void;
  readonly setSelectedPathCommand: (selection: PathCommandSelection | undefined) => void;
  readonly clearSelection: () => void;
  readonly mutateRoot: (updater: (root: SvgElementNode) => SvgElementNode, push?: boolean) => void;
}) {
  function selectedEditableIds(): readonly string[] {
    return options.selectedIds().filter((id) => id !== options.activeRoot().id);
  }

  function deleteSelected(): void {
    const ids = selectedEditableIds();

    if (ids.length === 0) {
      return;
    }

    options.mutateRoot((root) => ids.reduce((next, id) => removeNode(next, id), root));
    options.clearSelection();
  }

  function duplicateSelected(): void {
    const ids = selectedEditableIds();

    if (ids.length === 0) {
      return;
    }

    options.mutateRoot((root) => {
      let next = root;

      for (const id of ids) {
        const node = findNode(next, id);

        if (node) {
          next = insertSibling(next, id, cloneWithFreshIds(node), true);
        }
      }

      return next;
    });
  }

  function moveSelected(direction: -1 | 1): void {
    const ids = selectedEditableIds();

    if (ids.length === 0) {
      return;
    }

    options.mutateRoot((root) => ids.reduce((next, id) => moveNode(next, id, direction), root));
  }

  function reorderInspectorNodes(nodeIds: readonly string[], targetId: string, position: DropPosition): void {
    const ids = nodeIds.filter((id) => id !== options.activeRoot().id);

    if (ids.length === 0) {
      return;
    }

    options.mutateRoot((root) => moveNodesTo(root, ids, targetId, position));
    options.setSelectedIds(ids);
    options.setSelectionPivot(ids[ids.length - 1]);
    options.setSelectedPathCommand(undefined);
  }

  function addElement(name: RecognizedElement | string): void {
    const selectedElement = options.selectedNodes().find((node): node is SvgElementNode => node.kind === 'element');
    const root = options.activeRoot();
    const parent = selectedElement && isValidChild(selectedElement.name, name) ? selectedElement : root;
    const child = createDefaultElement(name);
    options.mutateRoot((item) => appendChild(item, parent.id, child));
    options.setSelectedIds([child.id]);
  }

  function addTextNode(kind: 'text' | 'comment' | 'cdata'): void {
    const selectedElement =
      options.selectedNodes().find((node): node is SvgElementNode => node.kind === 'element') ?? options.activeRoot();
    const text = kind === 'comment' ? ' Comment ' : '';
    const child = { id: createId(), kind, text } satisfies SvgNode;
    options.mutateRoot((item) => appendChild(item, selectedElement.id, child));
    options.setSelectedIds([child.id]);
  }

  function updateElementAttribute(nodeId: string, name: string, value: string): void {
    options.mutateRoot((root) =>
      updateNode(root, nodeId, (node) => {
        if (node.kind !== 'element') {
          return node;
        }

        return setAttribute(node, name, value);
      })
    );
  }

  function removeElementAttribute(nodeId: string, name: string): void {
    options.mutateRoot((root) =>
      updateNode(root, nodeId, (node) => {
        if (node.kind !== 'element') {
          return node;
        }

        return removeAttribute(node, name);
      })
    );
  }

  function updateBasicNodeText(nodeId: string, text: string): void {
    options.mutateRoot((root) =>
      updateNode(root, nodeId, (node) => {
        if (node.kind === 'text' || node.kind === 'comment' || node.kind === 'cdata') {
          return { ...node, text };
        }

        return node;
      })
    );
  }

  function optimizeActive(): void {
    options.mutateRoot((root) => optimizeRoot(root, options.settings()));
  }

  function insertPathCommandFromKey(key: string, absolute: boolean): void {
    const selected = options.selectedPathCommand();

    if (!selected) {
      return;
    }

    const command = absolute ? key.toUpperCase() : key.toLowerCase();
    options.mutateRoot((root) =>
      updateNode(root, selected.nodeId, (node) => {
        if (node.kind !== 'element') {
          return node;
        }

        const commands = parsePathData(getAttribute(node, 'd', true));
        const nextCommands = insertPathCommand(commands, selected.index, command);
        return setAttribute(node, 'd', formatPathData(nextCommands));
      })
    );
    options.setSelectedPathCommand({ nodeId: selected.nodeId, index: selected.index + 1 });
  }

  return {
    deleteSelected,
    duplicateSelected,
    moveSelected,
    reorderInspectorNodes,
    addElement,
    addTextNode,
    updateElementAttribute,
    removeElementAttribute,
    updateBasicNodeText,
    optimizeActive,
    insertPathCommandFromKey
  };
}

function optimizeRoot(root: SvgElementNode, settings: AppSettings): SvgElementNode {
  const optimized = optimizeNode(root, settings.optimizer);
  return optimized?.kind === 'element' ? optimized : root;
}
