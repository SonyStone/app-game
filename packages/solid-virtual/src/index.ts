import { createRAF } from '@solid-primitives/raf';
import { getElementSize, makeResizeObserver } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { createTrigger } from '@solid-primitives/trigger';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';

/**
 * Creates a headless dynamic-height virtualizer for flat or nested Solid collections.
 *
 * The returned root and every returned item expose `children()`, `paddingTop`, and
 * `paddingBottom`. Attach `setElementRef` to the complete item branch. When that
 * branch contains children, attach `setChildrenRef` to the exact recursive level.
 * The primitive subtracts that child region when measuring the item's own height.
 */
export function createVirtualNestedList<T>(props: {
  /** Root items in display order. May be a reactive accessor. */
  items: MaybeAccessor<readonly T[]>;
  /** Returns an item's direct children, or `undefined` when it has none. */
  getChildren: (item: T) => readonly T[] | undefined;
  /** Scrollable element containing the rendered virtual levels. */
  elementRef: MaybeAccessor<HTMLElement | undefined>;
  /** Controls whether descendants participate in layout. Defaults to expanded. */
  isExpanded?: (item: T) => boolean;
  /** Estimated item height in pixels, excluding descendants and `gap`. Defaults to `120`. */
  estimateOwnHeight?: number | ((item: T, depth: number) => number);
  /** Extra pixels rendered before and after the viewport. Defaults to `600`. */
  overscan?: MaybeAccessor<number>;
  /** Vertical space after each complete item branch. Defaults to `8`. */
  gap?: MaybeAccessor<number>;
}) {
  const measurements = new WeakMap<NestedVirtualBox, ReturnType<typeof measureOwnRegions>>();
  const childElements = new WeakMap<NestedVirtualBox, HTMLElement>();
  const observedItems = new Map<Element, NestedVirtualBox>();
  const pendingResizeEntries = new Map<Element, ResizeObserverEntry>();
  const [trackMeasurements, invalidateMeasurements] = createTrigger();
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const scroll = createScrollPosition(() => access(props.elementRef));
  const [, scheduleMeasurements, cancelMeasurements] = createRAF(() => {
    cancelMeasurements();
    const entries = [...pendingResizeEntries.values()];
    pendingResizeEntries.clear();
    handleMeasurements(entries);
  });
  const resizeObserver = makeResizeObserver<Element>((entries) => {
    for (const entry of entries) pendingResizeEntries.set(entry.target, entry);
    scheduleMeasurements();
  });

  const tree = createMemo(() => createTree(access(props.items), 0));
  const gap = createMemo(() => Math.max(0, access(props.gap ?? DEFAULT_GAP)));
  const overscan = createMemo(() => Math.max(0, access(props.overscan ?? DEFAULT_OVERSCAN)));
  const layout = createMemo(() => {
    trackMeasurements();
    const roots = tree();
    const totalHeight = layoutTree(roots, measurements, estimateOwnHeight, isExpanded, gap());
    return { roots, totalHeight };
  });
  const visibleTop = createMemo(() => Math.max(0, scroll.y - overscan()));
  const visibleBottom = createMemo(() => scroll.y + viewportHeight() + overscan());

  createEffect(() => {
    const element = access(props.elementRef);
    if (!element) {
      setViewportHeight(0);
      return;
    }

    setViewportHeight(getElementSize(element).height ?? 0);
    resizeObserver.observe(element);
    onCleanup(() => resizeObserver.unobserve(element));
  });

  return {
    /** Visible root items in display order. */
    children: () => readLevel(layout().roots, 0, layout().totalHeight).children,
    /** Estimated or measured total height of the complete tree. */
    get totalHeight(): number {
      return layout().totalHeight;
    },
    /** Space represented before the first rendered root item. */
    get paddingTop(): number {
      return readLevel(layout().roots, 0, layout().totalHeight).paddingTop;
    },
    /** Space represented after the last rendered root item. */
    get paddingBottom(): number {
      return readLevel(layout().roots, 0, layout().totalHeight).paddingBottom;
    },
    /** Current scroll offset in pixels. */
    get scrollPosition(): number {
      return scroll.y;
    },
    /** Current scroll viewport height in pixels. */
    get viewportHeight(): number {
      return viewportHeight();
    },
    /** Configured vertical space after each item branch. */
    get gap(): number {
      return gap();
    },
    /**
     * Scrolls an item into view using source-item identity.
     *
     * Returns `false` when the item is absent, hidden below a collapsed ancestor,
     * or the scroll element is unavailable. Repeated identical source values
     * resolve to their first document-order occurrence.
     */
    scrollTo(
      item: T,
      options: Readonly<{
        /** Item alignment within the viewport. Defaults to `nearest`. */
        align?: ScrollLogicalPosition;
        /** Native scrolling behavior. Defaults to `auto`. */
        behavior?: ScrollBehavior;
      }> = {}
    ): boolean {
      const element = access(props.elementRef);
      if (!element) return false;

      const currentLayout = layout();
      const match = findNestedVirtualNode(currentLayout.roots, item, isExpanded);
      if (!match?.visible) return false;

      const top = alignScrollOffset({
        align: options.align ?? 'nearest',
        current: element.scrollTop,
        itemStart: match.node.box.top,
        itemEnd: match.node.box.top + match.node.box.ownHeight,
        viewportHeight: viewportHeight(),
        totalHeight: currentLayout.totalHeight
      });
      element.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    },
    /** Scrolls to an absolute vertical offset, clamped to the current layout. */
    scrollToOffset(
      position: number,
      options: Readonly<{
        /** Native scrolling behavior. Defaults to `auto`. */
        behavior?: ScrollBehavior;
      }> = {}
    ): boolean {
      const element = access(props.elementRef);
      if (!element) return false;

      const maximum = Math.max(0, layout().totalHeight - viewportHeight());
      const top = clamp(Number.isFinite(position) ? position : 0, 0, maximum);
      element.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    }
  };

  function createTree(items: readonly T[], depth: number): NestedVirtualNode<T>[] {
    return items.map((item) => {
      const box = createNestedVirtualBox();
      const childNodes = createTree(props.getChildren(item) ?? [], depth + 1);

      const readChildrenLevel = () => {
        layout();
        if (!isExpanded(item)) return EMPTY_LEVEL;
        return readLevel(childNodes, box.childrenTop, box.childrenBottom);
      };

      const view: VirtualNestedItem<T> = {
        item,
        depth,
        childCount: childNodes.length,
        children: () => readChildrenLevel().children,
        setElementRef: (element) => observeItem(element, box),
        setChildrenRef: (element) => registerChildrenElement(element, box),
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

  function readLevel(
    nodes: readonly NestedVirtualNode<T>[],
    top: number,
    bottom: number
  ): Readonly<{
    children: readonly VirtualNestedItem<T>[];
    paddingTop: number;
    paddingBottom: number;
  }> {
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

  function registerChildrenElement(element: HTMLElement, box: NestedVirtualBox): void {
    childElements.set(box, element);
    onCleanup(() => {
      if (childElements.get(box) === element) childElements.delete(box);
    });
  }

  function observeItem(element: HTMLElement, box: NestedVirtualBox): void {
    if (observedItems.get(element) === box) return;

    observedItems.set(element, box);
    resizeObserver.observe(element);
    onCleanup(() => {
      if (observedItems.get(element) !== box) return;
      observedItems.delete(element);
      resizeObserver.unobserve(element);
    });
  }

  function estimateOwnHeight(item: T, depth: number): number {
    const configured = props.estimateOwnHeight ?? DEFAULT_ESTIMATED_OWN_HEIGHT;
    const estimate = typeof configured === 'function' ? configured(item, depth) : configured;
    return positiveSize(estimate, DEFAULT_ESTIMATED_OWN_HEIGHT);
  }

  function isExpanded(item: T): boolean {
    return props.isExpanded?.(item) !== false;
  }

  function handleMeasurements(entries: readonly ResizeObserverEntry[]): void {
    const scroller = access(props.elementRef);
    if (!scroller) return;

    layout();
    const currentScrollTop = scroller.scrollTop;
    let scrollAdjustment = 0;
    let measurementsChanged = false;

    for (const entry of entries) {
      if (entry.target === scroller) {
        setViewportHeight(getElementSize(scroller).height ?? 0);
        continue;
      }

      const box = observedItems.get(entry.target);
      if (!box) continue;

      const measurement = measureOwnRegions(entry.target as HTMLElement, childElements.get(box));
      const previousMeasurement = measurements.get(box) ?? {
        beforeChildren: box.beforeChildren,
        afterChildren: box.afterChildren
      };
      const beforeDifference = measurement.beforeChildren - previousMeasurement.beforeChildren;
      const afterDifference = measurement.afterChildren - previousMeasurement.afterChildren;
      if (Math.abs(beforeDifference) < MEASUREMENT_EPSILON && Math.abs(afterDifference) < MEASUREMENT_EPSILON) {
        continue;
      }

      measurements.set(box, measurement);
      measurementsChanged = true;
      if (box.childrenTop <= currentScrollTop) scrollAdjustment += beforeDifference;
      if (box.bottom <= currentScrollTop) scrollAdjustment += afterDifference;
    }

    if (!measurementsChanged) return;
    invalidateMeasurements();

    if (scrollAdjustment !== 0) {
      scroller.scrollTop = Math.max(0, currentScrollTop + scrollAdjustment);
    }
  }
}

/** Props accepted by {@link createVirtualNestedList}. */
export type VirtualNestedListProps<T> = Parameters<typeof createVirtualNestedList<T>>[0];

/** One visible item returned by {@link createVirtualNestedList}. */
type VirtualNestedItem<T> = Readonly<{
  /** Source item. */
  item: T;
  /** Zero-based tree depth. */
  depth: number;
  /** Number of direct children, including currently unmounted children. */
  childCount: number;
  /** Visible direct children. */
  children: () => readonly VirtualNestedItem<T>[];
  /** Attaches measurement to the complete item branch containing its rendered descendants. */
  setElementRef: (element: HTMLElement) => void;
  /** Marks the exact recursive child level inside the measured item branch. */
  setChildrenRef: (element: HTMLElement) => void;
  /** Absolute top edge of the complete branch. */
  top: number;
  /** Measured or estimated height of this item's own content. */
  ownHeight: number;
  /** Height of this item's complete branch, including descendants and gap. */
  height: number;
  /** Total height occupied by direct descendant branches. */
  childrenHeight: number;
  /** Space represented before the first rendered direct child. */
  paddingTop: number;
  /** Space represented after the last rendered direct child. */
  paddingBottom: number;
}>;

type NestedVirtualNode<T> = Readonly<{
  item: T;
  depth: number;
  childNodes: readonly NestedVirtualNode<T>[];
  box: NestedVirtualBox;
  view: VirtualNestedItem<T>;
}>;

type NestedVirtualBox = {
  top: number;
  beforeChildren: number;
  afterChildren: number;
  ownHeight: number;
  childrenTop: number;
  childrenBottom: number;
  bottom: number;
};

function createNestedVirtualBox(): NestedVirtualBox {
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
  nodes: readonly NestedVirtualNode<T>[],
  measurements: WeakMap<NestedVirtualBox, ReturnType<typeof measureOwnRegions>>,
  estimateOwnHeight: (item: T, depth: number) => number,
  isExpanded: (item: T) => boolean,
  gap: number,
  startTop = 0
): number {
  let cursor = startTop;

  for (const node of nodes) {
    const estimate = estimateOwnHeight(node.item, node.depth);
    const measurement = measurements.get(node.box);

    node.box.top = cursor;
    node.box.beforeChildren = measurement?.beforeChildren ?? estimate;
    node.box.afterChildren = measurement?.afterChildren ?? 0;
    node.box.ownHeight = node.box.beforeChildren + node.box.afterChildren;
    node.box.childrenTop = node.box.top + node.box.beforeChildren;
    node.box.childrenBottom = isExpanded(node.item)
      ? layoutTree(node.childNodes, measurements, estimateOwnHeight, isExpanded, gap, node.box.childrenTop)
      : node.box.childrenTop;
    node.box.bottom = node.box.childrenBottom + node.box.afterChildren + gap;
    cursor = node.box.bottom;
  }

  return cursor;
}

function measureOwnRegions(
  itemElement: HTMLElement,
  childrenElement?: HTMLElement
): Readonly<{ beforeChildren: number; afterChildren: number }> {
  const itemRect = itemElement.getBoundingClientRect();
  if (!childrenElement || !itemElement.contains(childrenElement)) {
    return { beforeChildren: itemRect.height, afterChildren: 0 };
  }

  const childrenRect = childrenElement.getBoundingClientRect();
  const beforeChildren = clamp(childrenRect.top - itemRect.top, 0, itemRect.height);
  const afterChildren = clamp(itemRect.bottom - childrenRect.bottom, 0, itemRect.height - beforeChildren);

  return { beforeChildren, afterChildren };
}

function findVisibleRange<T>(
  nodes: readonly NestedVirtualNode<T>[],
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

function findNestedVirtualNode<T>(
  nodes: readonly NestedVirtualNode<T>[],
  item: T,
  isExpanded: (item: T) => boolean,
  visible = true
): Readonly<{ node: NestedVirtualNode<T>; visible: boolean }> | undefined {
  for (const node of nodes) {
    if (Object.is(node.item, item)) return { node, visible };

    const match = findNestedVirtualNode(node.childNodes, item, isExpanded, visible && isExpanded(node.item));
    if (match) return match;
  }

  return undefined;
}

function alignScrollOffset(
  options: Readonly<{
    align: ScrollLogicalPosition;
    current: number;
    itemStart: number;
    itemEnd: number;
    viewportHeight: number;
    totalHeight: number;
  }>
): number {
  const viewportEnd = options.current + options.viewportHeight;
  let position: number;

  switch (options.align) {
    case 'start':
      position = options.itemStart;
      break;
    case 'center':
      position = (options.itemStart + options.itemEnd - options.viewportHeight) / 2;
      break;
    case 'end':
      position = options.itemEnd - options.viewportHeight;
      break;
    case 'nearest': {
      const startPosition = options.itemStart;
      const endPosition = options.itemEnd - options.viewportHeight;
      const itemCoversViewport = options.itemStart <= options.current && options.itemEnd >= viewportEnd;
      const itemInsideViewport = options.itemStart >= options.current && options.itemEnd <= viewportEnd;

      if (itemCoversViewport || itemInsideViewport) position = options.current;
      else {
        const startDistance = Math.abs(startPosition - options.current);
        const endDistance = Math.abs(endPosition - options.current);
        position = startDistance <= endDistance ? startPosition : endPosition;
      }
      break;
    }
  }

  return clamp(position, 0, Math.max(0, options.totalHeight - options.viewportHeight));
}

function positiveSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const DEFAULT_ESTIMATED_OWN_HEIGHT = 120;
const DEFAULT_OVERSCAN = 600;
const DEFAULT_GAP = 8;
const MEASUREMENT_EPSILON = 0.5;
const EMPTY_LEVEL = { children: [], paddingTop: 0, paddingBottom: 0 } as const;
