import type { Accessor } from 'solid-js';

import { svgCapabilities } from '../../editor/capabilities';
import { createEditorCommand, type EditorCommand } from '../../editor/commands';
import { convertElement } from '../../editor/element-conversion';
import type { Point } from '../../editor/geometry';
import { createShapeAt, newShapeUnit, type newShapeNames } from '../../editor/new-shape';
import { optimizeNode } from '../../editor/tree-utils';
import type { AppSettings } from '../../editor/types';
import { formatPathData, formatPoints, parsePathData, parsePoints, type PathCommand } from '../../path-data';
import {
  deletePoints,
  insertPointsAfter,
  pointSelectionActions,
  reversePoints,
  setPointsOrigin,
  type PointList,
  type PointsEdit
} from '../../editor/point-selection';
import type { RecognizedElement } from '../../svg-db';
import {
  appendChild,
  cloneWithFreshIds,
  createDefaultElement,
  createId,
  findNode,
  getAttribute,
  insertSibling,
  moveNodesInParent,
  moveNodesTo,
  removeAttribute,
  removeNode,
  setAttribute,
  svgSize,
  topLevelNodeIds,
  updateNode,
  type DropPosition,
  type SvgElementNode,
  type SvgNode
} from '../../svg-model';
import {
  deleteCommands,
  insertCommandAfter,
  isWholeSubpaths,
  moveSubpaths,
  reverseSubpaths,
  setSubpathOrigins,
  type CommandSelection,
  type CommandsEdit
} from '../../editor/path-selection';

/** Node actions as returned by `createSvgNodeActions`, for typing the callbacks passed to inspector components. */
export type SvgNodeActions = ReturnType<typeof createSvgNodeActions>;

export function createSvgNodeActions(options: {
  readonly settings: Accessor<AppSettings>;
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedNodes: Accessor<readonly SvgNode[]>;
  readonly commandSelection: Accessor<CommandSelection | undefined>;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setSelectionPivot: (id: string | undefined) => void;
  readonly setCommandSelection: (selection: CommandSelection | undefined) => void;
  readonly clearSelection: () => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
}) {
  /** Selected nodes other than the root, without nodes whose ancestor is also selected, in document order. */
  function selectedEditableIds(): readonly string[] {
    const root = options.activeRoot();
    return topLevelNodeIds(root, options.selectedIds()).filter((id) => id !== root.id);
  }

  /** Deletes the selected path commands when there are any, otherwise the selected nodes. */
  function deleteSelected(): void {
    const commands = options.commandSelection();

    if (commands && commands.indices.length > 0 && isPointShape(selectedShapeName())) {
      editSelectedPoints('svg.delete-points', 'Delete points', (points) => deletePoints(points, commands.indices));
      return;
    }

    if (commands && commands.indices.length > 0) {
      editSelectedCommands('svg.delete-path-commands', 'Delete path commands', (items) => ({
        commands: deleteCommands(items, commands.indices),
        indices: []
      }));
      return;
    }

    const ids = selectedEditableIds();

    if (ids.length === 0) {
      return;
    }

    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.delete-selection',
        label: ids.length === 1 ? 'Delete node' : `Delete ${ids.length} nodes`,
        apply: (root) => ids.reduce((next, id) => removeNode(next, id), root)
      })
    );
    options.clearSelection();
  }

  function duplicateSelected(): void {
    const ids = selectedEditableIds();

    if (ids.length === 0) {
      return;
    }

    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.duplicate-selection',
        label: ids.length === 1 ? 'Duplicate node' : `Duplicate ${ids.length} nodes`,
        apply: (root) => {
          let next = root;

          for (const id of ids) {
            const node = findNode(next, id);

            if (node) {
              next = insertSibling(next, id, cloneWithFreshIds(node), true);
            }
          }

          return next;
        }
      })
    );
  }

  /** Moves selected whole subpaths among the path's subpaths, otherwise the selected nodes among their siblings. */
  function moveSelected(direction: -1 | 1): void {
    const commands = options.commandSelection();

    if (commands && commands.indices.length > 0) {
      editSelectedCommands('svg.move-subpaths', direction === -1 ? 'Move subpaths up' : 'Move subpaths down', (items) =>
        isWholeSubpaths(items, commands.indices) ? moveSubpaths(items, commands.indices, direction) : undefined
      );
      return;
    }

    const ids = selectedEditableIds();

    if (ids.length === 0) {
      return;
    }

    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.move-selection',
        label: direction === -1 ? 'Move selection up' : 'Move selection down',
        apply: (root) => moveNodesInParent(root, ids, direction)
      })
    );
  }

  function reorderInspectorNodes(nodeIds: readonly string[], targetId: string, position: DropPosition): void {
    const ids = nodeIds.filter((id) => id !== options.activeRoot().id);

    if (ids.length === 0) {
      return;
    }

    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.reorder-nodes',
        label: 'Reorder nodes',
        apply: (root) => moveNodesTo(root, ids, targetId, position)
      })
    );
    options.setSelectedIds(ids);
    options.setSelectionPivot(ids[ids.length - 1]);
    options.setCommandSelection(undefined);
  }

  function addElement(name: RecognizedElement | string): void {
    const selectedElement = options.selectedNodes().find((node): node is SvgElementNode => node.kind === 'element');
    const root = options.activeRoot();
    const parent = selectedElement && svgCapabilities.isValidChild(selectedElement.name, name) ? selectedElement : root;
    const child = createDefaultElement(name);
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.add-element',
        label: `Add ${name}`,
        apply: (item) => appendChild(item, parent.id, child)
      })
    );
    options.setSelectedIds([child.id]);
  }

  function addTextNode(kind: 'text' | 'comment' | 'cdata'): void {
    const selectedElement =
      options.selectedNodes().find((node): node is SvgElementNode => node.kind === 'element') ?? options.activeRoot();
    const text = kind === 'comment' ? ' Comment ' : '';
    const child = { id: createId(), kind, text } satisfies SvgNode;
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.add-text-node',
        label: `Add ${kind}`,
        apply: (item) => appendChild(item, selectedElement.id, child)
      })
    );
    options.setSelectedIds([child.id]);
  }

  /** Sets an attribute; pass `mergeKey` for continuous input that should undo as one step (see `EditorCommand`). */
  function updateElementAttribute(nodeId: string, name: string, value: string, mergeKey?: string): void {
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.set-attribute',
        label: `Set ${name}`,
        ...(mergeKey === undefined ? {} : { mergeKey }),
        apply: (root) =>
          updateNode(root, nodeId, (node) => {
            if (node.kind !== 'element') {
              return node;
            }

            return setAttribute(node, name, value);
          })
      })
    );
  }

  function removeElementAttribute(nodeId: string, name: string): void {
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.remove-attribute',
        label: `Remove ${name}`,
        apply: (root) =>
          updateNode(root, nodeId, (node) => {
            if (node.kind !== 'element') {
              return node;
            }

            return removeAttribute(node, name);
          })
      })
    );
  }

  /** Replaces the text of a text, comment, or CDATA node; `mergeKey` works as in `updateElementAttribute`. */
  function updateBasicNodeText(nodeId: string, text: string, mergeKey?: string): void {
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.update-text-node',
        label: 'Update text node',
        ...(mergeKey === undefined ? {} : { mergeKey }),
        apply: (root) =>
          updateNode(root, nodeId, (node) => {
            if (node.kind === 'text' || node.kind === 'comment' || node.kind === 'cdata') {
              return { ...node, text };
            }

            return node;
          })
      })
    );
  }

  /** Converts an element to another type with the same shape (see `convertElement`); does nothing when it cannot. */
  function convertNode(nodeId: string, target: string): void {
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.convert-element',
        label: `Convert to ${target}`,
        apply: (root) => {
          const node = findNode(root, nodeId);
          const converted = node?.kind === 'element' ? convertElement(node, target) : undefined;
          return converted ? updateNode(root, nodeId, () => converted) : root;
        }
      })
    );
  }

  /** Adds a GodSVG "New shape" at a canvas point, at the end of the document, and selects it. */
  function addShapeAt(name: (typeof newShapeNames)[number], point: Point): void {
    const root = options.activeRoot();
    const shape = createShapeAt(name, point, newShapeUnit(svgSize(root).viewBox));
    options.dispatchCommand(
      createEditorCommand({ id: 'svg.add-shape', label: `Add ${name}`, apply: (item) => appendChild(item, item.id, shape) })
    );
    options.setSelectedIds([shape.id]);
    options.setSelectionPivot(shape.id);
  }

  function optimizeActive(): void {
    const settings = options.settings();
    options.dispatchCommand(
      createEditorCommand({
        id: 'svg.optimize',
        label: 'Optimize SVG',
        apply: (root) => optimizeRoot(root, settings)
      })
    );
  }

  /** Reverses the direction of the selected whole subpaths (GodSVG "Reverse order"). */
  function reverseSelectedSubpaths(): void {
    const commands = options.commandSelection();
    const name = selectedShapeName();

    if (commands && isPointShape(name)) {
      editSelectedPoints('svg.reverse-points', 'Reverse points', (points) =>
        pointSelectionActions(name, points.length, commands.indices).reverse ? reversePoints(points) : undefined
      );
      return;
    }

    if (commands) {
      editSelectedCommands('svg.reverse-subpaths', 'Reverse subpaths', (items) =>
        isWholeSubpaths(items, commands.indices) ? reverseSubpaths(items, commands.indices) : undefined
      );
    }
  }

  /** Starts each closed subpath at its selected command's end point (GodSVG "Set as origin"). */
  function setSelectedAsOrigin(): void {
    const commands = options.commandSelection();
    const name = selectedShapeName();

    if (commands && isPointShape(name)) {
      editSelectedPoints('svg.set-point-origin', 'Set as initial', (points) => {
        const actions = pointSelectionActions(name, points.length, commands.indices);
        return actions.setOrigin && actions.setOriginEnabled ? setPointsOrigin(points, commands.indices[0] ?? 0) : undefined;
      });
      return;
    }

    if (commands) {
      editSelectedCommands('svg.set-path-origin', 'Set as origin', (items) => setSubpathOrigins(items, commands.indices));
    }
  }

  /**
   * Rewrites the `d` of the path whose commands are selected and moves the selection to the edited commands. An
   * edit that returns `undefined` does not apply.
   */
  function editSelectedCommands(id: `svg.${string}`, label: string, edit: (commands: readonly PathCommand[]) => CommandsEdit | undefined): void {
    const selection = options.commandSelection();
    const node = selection ? findNode(options.activeRoot(), selection.nodeId) : undefined;

    // Point selections of polygons and polylines go through `editSelectedPoints`.
    if (!selection || node?.kind !== 'element' || node.name !== 'path') {
      return;
    }

    const result = edit(parsePathData(getAttribute(node, 'd', true)));

    if (!result) {
      return;
    }

    options.dispatchCommand(
      createEditorCommand({
        id,
        label,
        apply: (root) =>
          updateNode(root, selection.nodeId, (item) =>
            item.kind === 'element' ? setAttribute(item, 'd', formatPathData(result.commands)) : item
          )
      })
    );
    options.setCommandSelection(
      result.indices.length > 0 ? { nodeId: selection.nodeId, indices: result.indices, pivot: result.indices[0] ?? 0 } : undefined
    );
  }

  /** The element name of the shape whose commands or points are selected. */
  function selectedShapeName(): string | undefined {
    const selection = options.commandSelection();
    const node = selection ? findNode(options.activeRoot(), selection.nodeId) : undefined;
    return node?.kind === 'element' ? node.name : undefined;
  }

  /** Rewrites the `points` of the polygon or polyline whose points are selected; `undefined` edits don't apply. */
  function editSelectedPoints(id: `svg.${string}`, label: string, edit: (points: PointList) => PointsEdit | undefined): void {
    const selection = options.commandSelection();
    const node = selection ? findNode(options.activeRoot(), selection.nodeId) : undefined;

    if (!selection || node?.kind !== 'element' || !isPointShape(node.name)) {
      return;
    }

    const result = edit(parsePoints(getAttribute(node, 'points', true)));

    if (!result) {
      return;
    }

    options.dispatchCommand(
      createEditorCommand({
        id,
        label,
        apply: (root) =>
          updateNode(root, selection.nodeId, (item) =>
            item.kind === 'element' ? setAttribute(item, 'points', formatPoints(result.points.map(([x, y]) => [x, y]))) : item
          )
      })
    );
    options.setCommandSelection(
      result.indices.length > 0 ? { nodeId: selection.nodeId, indices: result.indices, pivot: result.indices[0] ?? 0 } : undefined
    );
  }

  /** GodSVG's "Insert after" / "Insert multiple after" for a selected polygon or polyline point. */
  function insertPointsAfterSelection(count: number): void {
    const selection = options.commandSelection();

    if (selection?.indices.length === 1 && count > 0) {
      const index = selection.indices[0] ?? 0;
      editSelectedPoints('svg.insert-points', count === 1 ? 'Insert point' : `Insert ${count} points`, (points) =>
        insertPointsAfter(points, index, count)
      );
    }
  }

  /**
   * Inserts a command after the last selected one, as GodSVG's command keys do, and selects it. The new command
   * starts at zero length, so the rest of the path keeps its geometry.
   */
  function insertPathCommandFromKey(key: string, absolute: boolean): void {
    const selected = options.commandSelection();

    if (!selected || selected.indices.length === 0) {
      return;
    }

    const command = absolute ? key.toUpperCase() : key.toLowerCase();
    const after = Math.max(...selected.indices);
    editSelectedCommands('svg.insert-path-command', `Insert ${command} path command`, (items) => insertCommandAfter(items, after, command));
  }

  return {
    deleteSelected,
    duplicateSelected,
    moveSelected,
    reverseSelectedSubpaths,
    setSelectedAsOrigin,
    reorderInspectorNodes,
    addElement,
    addTextNode,
    updateElementAttribute,
    removeElementAttribute,
    updateBasicNodeText,
    convertNode,
    addShapeAt,
    optimizeActive,
    insertPathCommandFromKey,
    insertPointsAfterSelection
  };
}

function optimizeRoot(root: SvgElementNode, settings: AppSettings): SvgElementNode {
  const optimized = optimizeNode(root, settings.optimizer);
  return optimized?.kind === 'element' ? optimized : root;
}

function isPointShape(name: string | undefined): name is 'polygon' | 'polyline' {
  return name === 'polygon' || name === 'polyline';
}
