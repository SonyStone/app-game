import { createMemo, createSignal } from 'solid-js';
import type { TreeViewItem, TreeViewModel } from './createTreeView';

/**
 * Tracks the path from the tree's root to one target row, so connector lines can light it up: the
 * row under the pointer, or, while the pointer is over no row and keyboard focus is inside the
 * tree, the fallback row (such as the keyboard-focused one). Hover is read from `data-node-id` on
 * `TreeView` rows; the pointer and focus handlers belong on the scrolling element.
 */
export function createTreePathHighlight<T>(props: {
  /** Headless tree whose visible rows form the path. */
  tree: TreeViewModel<T>;
  /** Target row ID while the pointer is over no row and focus is inside the tree, or `null` for none. */
  fallbackTarget: () => string | null;
  /** Whether a path is shown at all. Defaults to `true`. */
  enabled?: () => boolean;
}) {
  const [hoveredId, setHoveredId] = createSignal<string | null>(null);
  const [focusInside, setFocusInside] = createSignal(false);
  const target = createMemo((): Readonly<{ id: string; source: TreePathSource }> | null => {
    if (props.enabled?.() === false) {
      return null;
    }

    const hovered = hoveredId();
    if (hovered !== null) {
      return { id: hovered, source: 'hover' };
    }
    const focused = focusInside() ? props.fallbackTarget() : null;
    return focused === null ? null : { id: focused, source: 'focus' };
  });
  const visibleIndexById = createMemo(
    () => new Map(props.tree.visibleItems().map((item, index) => [item.id, index] as const))
  );
  const path = createMemo((): TreePath | null => {
    const targetId = target()?.id;
    const items = props.tree.visibleItems();
    const targetIndex = targetId === undefined ? undefined : visibleIndexById().get(targetId);
    const targetRow = targetIndex === undefined ? undefined : items[targetIndex];
    if (targetIndex === undefined || !targetRow) {
      return null;
    }

    const indexByDepth = new Map([[targetRow.depth, targetIndex]]);
    let depth = targetRow.depth;
    for (let index = targetIndex - 1; index >= 0 && depth > 0; index -= 1) {
      const candidate = items[index];
      if (candidate && candidate.depth < depth) {
        depth = candidate.depth;
        indexByDepth.set(depth, index);
      }
    }
    return { indexByDepth };
  });

  return {
    /** How a row relates to the highlighted path; `'none'` while no path is shown. */
    state(item: TreeViewItem<T>): TreePathState {
      const current = path();
      if (!current) {
        return 'none';
      }

      const index = visibleIndexById().get(item.id);
      const pathIndex = current.indexByDepth.get(item.depth);
      if (index === undefined || pathIndex === undefined) {
        return 'off';
      }
      if (index === pathIndex) {
        return 'path';
      }

      const parentIndex = current.indexByDepth.get(item.depth - 1) ?? -1;
      return index > parentIndex && index < pathIndex ? 'passed' : 'off';
    },
    /** What the current path leads to: the hovered row, the focused row, or `null` while none is shown. */
    source(): TreePathSource | null {
      return path() ? (target()?.source ?? null) : null;
    },
    /** Makes the row under the pointer the target; attach to the scrolling element. */
    onPointerOver(event: PointerEvent): void {
      const row = event.target instanceof Element ? event.target.closest<HTMLElement>(TREE_ROW_SELECTOR) : null;
      setHoveredId(row?.dataset.nodeId ?? null);
    },
    /** Returns the target to the fallback row; attach to the scrolling element. */
    onPointerLeave(): void {
      setHoveredId(null);
    },
    /** Lets the fallback row become the target; attach to the scrolling element. */
    onFocusIn(): void {
      setFocusInside(true);
    },
    /** Drops the fallback target once focus leaves the scrolling element. */
    onFocusOut(event: FocusEvent & { currentTarget: Element }): void {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
        setFocusInside(false);
      }
    }
  } as const;
}

/** Path highlight returned by {@link createTreePathHighlight}. */
export type TreePathHighlight<T> = ReturnType<typeof createTreePathHighlight<T>>;

/**
 * A row's part in the highlighted path: on it (the target or one of its ancestors), passed by it
 * (an earlier sibling of a path row, whose line the path runs along), off it, or `'none'` while no
 * path is shown.
 */
export type TreePathState = 'path' | 'passed' | 'off' | 'none';

/** Where the highlighted path leads: the row under the pointer or the keyboard-focused row. */
export type TreePathSource = 'hover' | 'focus';

type TreePath = Readonly<{ indexByDepth: ReadonlyMap<number, number> }>;

const TREE_ROW_SELECTOR = '[role="treeitem"][data-node-id]';
