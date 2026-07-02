import { createMemo, createSignal, type Accessor } from 'solid-js';

import { flattenAllNodes } from '../../editor/tree-utils';
import { findNode, type SvgElementNode, type SvgNode } from '../../svg-model';

export type PathCommandSelection = { readonly nodeId: string; readonly index: number };

export function createEditorSelection(options: { readonly root: Accessor<SvgElementNode> }) {
  const [selectedIds, setSelectedIds] = createSignal<readonly string[]>([]);
  const [selectionPivot, setSelectionPivot] = createSignal<string | undefined>();
  const [selectedPathCommand, setSelectedPathCommand] = createSignal<PathCommandSelection | undefined>();

  const selectedNodes = createMemo(() =>
    selectedIds()
      .map((id) => findNode(options.root(), id))
      .filter((node): node is SvgNode => Boolean(node))
  );

  function selectNode(nodeId: string, event?: MouseEvent | PointerEvent): void {
    const flattened = flattenAllNodes(options.root()).map((node) => node.id);
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
        setSelectionPivot(nodeId);
      }
      return;
    }

    setSelectedIds([nodeId]);
    setSelectionPivot(nodeId);
    setSelectedPathCommand(undefined);
  }

  function clearSelection(): void {
    setSelectedIds([]);
    setSelectionPivot(undefined);
    setSelectedPathCommand(undefined);
  }

  function selectAll(): void {
    setSelectedIds(flattenAllNodes(options.root()).map((node) => node.id));
  }

  return {
    selectedIds,
    setSelectedIds,
    selectionPivot,
    setSelectionPivot,
    selectedPathCommand,
    setSelectedPathCommand,
    selectedNodes,
    selectNode,
    clearSelection,
    selectAll
  };
}
