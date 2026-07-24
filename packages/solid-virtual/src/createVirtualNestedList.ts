import { access } from '@solid-primitives/utils';
import { createMemo } from 'solid-js';
import type { DynamicHeight } from './createDynamicHeight';
import { createVirtualListCore, type BaseVirtualListProps } from './createVirtualListCore';
import {
  alignVirtualItem,
  clampVirtualPosition,
  createVirtualListFeatureHost,
  isVirtualListFeature,
  positiveVirtualSize,
  VIRTUAL_LIST_FEATURE,
  type VirtualFeatureItem,
  type VirtualFeatureList,
  type VirtualListFeatureHost,
  type VirtualMeasurement,
  type VirtualMeasurementBox
} from './virtualListFeature';

/** Options for a genuinely recursive fixed or dynamic virtual list. */
export type VirtualNestedListProps<T> = Parameters<typeof createVirtualNestedList<T>>[0];

/**
 * Creates a headless genuinely recursive virtual list with fixed or opt-in
 * dynamic own-item heights.
 */
export function createVirtualNestedList<T>(
  inputProps: BaseVirtualListProps<T> &
    Readonly<{
      /**
       * Exact own-item height, excluding descendants and `gap`, or an opt-in
       * dynamic measurement strategy whose estimate has the same semantics.
       */
      itemHeight: number | ((item: T, depth: number) => number) | DynamicHeight<T>;
      /** Returns an item's direct children, or `undefined` when it has none. */
      getChildren: (item: T) => readonly T[] | undefined;
      /** Controls whether descendants participate in layout. Defaults to expanded. */
      isExpanded?: (item: T) => boolean;
    }>
): VirtualNestedList<T> {
  const props = createVirtualListCore<T, VirtualNestedListProps<T>>(inputProps);
  const host = createVirtualListFeatureHost(props, props.itemHeight);

  if (isVirtualListFeature<T>(props.itemHeight)) {
    props.itemHeight[VIRTUAL_LIST_FEATURE](host);
  }
  host.useLayout(NESTED_LAYOUT_PRIORITY, () => createNestedLayout(host, props));
  return host.create();
}

/** Render item returned by {@link createVirtualNestedList}. */
export type VirtualNestedItem<T> = VirtualFeatureItem<T>;

/** Result returned by {@link createVirtualNestedList}. */
export type VirtualNestedList<T> = VirtualFeatureList<T>;

type NestedCollectionProps<T> = Readonly<{
  /** Returns an item's direct children, or `undefined` when it has none. */
  getChildren: (item: T) => readonly T[] | undefined;
  /** Controls whether descendants participate in layout. Defaults to expanded. */
  isExpanded?: (item: T) => boolean;
}>;

function createNestedLayout<T>(
  host: VirtualListFeatureHost<T>,
  options: NestedCollectionProps<T>
): VirtualFeatureList<T> {
  const { core, heightStrategy } = host;
  const items = createMemo(() => access(core.items));
  const element = () => access(core.elementRef);
  const viewportHeight = createMemo(() => access(core.viewportHeight));
  const scrollPosition = createMemo(() => access(core.scrollPosition));
  const gap = createMemo(() => Math.max(0, access(core.gap)));
  const overscan = createMemo(() => Math.max(0, access(core.overscan)));
  let ensureLayout = (): void => undefined;
  const measurement = heightStrategy?.createController<NestedNodeBox>(() => ensureLayout());
  const tree = createMemo(() => createTree(items(), 0));
  const layout = createMemo(() => {
    measurement?.trackMeasurements();
    const roots = tree();
    const totalHeight = layoutTree(roots, readOwnRegions, isExpanded, gap());
    return { roots, totalHeight };
  });
  ensureLayout = () => {
    layout();
  };
  const visibleTop = createMemo(() => Math.max(0, scrollPosition() - overscan()));
  const visibleBottom = createMemo(() => scrollPosition() + viewportHeight() + overscan());

  return {
    children: () => readLevel(layout().roots, 0, layout().totalHeight).children,
    get totalHeight(): number {
      return layout().totalHeight;
    },
    get paddingTop(): number {
      return readLevel(layout().roots, 0, layout().totalHeight).paddingTop;
    },
    get paddingBottom(): number {
      return readLevel(layout().roots, 0, layout().totalHeight).paddingBottom;
    },
    get scrollPosition(): number {
      return scrollPosition();
    },
    get viewportHeight(): number {
      return viewportHeight();
    },
    get gap(): number {
      return gap();
    },
    scrollTo(item, scrollOptions = {}): boolean {
      const currentElement = element();
      if (!currentElement) return false;

      const currentLayout = layout();
      const match = findNestedNode(currentLayout.roots, item, isExpanded);
      if (!match?.visible) return false;

      const top = alignVirtualItem({
        align: scrollOptions.align ?? 'nearest',
        current: currentElement.scrollTop,
        itemStart: match.node.box.top,
        itemEnd: match.node.box.top + match.node.box.ownHeight,
        viewportHeight: viewportHeight(),
        totalHeight: currentLayout.totalHeight
      });
      currentElement.scrollTo({ top, behavior: scrollOptions.behavior ?? 'auto' });
      return true;
    },
    scrollToOffset(position, scrollOptions = {}): boolean {
      const currentElement = element();
      if (!currentElement) return false;

      const maximum = Math.max(0, layout().totalHeight - viewportHeight());
      const top = clampVirtualPosition(Number.isFinite(position) ? position : 0, 0, maximum);
      currentElement.scrollTo({ top, behavior: scrollOptions.behavior ?? 'auto' });
      return true;
    }
  };

  function createTree(items: readonly T[], depth: number): NestedNode<T>[] {
    return items.map((item) => {
      const box = createNestedNodeBox();
      const childNodes = createTree(options.getChildren(item) ?? EMPTY_ITEMS, depth + 1);

      const readChildrenLevel = () => {
        layout();
        if (!isExpanded(item)) return EMPTY_LEVEL;
        return readLevel(childNodes, box.childrenTop, box.childrenBottom);
      };

      const view: VirtualFeatureItem<T> = {
        item,
        depth,
        childCount: childNodes.length,
        children: () => readChildrenLevel().children,
        setElementRef: (element) => measurement?.setElementRef(element, box),
        setChildrenRef: (element) => measurement?.setChildrenRef(element, box),
        get top() {
          layout();
          return box.top;
        },
        get ownHeight() {
          layout();
          return box.ownHeight;
        },
        get height() {
          layout();
          return box.bottom - box.top;
        },
        get childrenHeight() {
          layout();
          return box.childrenBottom - box.childrenTop;
        },
        get paddingTop() {
          return readChildrenLevel().paddingTop;
        },
        get paddingBottom() {
          return readChildrenLevel().paddingBottom;
        }
      };

      return { item, depth, childNodes, box, view };
    });
  }

  function readLevel(nodes: readonly NestedNode<T>[], top: number, bottom: number): NestedLevel<T> {
    layout();
    const range = findVisibleRange(nodes, visibleTop(), visibleBottom());
    const first = nodes[range.start];
    const last = nodes[range.end - 1];

    if (!first || !last) {
      return {
        children: [],
        paddingTop: Math.max(0, bottom - top),
        paddingBottom: 0
      };
    }

    return {
      children: nodes.slice(range.start, range.end).map((node) => node.view),
      paddingTop: Math.max(0, first.box.top - top),
      paddingBottom: Math.max(0, bottom - last.box.bottom)
    };
  }

  function readOwnRegions(node: NestedNode<T>): VirtualMeasurement {
    const measured = measurement?.readMeasurement(node.box);
    if (measured) return measured;

    const estimate = heightStrategy
      ? heightStrategy.estimate(node.item, node.depth)
      : readFixedOwnHeight(host.itemHeight, node.item, node.depth);
    return {
      beforeChildren: positiveVirtualSize(estimate, DEFAULT_ITEM_HEIGHT),
      afterChildren: 0
    };
  }

  function isExpanded(item: T): boolean {
    return options.isExpanded?.(item) !== false;
  }
}

type NestedNode<T> = Readonly<{
  item: T;
  depth: number;
  childNodes: readonly NestedNode<T>[];
  box: NestedNodeBox;
  view: VirtualFeatureItem<T>;
}>;

type NestedNodeBox = VirtualMeasurementBox & {
  top: number;
  ownHeight: number;
  childrenBottom: number;
};

type NestedLevel<T> = Readonly<{
  children: readonly VirtualFeatureItem<T>[];
  paddingTop: number;
  paddingBottom: number;
}>;

function createNestedNodeBox(): NestedNodeBox {
  return {
    top: 0,
    beforeChildren: 0,
    afterChildren: 0,
    ownHeight: 0,
    childrenTop: 0,
    childrenBottom: 0,
    bottom: 0
  };
}

function layoutTree<T>(
  nodes: readonly NestedNode<T>[],
  readOwnRegions: (node: NestedNode<T>) => VirtualMeasurement,
  isExpanded: (item: T) => boolean,
  gap: number,
  startTop = 0
): number {
  let cursor = startTop;

  for (const [index, node] of nodes.entries()) {
    const ownRegions = readOwnRegions(node);

    node.box.top = cursor;
    node.box.beforeChildren = ownRegions.beforeChildren;
    node.box.afterChildren = ownRegions.afterChildren;
    node.box.ownHeight = node.box.beforeChildren + node.box.afterChildren;
    node.box.childrenTop = node.box.top + node.box.beforeChildren;
    node.box.childrenBottom = isExpanded(node.item)
      ? layoutTree(node.childNodes, readOwnRegions, isExpanded, gap, node.box.childrenTop)
      : node.box.childrenTop;
    node.box.bottom = node.box.childrenBottom + node.box.afterChildren;
    cursor = node.box.bottom + (index < nodes.length - 1 ? gap : 0);
  }

  return cursor;
}

function findVisibleRange<T>(
  nodes: readonly NestedNode<T>[],
  rangeStart: number,
  rangeEnd: number
): Readonly<{ start: number; end: number }> {
  let low = 0;
  let high = nodes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const node = nodes[middle];
    if (node && node.box.bottom <= rangeStart) low = middle + 1;
    else high = middle;
  }
  const start = low;

  low = start;
  high = nodes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const node = nodes[middle];
    if (node && node.box.top < rangeEnd) low = middle + 1;
    else high = middle;
  }

  return { start, end: low };
}

function findNestedNode<T>(
  nodes: readonly NestedNode<T>[],
  item: T,
  isExpanded: (item: T) => boolean,
  visible = true
): Readonly<{ node: NestedNode<T>; visible: boolean }> | undefined {
  for (const node of nodes) {
    if (Object.is(node.item, item)) return { node, visible };

    const match = findNestedNode(node.childNodes, item, isExpanded, visible && isExpanded(node.item));
    if (match) return match;
  }

  return undefined;
}

function readFixedOwnHeight<T>(configured: unknown, item: T, depth: number): number {
  if (typeof configured === 'number') return configured;
  if (isItemHeight<T>(configured)) return configured(item, depth);
  return DEFAULT_ITEM_HEIGHT;
}

function isItemHeight<T>(value: unknown): value is (item: T, depth: number) => number {
  return typeof value === 'function';
}

const NESTED_LAYOUT_PRIORITY = 20;
const DEFAULT_ITEM_HEIGHT = 120;
const EMPTY_ITEMS: readonly never[] = [];
const EMPTY_LEVEL = { children: [], paddingTop: 0, paddingBottom: 0 } as const;
