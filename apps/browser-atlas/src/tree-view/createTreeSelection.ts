import { ReactiveSet } from '@solid-primitives/set';
import type { TreeViewItem, TreeViewModel } from './createTreeView';

/**
 * Creates the file-manager-style multi-row selection shared by clicks, keyboard ranges, and
 * drag-to-select. Rows are keyed by stable item ID, so the selection survives source refreshes.
 * Only visible rows count: rows hidden by a collapse or removed by a refresh drop out of the
 * selection on its next change. All reads reflect writes made earlier in the same event.
 */
export function createTreeSelection<T>(props: {
  /** Headless tree whose visible order defines ranges and the order of selected rows. */
  tree: TreeViewModel<T>;
}) {
  const selectedIds = new ReactiveSet<string>();
  let anchorId: string | null = null;
  let leadId: string | null = null;

  return {
    /** Whether a row is selected. Tracks only this row's membership. */
    isSelected(item: TreeViewItem<T>): boolean {
      return selectedIds.has(item.id);
    },
    /** Visible selected rows in document order. */
    selectedItems(): readonly TreeViewItem<T>[] {
      return props.tree.visibleItems().filter((item) => selectedIds.has(item.id));
    },
    /**
     * Visible selected rows without a selected ancestor, in document order, for commands that
     * act on whole hierarchies such as copy or move.
     */
    selectedRoots(): readonly TreeViewItem<T>[] {
      const roots: TreeViewItem<T>[] = [];
      let rootDepth: number | null = null;
      for (const item of props.tree.visibleItems()) {
        if (rootDepth !== null && item.depth <= rootDepth) {
          rootDepth = null;
        }
        if (rootDepth === null && selectedIds.has(item.id)) {
          roots.push(item);
          rootDepth = item.depth;
        }
      }
      return roots;
    },
    /** Runs of adjacent selected rows in visible order, for drawing the selection as shapes. */
    selectedRuns(): readonly TreeSelectionRun[] {
      const runs: { first: number; depths: number[] }[] = [];
      props.tree.visibleItems().forEach((item, index) => {
        if (!selectedIds.has(item.id)) {
          return;
        }

        const run = runs.at(-1);
        if (run && run.first + run.depths.length === index) {
          run.depths.push(item.depth);
        } else {
          runs.push({ first: index, depths: [item.depth] });
        }
      });
      return runs;
    },
    /**
     * The row last clicked, toggled, or reached by keyboard while it is still selected and
     * visible; otherwise the first selected row. Single-target commands such as Paste use it.
     */
    primaryItem(): TreeViewItem<T> | undefined {
      const items = props.tree.visibleItems();
      return (
        items.find((item) => item.id === leadId && selectedIds.has(item.id)) ??
        items.find((item) => selectedIds.has(item.id))
      );
    },
    /** Replaces the selection with one row, which also becomes the anchor of later ranges. */
    selectOnly,
    /** Adds or removes one row (Ctrl/Cmd+click) and makes it the anchor of later ranges. */
    toggle,
    /**
     * Selects the visible rows from the anchor to `item` (Shift+click or Shift+arrows) and keeps
     * the anchor. `additive` keeps the rest of the selection (Ctrl/Cmd+Shift+click).
     */
    selectRange(item: TreeViewItem<T>, additive = false): void {
      selectRange(item, additive);
    },
    /** Applies a click: Ctrl/Cmd toggles, Shift selects a range, both add a range, none replaces. */
    click(item: TreeViewItem<T>, modifiers: TreeSelectionModifiers): void {
      if (modifiers.range) {
        selectRange(item, modifiers.toggle);
        return;
      }

      if (modifiers.toggle) {
        toggle(item);
        return;
      }

      selectOnly(item);
    },
    /**
     * Replaces the selection with the given row IDs, as drag-to-select does on every move.
     * `anchorId` starts later Shift ranges and `leadId` becomes the primary row.
     */
    replace(ids: Iterable<string>, positions: Readonly<{ anchorId: string | null; leadId: string | null }>): void {
      replace(ids);
      anchorId = positions.anchorId;
      leadId = positions.leadId;
    },
    /** Selects every visible row while keeping the anchor and primary row. */
    selectAll(): void {
      replace(props.tree.visibleItems().map((item) => item.id));
    },
    /** Clears the selection. */
    clear(): void {
      selectedIds.clear();
      anchorId = null;
      leadId = null;
    }
  } as const;

  function selectOnly(item: TreeViewItem<T>): void {
    replace([item.id]);
    anchorId = item.id;
    leadId = item.id;
  }

  function toggle(item: TreeViewItem<T>): void {
    const ids = new Set(visibleSelectedIds());
    if (ids.has(item.id)) {
      ids.delete(item.id);
    } else {
      ids.add(item.id);
    }
    replace(ids);
    anchorId = item.id;
    leadId = item.id;
  }

  function selectRange(item: TreeViewItem<T>, additive: boolean): void {
    const items = props.tree.visibleItems();
    const targetIndex = items.findIndex((candidate) => candidate.id === item.id);
    const anchorIndex = items.findIndex((candidate) => candidate.id === anchorId);
    if (targetIndex < 0 || anchorIndex < 0) {
      replace([item.id]);
      anchorId = item.id;
      leadId = item.id;
      return;
    }

    const range = items
      .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
      .map((candidate) => candidate.id);
    replace(additive ? [...visibleSelectedIds(), ...range] : range);
    leadId = item.id;
  }

  function visibleSelectedIds(): string[] {
    return props.tree
      .visibleItems()
      .filter((item) => selectedIds.has(item.id))
      .map((item) => item.id);
  }

  function replace(ids: Iterable<string>): void {
    const nextIds = new Set(ids);
    for (const id of [...selectedIds]) {
      if (!nextIds.has(id)) {
        selectedIds.delete(id);
      }
    }
    for (const id of nextIds) {
      selectedIds.add(id);
    }
  }
}

/** Multi-row selection returned by {@link createTreeSelection}. */
export type TreeSelection<T> = ReturnType<typeof createTreeSelection<T>>;

/** Adjacent selected rows: the visible index of the first one and the depth of each row. */
export type TreeSelectionRun = Readonly<{ first: number; depths: readonly number[] }>;

/** Selection meaning of the modifier keys held during a click or drag-to-select gesture. */
export type TreeSelectionModifiers = Readonly<{
  /** Ctrl or Cmd: toggle rows instead of replacing the selection. */
  toggle: boolean;
  /** Shift: select a range from the anchor, or add rows during drag-to-select. */
  range: boolean;
}>;

/** Reads file-manager selection modifiers; Cmd stands in for Ctrl on macOS. */
export function treeSelectionModifiers(event: MouseEvent | KeyboardEvent): TreeSelectionModifiers {
  return { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey };
}
