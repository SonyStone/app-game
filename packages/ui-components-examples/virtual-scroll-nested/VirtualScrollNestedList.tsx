import { makeResizeObserver } from '@solid-primitives/resize-observer';
import { createTrigger } from '@solid-primitives/trigger';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { VirtualScrollPreview } from './VirtualPreview';

/** A stable identity accepted by the nested virtualizer. Keys must be unique across the entire tree. */
export type NestedVirtualKey = string | number;

/** Props accepted by {@link VirtualScrollNestedList}. */
export type VirtualScrollNestedListProps<T, K extends NestedVirtualKey> = Parameters<
  typeof VirtualScrollNestedList<T, K>
>[0];

/**
 * Renders a genuinely nested tree while mounting only the sibling branches that intersect the viewport.
 * Descendants remain DOM children of their parent item rather than being flattened into a single list.
 */
export function VirtualScrollNestedList<T, K extends NestedVirtualKey>(props: {
  /** Root items in display order. Descendants are obtained with `getChildren`. */
  items: readonly T[];
  /** Returns the globally unique, stable key for an item. */
  getKey: (item: T) => K;
  /** Returns an item's direct children, or `undefined` when it has none. */
  getChildren: (item: T) => readonly T[] | undefined;
  /** Controls whether an item's descendants participate in layout. Defaults to expanded. */
  isExpanded?: (item: T) => boolean;
  /** Estimated item height in pixels, excluding descendants. Defaults to `120`. */
  estimateOwnHeight?: number | ((item: T, depth: number) => number);
  /** Extra pixels rendered before and after the viewport. Defaults to `600`. */
  overscan?: number;
  /** Vertical gap in pixels added after every rendered item. Defaults to `8`. */
  gap?: number;
  /** Shows the interactive virtual-layout preview used for debugging. */
  preview?: boolean;
  /** Class applied to the outer component container. */
  class?: string;
  /** Accessible label applied to the scrollable tree. */
  ariaLabel?: string;
  /** Renders an item and decides where its virtualized descendants appear. */
  children: (
    props: Readonly<{
      /** The item being rendered. */
      item: T;
      /** Zero-based depth within the nested tree. */
      depth: number;
      /** The item's virtualized direct descendants. Render this value to preserve nesting. */
      children: JSX.Element;
    }>
  ) => JSX.Element;
}) {
  const virtual = createNestedVirtualList(props);

  return (
    <div class={props.class} style={{ display: 'flex', overflow: 'hidden' }}>
      <div
        ref={virtual.mountScroller}
        class="min-w-0 flex-1"
        role="tree"
        aria-label={props.ariaLabel}
        tabindex="0"
        onScroll={(event) => virtual.updateScrollPosition(event.currentTarget.scrollTop)}
        style={{ overflow: 'auto', 'overflow-anchor': 'none', outline: 'none' }}
      >
        <VirtualLevel
          virtual={virtual}
          nodes={virtual.layout().roots}
          top={() => 0}
          bottom={() => virtual.layout().totalHeight}
        />
      </div>
      <Show when={props.preview}>
        <VirtualScrollPreview
          totalHeight={virtual.layout().totalHeight}
          paddingTop={0}
          paddingBottom={0}
          visibleHeight={virtual.viewportHeight()}
          scrollPosition={virtual.scrollTop()}
          viewportHeight={virtual.viewportHeight()}
          visibleItems={virtual.debugNodes().map((node) => node.item)}
          children={virtual.debugNodes().map((node) => ({
            top: node.top,
            height: node.bottom - node.top,
            item: node.item
          }))}
          scrollTo={virtual.scrollTo}
        />
      </Show>
    </div>
  );
}

/** Values supplied to the item renderer of {@link VirtualScrollNestedList}. */
export type NestedVirtualRenderProps<T> = Parameters<VirtualScrollNestedListProps<T, NestedVirtualKey>['children']>[0];

/** A tree node annotated with absolute vertical layout coordinates. */
export type NestedVirtualNode<T, K extends NestedVirtualKey> = {
  /** Source item represented by this node. */
  readonly item: T;
  /** Stable source-item key. */
  readonly key: K;
  /** Zero-based depth within the tree. */
  readonly depth: number;
  /** Direct child nodes; the hierarchy is never flattened. */
  readonly children: NestedVirtualNode<T, K>[];
  /** Absolute top edge of the full branch. */
  top: number;
  /** Height before the nested child region. */
  beforeChildren: number;
  /** Absolute top edge of the nested child region. */
  childrenTop: number;
  /** Absolute bottom edge of the nested child region. */
  childrenBottom: number;
  /** Height after the nested child region. */
  afterChildren: number;
  /** Absolute bottom edge of the full branch. */
  bottom: number;
};

type NestedVirtualController<T, K extends NestedVirtualKey> = ReturnType<typeof createNestedVirtualList<T, K>>;

function VirtualLevel<T, K extends NestedVirtualKey>(
  props: Readonly<{
    virtual: NestedVirtualController<T, K>;
    nodes: readonly NestedVirtualNode<T, K>[];
    top: () => number;
    bottom: () => number;
    ref?: (element: HTMLDivElement) => void;
  }>
) {
  const range = createMemo(() => {
    props.virtual.layout();
    return findNestedVisibleRange(props.nodes, props.virtual.visibleTop(), props.virtual.visibleBottom());
  });
  const visibleNodes = createMemo(() => props.nodes.slice(range().start, range().end));
  const paddingTop = createMemo(() => {
    props.virtual.layout();
    const first = props.nodes[range().start];
    return Math.max(0, (first?.top ?? props.bottom()) - props.top());
  });
  const paddingBottom = createMemo(() => {
    props.virtual.layout();
    const last = props.nodes[range().end - 1];
    return Math.max(0, props.bottom() - (last?.bottom ?? props.top()));
  });

  return (
    <div ref={props.ref} data-virtual-level style={{ display: 'block', 'overflow-anchor': 'none' }}>
      <Show when={paddingTop() > 0}>
        <div aria-hidden="true" data-virtual-spacer="before" style={{ height: `${paddingTop()}px` }} />
      </Show>
      <For each={visibleNodes()}>{(node) => <VirtualBranch virtual={props.virtual} node={node} />}</For>
      <Show when={paddingBottom() > 0}>
        <div aria-hidden="true" data-virtual-spacer="after" style={{ height: `${paddingBottom()}px` }} />
      </Show>
    </div>
  );
}

function VirtualBranch<T, K extends NestedVirtualKey>(
  props: Readonly<{
    virtual: NestedVirtualController<T, K>;
    node: NestedVirtualNode<T, K>;
  }>
) {
  let element!: HTMLDivElement;
  let childRegion: HTMLDivElement | undefined;

  onMount(() => {
    const stopObserving = props.virtual.observeBranch(element, props.node.key, () => childRegion);
    onCleanup(stopObserving);
  });

  const nestedChildren =
    props.node.children.length > 0 ? (
      <VirtualLevel
        virtual={props.virtual}
        nodes={props.node.children}
        top={() => props.node.childrenTop}
        bottom={() => props.node.childrenBottom}
        ref={(nestedElement) => (childRegion = nestedElement)}
      />
    ) : undefined;

  return (
    <div
      ref={element}
      data-virtual-branch={String(props.node.key)}
      style={{
        display: 'block',
        'padding-inline': '8px',
        'padding-bottom': `${props.virtual.gap()}px`,
        'overflow-anchor': 'none'
      }}
    >
      {props.virtual.renderItem({
        item: props.node.item,
        depth: props.node.depth,
        children: nestedChildren
      })}
    </div>
  );
}

/** Measured portions of a branch that sit before and after its nested child region. */
export type NestedVirtualMeasurement = Readonly<{
  /** Pixels from the branch's top edge to the child region. */
  beforeChildren: number;
  /** Pixels from the child region's bottom edge to the branch's bottom edge. */
  afterChildren: number;
}>;

function createNestedVirtualList<T, K extends NestedVirtualKey>(props: VirtualScrollNestedListProps<T, K>) {
  let scroller: HTMLDivElement | undefined;

  type BranchObservation = Readonly<{
    key: K;
    getChildRegion: () => HTMLDivElement | undefined;
  }>;

  const measurements = new Map<K, NestedVirtualMeasurement>();
  const observedBranches = new Map<Element, BranchObservation>();
  const [trackMeasurements, invalidateMeasurements] = createTrigger();
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);

  const tree = createMemo(() =>
    createNestedVirtualTree(props.items, props.getKey, props.getChildren, props.isExpanded)
  );
  const nodesByKey = createMemo(() => collectNodesByKey(tree()));
  const gap = createMemo(() => Math.max(0, props.gap ?? DEFAULT_GAP));
  const layout = createMemo(() => {
    trackMeasurements();
    const roots = tree();
    const totalHeight = layoutNestedVirtualTree(roots, measurements, estimateOwnHeight);
    return { roots, totalHeight };
  });
  const visibleTop = createMemo(() => Math.max(0, scrollTop() - Math.max(0, props.overscan ?? DEFAULT_OVERSCAN)));
  const visibleBottom = createMemo(
    () => scrollTop() + viewportHeight() + Math.max(0, props.overscan ?? DEFAULT_OVERSCAN)
  );
  const debugNodes = createMemo(() => {
    const currentLayout = layout();
    return collectIntersectingNodes(currentLayout.roots, visibleTop(), visibleBottom());
  });
  const resizeObserver = makeResizeObserver<Element>(handleMeasurements);

  createEffect(() => {
    const activeKeys = new Set(nodesByKey().keys());
    for (const key of measurements.keys()) {
      if (!activeKeys.has(key)) measurements.delete(key);
    }
  });

  onMount(() => {
    if (!scroller) return;

    setViewportHeight(scroller.clientHeight);
    setScrollTop(scroller.scrollTop);
    resizeObserver.observe(scroller);
  });

  return {
    layout,
    visibleTop,
    visibleBottom,
    debugNodes,
    gap,
    scrollTop,
    viewportHeight,
    mountScroller,
    updateScrollPosition: setScrollTop,
    observeBranch,
    renderItem: props.children,
    scrollTo
  };

  function estimateOwnHeight(item: T, depth: number): number {
    const configured = props.estimateOwnHeight ?? DEFAULT_ESTIMATED_OWN_HEIGHT;
    const estimate = typeof configured === 'function' ? configured(item, depth) : configured;
    return positiveSize(estimate, DEFAULT_ESTIMATED_OWN_HEIGHT) + gap();
  }

  function mountScroller(element: HTMLDivElement): void {
    scroller = element;
  }

  function observeBranch(
    element: HTMLDivElement,
    key: K,
    getChildRegion: () => HTMLDivElement | undefined
  ): () => void {
    observedBranches.set(element, { key, getChildRegion });
    resizeObserver.observe(element);

    return () => {
      observedBranches.delete(element);
      resizeObserver.unobserve(element);
    };
  }

  function scrollTo(position: number): void {
    scroller?.scrollTo({ top: position });
  }

  function handleMeasurements(entries: readonly ResizeObserverEntry[]): void {
    if (!scroller) return;

    layout();
    const currentScrollTop = scroller.scrollTop;
    let scrollAdjustment = 0;
    let measurementsChanged = false;

    for (const entry of entries) {
      if (entry.target === scroller) {
        setViewportHeight(entry.contentRect.height);
        continue;
      }

      const observation = observedBranches.get(entry.target);
      if (!observation) continue;
      const node = nodesByKey().get(observation.key);
      if (!node) continue;

      const branchElement = entry.target;
      const branchRect = branchElement.getBoundingClientRect();
      const childRegion = observation.getChildRegion();
      const hasNestedRegion = childRegion !== undefined && branchElement.contains(childRegion);
      const childRect = hasNestedRegion ? childRegion.getBoundingClientRect() : undefined;
      const beforeChildren = childRect
        ? Math.max(0, Math.min(branchRect.height, childRect.top - branchRect.top))
        : branchRect.height;
      const afterChildren = childRect
        ? Math.max(0, Math.min(branchRect.height - beforeChildren, branchRect.bottom - childRect.bottom))
        : 0;

      const previous = measurements.get(node.key) ?? {
        beforeChildren: node.beforeChildren,
        afterChildren: node.afterChildren
      };
      const beforeDifference = beforeChildren - previous.beforeChildren;
      const afterDifference = afterChildren - previous.afterChildren;
      if (Math.abs(beforeDifference) < MEASUREMENT_EPSILON && Math.abs(afterDifference) < MEASUREMENT_EPSILON) {
        continue;
      }

      measurements.set(node.key, { beforeChildren, afterChildren });
      measurementsChanged = true;

      if (node.childrenTop <= currentScrollTop) scrollAdjustment += beforeDifference;
      if (node.bottom <= currentScrollTop) scrollAdjustment += afterDifference;
    }

    if (!measurementsChanged) return;
    invalidateMeasurements();

    if (scrollAdjustment !== 0) {
      const nextScrollTop = Math.max(0, currentScrollTop + scrollAdjustment);
      scroller.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }
}

/**
 * Builds the hierarchy used by the virtual layout while preserving the source nesting.
 *
 * @throws When two items anywhere in the tree return the same key.
 */
export function createNestedVirtualTree<T, K extends NestedVirtualKey>(
  items: readonly T[],
  getKey: (item: T) => K,
  getChildren: (item: T) => readonly T[] | undefined,
  isExpanded: (item: T) => boolean = () => true
): NestedVirtualNode<T, K>[] {
  const keys = new Set<K>();

  const createNode = (item: T, depth: number): NestedVirtualNode<T, K> => {
    const key = getKey(item);
    if (keys.has(key)) {
      throw new Error(`VirtualScrollNestedList requires unique keys. Duplicate key: ${String(key)}`);
    }
    keys.add(key);

    const children = isExpanded(item) ? (getChildren(item) ?? []).map((child) => createNode(child, depth + 1)) : [];
    return {
      item,
      key,
      depth,
      children,
      top: 0,
      beforeChildren: 0,
      childrenTop: 0,
      childrenBottom: 0,
      afterChildren: 0,
      bottom: 0
    };
  };

  return items.map((item) => createNode(item, 0));
}

/**
 * Mutates a nested virtual tree with absolute vertical coordinates and returns its bottom edge.
 * Measured branch heights take precedence over estimates.
 */
export function layoutNestedVirtualTree<T, K extends NestedVirtualKey>(
  nodes: readonly NestedVirtualNode<T, K>[],
  measurements: ReadonlyMap<K, NestedVirtualMeasurement>,
  estimateOwnHeight: (item: T, depth: number) => number,
  startTop = 0
): number {
  let cursor = startTop;

  for (const node of nodes) {
    const estimate = positiveSize(estimateOwnHeight(node.item, node.depth), DEFAULT_ESTIMATED_OWN_HEIGHT);
    const measurement = measurements.get(node.key);
    const measuredOwnHeight = measurement ? measurement.beforeChildren + measurement.afterChildren : estimate;

    node.top = cursor;
    node.beforeChildren = node.children.length > 0 ? (measurement?.beforeChildren ?? estimate) : measuredOwnHeight;
    node.childrenTop = node.top + node.beforeChildren;
    node.childrenBottom = layoutNestedVirtualTree(node.children, measurements, estimateOwnHeight, node.childrenTop);
    node.afterChildren = node.children.length > 0 ? (measurement?.afterChildren ?? 0) : 0;
    node.bottom = node.childrenBottom + node.afterChildren;
    cursor = node.bottom;
  }

  return cursor;
}

/**
 * Finds the half-open sibling index range whose laid-out branches intersect the requested vertical range.
 */
export function findNestedVisibleRange<T, K extends NestedVirtualKey>(
  nodes: readonly NestedVirtualNode<T, K>[],
  rangeStart: number,
  rangeEnd: number
): Readonly<{ start: number; end: number }> {
  let low = 0;
  let high = nodes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const node = nodes[middle];
    if (node && node.bottom <= rangeStart) low = middle + 1;
    else high = middle;
  }
  const start = low;

  low = start;
  high = nodes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const node = nodes[middle];
    if (node && node.top < rangeEnd) low = middle + 1;
    else high = middle;
  }

  return { start, end: low };
}

function collectNodesByKey<T, K extends NestedVirtualKey>(
  nodes: readonly NestedVirtualNode<T, K>[],
  result = new Map<K, NestedVirtualNode<T, K>>()
): Map<K, NestedVirtualNode<T, K>> {
  for (const node of nodes) {
    result.set(node.key, node);
    collectNodesByKey(node.children, result);
  }
  return result;
}

function collectIntersectingNodes<T, K extends NestedVirtualKey>(
  nodes: readonly NestedVirtualNode<T, K>[],
  rangeStart: number,
  rangeEnd: number,
  result: NestedVirtualNode<T, K>[] = []
): NestedVirtualNode<T, K>[] {
  const range = findNestedVisibleRange(nodes, rangeStart, rangeEnd);
  for (let index = range.start; index < range.end; index++) {
    const node = nodes[index];
    if (!node) continue;
    result.push(node);
    collectIntersectingNodes(node.children, rangeStart, rangeEnd, result);
  }
  return result;
}

function positiveSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DEFAULT_ESTIMATED_OWN_HEIGHT = 120;
const DEFAULT_OVERSCAN = 600;
const DEFAULT_GAP = 8;
const MEASUREMENT_EPSILON = 0.5;
