import { createMemo, createSignal, createStore, storePath } from 'solid-js';

/** Creates a headless hierarchical view that reconciles row models by stable item ID. */
export function createTreeView<T>(props: {
  /** Root items in display order. */
  items: () => readonly T[];
  /** Returns the stable ID used to preserve state and DOM when item objects refresh. */
  getId: (item: T) => string;
  /** Returns an item's direct children, or `undefined` for leaves. */
  getChildren: (item: T) => readonly T[] | undefined;
  /** Controls a branch's initial state. Defaults to expanded. */
  isInitiallyExpanded?: (item: T) => boolean;
  /** Reports semantic equality so refreshed item objects do not update unchanged rows. */
  isItemEqual?: (previous: T, next: T) => boolean;
}) {
  const [expandedById, setExpandedById] = createStore<Record<string, boolean>>({});
  const controllersById = new Map<string, TreeItemController<T>>();
  const children = createMemo(() => {
    const seenIds = new Set<string>();
    const reconciled = reconcileItems(props.items(), 0, seenIds);
    for (const id of controllersById.keys()) {
      if (!seenIds.has(id)) {
        controllersById.delete(id);
      }
    }
    return reconciled.items;
  });
  const visibleItems = createMemo(() => flattenVisibleItems(children()));

  return {
    /** Reactive root item views in display order. */
    children,
    /** All currently visible item views in document order. */
    visibleItems,
    /** Reports the current expansion state for a source item. */
    isExpanded(item: T): boolean {
      return readExpanded(item);
    },
    /** Updates expansion state without mutating the source item. */
    setExpanded(item: T, expanded: boolean): void {
      setExpandedById(storePath(props.getId(item), expanded));
    },
    /** Toggles a branch while preserving its state across source refreshes. */
    toggle(item: T): void {
      setExpandedById(storePath(props.getId(item), !readExpanded(item)));
    },
    /** Expands every branch and returns the prior collapsed set for one-step restoration. */
    expandAll(): TreeExpansionSnapshot {
      const items = flattenAllItems(children());
      const collapsedIds = items.filter((item) => item.childCount > 0 && !item.isExpanded).map((item) => item.id);
      for (const item of items) {
        if (item.childCount > 0) {
          setExpandedById(storePath(item.id, true));
        }
      }
      return { collapsedIds };
    },
    /** Captures the exact collapsed branch set for cloning or later restoration. */
    captureExpansion(): TreeExpansionSnapshot {
      return {
        collapsedIds: flattenAllItems(children())
          .filter((item) => item.childCount > 0 && !item.isExpanded)
          .map((item) => item.id)
      };
    },
    /** Replaces every current branch's expansion state with the supplied snapshot. */
    applyExpansion(snapshot: TreeExpansionSnapshot): void {
      const collapsedIds = new Set(snapshot.collapsedIds);
      for (const item of flattenAllItems(children())) {
        if (item.childCount > 0) {
          setExpandedById(storePath(item.id, !collapsedIds.has(item.id)));
        }
      }
    },
    /** Re-collapses only the branches that were collapsed in the supplied expand-all snapshot. */
    restoreExpansion(snapshot: TreeExpansionSnapshot): void {
      for (const id of snapshot.collapsedIds) {
        if (controllersById.has(id)) {
          setExpandedById(storePath(id, false));
        }
      }
    }
  } as const;

  function reconcileItems(items: readonly T[], depth: number, seenIds: Set<string>): ReconciledItems<T> {
    const itemViews: TreeViewItem<T>[] = [];
    let descendantCount = 0;

    for (const [index, item] of items.entries()) {
      const id = props.getId(item);
      if (seenIds.has(id)) {
        throw new Error(`Tree item IDs must be unique: ${id}`);
      }
      seenIds.add(id);

      const directChildren = props.getChildren(item) ?? [];
      const childResult = reconcileItems(directChildren, depth + 1, seenIds);
      const controller = controllersById.get(id) ?? createItemController(id, item);
      controllersById.set(id, controller);
      controller.update(item, {
        depth,
        isLast: index === items.length - 1,
        childCount: directChildren.length,
        descendantCount: childResult.descendantCount
      });
      controller.setChildren(childResult.items);
      itemViews.push(controller.view);
      descendantCount += 1 + childResult.descendantCount;
    }

    return { items: itemViews, descendantCount };
  }

  function createItemController(id: string, initialItem: T): TreeItemController<T> {
    let currentItem = initialItem;
    const [itemVersion, setItemVersion] = createSignal(0);
    const [layout, setLayout] = createSignal<TreeItemLayout>(EMPTY_TREE_ITEM_LAYOUT, {
      equals: equalTreeItemLayout
    });
    const [childViews, setChildViews] = createSignal<readonly TreeViewItem<T>[]>([], {
      equals: equalItemArrays
    });

    const view: TreeViewItem<T> = {
      get item() {
        itemVersion();
        return currentItem;
      },
      id,
      get depth() {
        return layout().depth;
      },
      get isLast() {
        return layout().isLast;
      },
      get childCount() {
        return layout().childCount;
      },
      get descendantCount() {
        return layout().descendantCount;
      },
      children: childViews,
      get isExpanded() {
        itemVersion();
        return readExpanded(currentItem);
      },
      setExpanded(expanded: boolean): void {
        setExpandedById(storePath(id, expanded));
      },
      toggle(): void {
        setExpandedById(storePath(id, !readExpanded(currentItem)));
      }
    };

    return {
      view,
      update(item, nextLayout): void {
        const itemChanged = props.isItemEqual ? !props.isItemEqual(currentItem, item) : !Object.is(currentItem, item);
        currentItem = item;
        if (itemChanged) {
          setItemVersion((version) => version + 1);
        }
        setLayout(nextLayout);
      },
      setChildren: setChildViews
    };
  }

  function readExpanded(item: T): boolean {
    return expandedById[props.getId(item)] ?? props.isInitiallyExpanded?.(item) ?? true;
  }
}

/** Props accepted by {@link createTreeView}. */
export type CreateTreeViewProps<T> = Parameters<typeof createTreeView<T>>[0];

/** Headless state and operations returned for one stable tree item. */
export type TreeViewItem<T> = Readonly<{
  /** Latest source item supplied for this stable ID. */
  readonly item: T;
  /** Stable item identifier. */
  id: string;
  /** Zero-based depth below the root level. */
  readonly depth: number;
  /** Whether this item terminates its current sibling list. */
  readonly isLast: boolean;
  /** Number of direct children. */
  readonly childCount: number;
  /** Number of all nested descendants. */
  readonly descendantCount: number;
  /** Direct child item views in display order. */
  children: () => readonly TreeViewItem<T>[];
  /** Current expansion state. */
  readonly isExpanded: boolean;
  /** Updates this branch's expansion state. */
  setExpanded: (expanded: boolean) => void;
  /** Toggles this branch's expansion state. */
  toggle: () => void;
}>;

/** Headless tree state returned by {@link createTreeView}. */
export type TreeViewModel<T> = ReturnType<typeof createTreeView<T>>;

/** Branches that were collapsed immediately before an expand-all operation. */
export type TreeExpansionSnapshot = Readonly<{ collapsedIds: readonly string[] }>;

function flattenVisibleItems<T>(items: readonly TreeViewItem<T>[]): TreeViewItem<T>[] {
  return items.flatMap((item) => [item, ...(item.isExpanded ? flattenVisibleItems(item.children()) : [])]);
}

function flattenAllItems<T>(items: readonly TreeViewItem<T>[]): TreeViewItem<T>[] {
  return items.flatMap((item) => [item, ...flattenAllItems(item.children())]);
}

type ReconciledItems<T> = { items: TreeViewItem<T>[]; descendantCount: number };

type TreeItemController<T> = {
  view: TreeViewItem<T>;
  update: (item: T, layout: TreeItemLayout) => void;
  setChildren: (children: readonly TreeViewItem<T>[]) => void;
};

type TreeItemLayout = {
  depth: number;
  isLast: boolean;
  childCount: number;
  descendantCount: number;
};

function equalTreeItemLayout(left: TreeItemLayout, right: TreeItemLayout): boolean {
  return (
    left.depth === right.depth &&
    left.isLast === right.isLast &&
    left.childCount === right.childCount &&
    left.descendantCount === right.descendantCount
  );
}

function equalItemArrays<T>(left: readonly TreeViewItem<T>[], right: readonly TreeViewItem<T>[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

const EMPTY_TREE_ITEM_LAYOUT: TreeItemLayout = {
  depth: 0,
  isLast: true,
  childCount: 0,
  descendantCount: 0
};
