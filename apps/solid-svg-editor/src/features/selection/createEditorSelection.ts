import { createMemo, createRenderEffect, createSignal, type Accessor } from 'solid-js';

import { commandParameters, parsePathData } from '../../path-data';
import {
  nodeSelectionTarget,
  nodeIdsFromSelectionTargets,
  normalizeSelectionTargets,
  pathAnchorFromSelectionTargets,
  pathTargetFromSelectionTargets,
  type PathSelectionTarget,
  type SelectionTarget
} from '../../editor/selection-targets';
import { flattenAllNodes } from '../../editor/tree-utils';
import { findNode, getAttribute, type SvgElementNode, type SvgNode } from '../../svg-model';

export type { PathAnchorSelection, SelectionTarget } from '../../editor/selection-targets';

export function createEditorSelection(options: { readonly root: Accessor<SvgElementNode> }) {
  const [selectedTargetsState, setSelectedTargetsState] = createSignal<readonly SelectionTarget[]>([]);
  const [selectionPivotState, setSelectionPivotState] = createSignal<string | undefined>();
  const selectedTargets = createMemo(() => reconcileSelectionTargets(options.root(), selectedTargetsState()));
  const selectedIds = createMemo(() => nodeIdsFromSelectionTargets(selectedTargets()));
  const selectionPivot = createMemo(() => {
    const pivot = selectionPivotState();
    const ids = selectedIds();
    return pivot && ids.includes(pivot) ? pivot : ids.at(-1);
  });
  const selectedPathAnchor = createMemo(() => pathAnchorFromSelectionTargets(selectedTargets()));

  createRenderEffect(() => {
    const reconciled = reconcileSelectionTargets(options.root(), selectedTargetsState());

    if (!sameSelectionTargets(selectedTargetsState(), reconciled)) {
      setSelectedTargetsState(reconciled);
      setSelectionPivotState(nodeIdsFromSelectionTargets(reconciled).at(-1));
    }
  });

  const selectedNodes = createMemo(() =>
    selectedIds()
      .map((id) => findNode(options.root(), id))
      .filter((node): node is SvgNode => Boolean(node))
  );

  function selectNode(nodeId: string, event?: MouseEvent | PointerEvent): void {
    const flattened: readonly string[] = flattenAllNodes(options.root()).map((node) => node.id);
    const existing = selectedIds();

    if (event?.shiftKey && selectionPivot()) {
      const pivotIndex = flattened.indexOf(selectionPivot() ?? '');
      const currentIndex = flattened.indexOf(nodeId);

      if (pivotIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(pivotIndex, currentIndex);
        const end = Math.max(pivotIndex, currentIndex);
        setSelectedIds(flattened.slice(start, end + 1));
        return;
      }
    }

    if (event?.ctrlKey || event?.metaKey) {
      if (existing.includes(nodeId)) {
        setSelectedIds(existing.filter((id) => id !== nodeId));
      } else {
        setSelectedIds([...existing, nodeId]);
        setSelectionPivotState(nodeId);
      }
      return;
    }

    setSelectedTargetsState([nodeSelectionTarget(nodeId)]);
    setSelectionPivotState(nodeId);
  }

  function selectTarget(target: SelectionTarget, event?: MouseEvent | PointerEvent): void {
    switch (target.kind) {
      case 'node':
        selectNode(target.nodeId, event);
        return;
      case 'path-command':
        setPathSelectionTarget(target);
        return;
      case 'path-anchor':
        setPathSelectionTarget(target);
        return;
      default: {
        const exhaustive: never = target;
        throw new Error(`Unhandled selection target: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  function setSelectedTargets(targets: readonly SelectionTarget[]): void {
    const nodeIds = nodeIdsFromSelectionTargets(targets);
    setSelectedTargetsState(normalizeSelectionTargets(targets));
    setSelectionPivotState(nodeIds[nodeIds.length - 1]);
  }

  function setSelectedIds(ids: readonly string[]): void {
    setSelectedTargetsState(normalizeSelectionTargets([...ids.map(nodeSelectionTarget), ...currentPathTargetList()]));
  }

  function setPathSelectionTarget(target: PathSelectionTarget): void {
    setSelectedTargetsState(normalizeSelectionTargets([...selectedIds().map(nodeSelectionTarget), target]));
  }

  function currentPathTargetList(): readonly PathSelectionTarget[] {
    const pathTarget = pathTargetFromSelectionTargets(selectedTargets());
    return pathTarget ? [pathTarget] : [];
  }

  function clearSelection(): void {
    setSelectedTargetsState([]);
    setSelectionPivotState(undefined);
  }

  function selectAll(): void {
    setSelectedTargetsState(flattenAllNodes(options.root()).map((node) => nodeSelectionTarget(node.id)));
  }

  return {
    selectedIds,
    setSelectedIds,
    selectedTargets,
    setSelectedTargets,
    selectionPivot,
    setSelectionPivot: setSelectionPivotState,
    selectedPathAnchor,
    selectedNodes,
    selectNode,
    selectTarget,
    clearSelection,
    selectAll
  };
}

function reconcileSelectionTargets(
  root: SvgElementNode,
  targets: readonly SelectionTarget[]
): readonly SelectionTarget[] {
  return normalizeSelectionTargets(targets.filter((target) => selectionTargetExists(root, target)));
}

function selectionTargetExists(root: SvgElementNode, target: SelectionTarget): boolean {
  const node = findNode(root, target.nodeId);

  switch (target.kind) {
    case 'node':
      return node !== undefined;
    case 'path-command':
      return node?.kind === 'element' && node.name === 'path' && pathCommandExists(node, target.index);
    case 'path-anchor':
      return node?.kind === 'element' && node.name === 'path' && pathAnchorExists(node, target.commandIndex, target.parameter);
    default: {
      const exhaustive: never = target;
      throw new Error(`Unhandled selection target: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function pathCommandExists(node: SvgElementNode, commandIndex: number): boolean {
  return parsePathData(getAttribute(node, 'd', true))[commandIndex] !== undefined;
}

function pathAnchorExists(node: SvgElementNode, commandIndex: number, parameter: string): boolean {
  const command = parsePathData(getAttribute(node, 'd', true))[commandIndex];
  return command !== undefined && commandParameters(command.command).some((entry) => entry.name === parameter);
}

function sameSelectionTargets(
  first: readonly SelectionTarget[],
  second: readonly SelectionTarget[]
): boolean {
  return first.length === second.length && first.every((target, index) => sameSelectionTarget(target, second[index]));
}

function sameSelectionTarget(first: SelectionTarget, second: SelectionTarget | undefined): boolean {
  return second !== undefined && selectionTargetKey(first) === selectionTargetKey(second);
}

function selectionTargetKey(target: SelectionTarget): string {
  switch (target.kind) {
    case 'node':
      return `node:${target.nodeId}`;
    case 'path-command':
      return `path-command:${target.nodeId}:${target.index}`;
    case 'path-anchor':
      return `path-anchor:${target.nodeId}:${target.commandIndex}:${target.parameter}`;
    default: {
      const exhaustive: never = target;
      throw new Error(`Unhandled selection target: ${JSON.stringify(exhaustive)}`);
    }
  }
}
