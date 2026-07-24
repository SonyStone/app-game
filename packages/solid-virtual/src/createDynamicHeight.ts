import { createRAF } from '@solid-primitives/raf';
import { makeResizeObserver } from '@solid-primitives/resize-observer';
import { createTrigger } from '@solid-primitives/trigger';
import { access } from '@solid-primitives/utils';
import { createMemo, onCleanup } from 'solid-js';
import type { BaseVirtualListProps } from './createVirtualListCore';
import {
  alignVirtualItem,
  clampVirtualPosition,
  positiveVirtualSize,
  VIRTUAL_LIST_FEATURE,
  type VirtualFeatureItem,
  type VirtualFeatureList,
  type VirtualHeightStrategy,
  type VirtualListFeature,
  type VirtualListFeatureHost,
  type VirtualMeasurement,
  type VirtualMeasurementBox,
  type VirtualMeasurementController
} from './virtualListFeature';

/**
 * Creates the opt-in DOM measurement strategy for flat or nested virtual
 * lists.
 *
 * The strategy owns flat dynamic layout and contributes the measurement
 * capability consumed by the nested layout when requested there.
 */
export function createDynamicHeight<T = unknown>(
  options: Readonly<{
    /** Initial own-height estimate in pixels. Defaults to `120`. */
    estimate?: number | ((item: T, depth: number) => number);
  }> = {}
): DynamicHeight<T> {
  const estimate = options.estimate ?? DEFAULT_ESTIMATED_OWN_HEIGHT;

  return {
    type: 'dynamic-height',
    estimate,
    [VIRTUAL_LIST_FEATURE](host): void {
      const strategy = createHeightStrategy(host, estimate);
      host.setHeightStrategy(strategy);
      host.useLayout(DYNAMIC_LAYOUT_PRIORITY, () => createDynamicLayout(host, strategy));
    }
  };
}

/** Dynamic-height strategy accepted by either virtual-list entry point. */
export type DynamicHeight<T> = Readonly<{
  /** Identifies the opt-in measurement strategy. */
  type: 'dynamic-height';
  /** Own-height estimate used before an item is measured. */
  estimate: number | ((item: T, depth: number) => number);
}> &
  VirtualListFeature<T>;

/** Options for a flat list with dynamic DOM measurement. */
export type DynamicVirtualListProps<T> = BaseVirtualListProps<T> &
  Readonly<{
    /** Opt-in dynamic measurement strategy. */
    itemHeight: DynamicHeight<T>;
  }>;

function createHeightStrategy<T>(
  host: VirtualListFeatureHost<T>,
  configuredEstimate: number | ((item: T, depth: number) => number)
): VirtualHeightStrategy<T> {
  return {
    estimate(item, depth): number {
      const estimate = typeof configuredEstimate === 'function' ? configuredEstimate(item, depth) : configuredEstimate;
      return positiveVirtualSize(estimate, DEFAULT_ESTIMATED_OWN_HEIGHT);
    },
    createController<Box extends VirtualMeasurementBox>(ensureLayout: () => void): VirtualMeasurementController<Box> {
      return createMeasurementController(host, ensureLayout);
    }
  };
}

function createDynamicLayout<T>(
  host: VirtualListFeatureHost<T>,
  heightStrategy: VirtualHeightStrategy<T>
): VirtualFeatureList<T> {
  const { core } = host;
  const items = createMemo(() => access(core.items));
  const element = () => access(core.elementRef);
  const viewportHeight = createMemo(() => access(core.viewportHeight));
  const scrollPosition = createMemo(() => access(core.scrollPosition));
  const gap = createMemo(() => Math.max(0, access(core.gap)));
  const overscan = createMemo(() => Math.max(0, access(core.overscan)));
  let ensureLayout = (): void => undefined;
  const measurement = heightStrategy.createController<DynamicNodeBox>(() => ensureLayout());
  const nodes = createMemo(() => createNodes(items()));
  const layout = createMemo(() => {
    measurement.trackMeasurements();
    let cursor = 0;

    const currentNodes = nodes();
    for (const [index, node] of currentNodes.entries()) {
      const measured = measurement.readMeasurement(node.box);
      const ownHeight = measured ?? {
        beforeChildren: heightStrategy.estimate(node.item, 0),
        afterChildren: 0
      };

      node.box.top = cursor;
      node.box.beforeChildren = ownHeight.beforeChildren;
      node.box.afterChildren = ownHeight.afterChildren;
      node.box.ownHeight = ownHeight.beforeChildren + ownHeight.afterChildren;
      node.box.childrenTop = node.box.top + node.box.beforeChildren;
      node.box.childrenBottom = node.box.childrenTop;
      node.box.bottom = node.box.childrenBottom + node.box.afterChildren;
      cursor = node.box.bottom + (index < currentNodes.length - 1 ? gap() : 0);
    }

    return { nodes: currentNodes, totalHeight: cursor };
  });
  ensureLayout = () => {
    layout();
  };
  const visibleTop = createMemo(() => Math.max(0, scrollPosition() - overscan()));
  const visibleBottom = createMemo(() => scrollPosition() + viewportHeight() + overscan());

  return {
    children: () => readVisibleNodes(layout().nodes),
    get totalHeight(): number {
      return layout().totalHeight;
    },
    get paddingTop(): number {
      const visible = readVisibleBounds(layout().nodes);
      return visible.first ? Math.max(0, visible.first.box.top) : layout().totalHeight;
    },
    get paddingBottom(): number {
      const visible = readVisibleBounds(layout().nodes);
      return visible.last ? Math.max(0, layout().totalHeight - visible.last.box.bottom) : 0;
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
    scrollTo(item, options = {}): boolean {
      const currentElement = element();
      if (!currentElement) return false;

      const node = layout().nodes.find((candidate) => Object.is(candidate.item, item));
      if (!node) return false;

      const top = alignVirtualItem({
        align: options.align ?? 'nearest',
        current: currentElement.scrollTop,
        itemStart: node.box.top,
        itemEnd: node.box.top + node.box.ownHeight,
        viewportHeight: viewportHeight(),
        totalHeight: layout().totalHeight
      });
      currentElement.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    },
    scrollToOffset(position, options = {}): boolean {
      const currentElement = element();
      if (!currentElement) return false;

      const maximum = Math.max(0, layout().totalHeight - viewportHeight());
      const top = clampVirtualPosition(Number.isFinite(position) ? position : 0, 0, maximum);
      currentElement.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    }
  };

  function createNodes(items: readonly T[]): DynamicNode<T>[] {
    return items.map((item) => {
      const box = createDynamicNodeBox();
      const view: VirtualFeatureItem<T> = {
        item,
        depth: 0,
        childCount: 0,
        children: () => EMPTY_FEATURE_ITEMS,
        setElementRef: (element) => measurement.setElementRef(element, box),
        setChildrenRef: (element) => measurement.setChildrenRef(element, box),
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
          return 0;
        },
        get paddingTop() {
          return 0;
        },
        get paddingBottom() {
          return 0;
        }
      };

      return { item, box, view };
    });
  }

  function readVisibleNodes(currentNodes: readonly DynamicNode<T>[]): readonly VirtualFeatureItem<T>[] {
    const range = findVisibleRange(currentNodes, visibleTop(), visibleBottom());
    return currentNodes.slice(range.start, range.end).map((node) => node.view);
  }

  function readVisibleBounds(currentNodes: readonly DynamicNode<T>[]) {
    const range = findVisibleRange(currentNodes, visibleTop(), visibleBottom());
    return {
      first: currentNodes[range.start],
      last: currentNodes[range.end - 1]
    };
  }
}

type DynamicNode<T> = Readonly<{
  item: T;
  box: DynamicNodeBox;
  view: VirtualFeatureItem<T>;
}>;

type DynamicNodeBox = VirtualMeasurementBox & {
  top: number;
  ownHeight: number;
  childrenBottom: number;
};

function createDynamicNodeBox(): DynamicNodeBox {
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

function findVisibleRange<T>(
  nodes: readonly DynamicNode<T>[],
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

function createMeasurementController<T, Box extends VirtualMeasurementBox>(
  host: VirtualListFeatureHost<T>,
  ensureLayout: () => void
): VirtualMeasurementController<Box> {
  const [trackMeasurements, invalidateMeasurements] = createTrigger();
  const measurements = new WeakMap<Box, VirtualMeasurement>();
  const childElements = new WeakMap<Box, HTMLElement>();
  const observedItems = new Map<Element, Box>();
  const pendingResizeEntries = new Map<Element, ResizeObserverEntry>();
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

  return {
    trackMeasurements,
    readMeasurement(box): VirtualMeasurement | undefined {
      return measurements.get(box);
    },
    setChildrenRef(element, box): void {
      childElements.set(box, element);
      onCleanup(() => {
        if (childElements.get(box) === element) childElements.delete(box);
      });
    },
    setElementRef(element, box): void {
      if (observedItems.get(element) === box) return;

      observedItems.set(element, box);
      resizeObserver.observe(element);
      onCleanup(() => {
        if (observedItems.get(element) !== box) return;
        observedItems.delete(element);
        resizeObserver.unobserve(element);
      });
    }
  };

  function handleMeasurements(entries: readonly ResizeObserverEntry[]): void {
    const scroller = access(host.core.elementRef);
    if (!scroller) return;

    ensureLayout();
    const currentScrollTop = scroller.scrollTop;
    let scrollAdjustment = 0;
    let measurementsChanged = false;

    for (const entry of entries) {
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

function measureOwnRegions(itemElement: HTMLElement, childrenElement?: HTMLElement): VirtualMeasurement {
  const itemRect = itemElement.getBoundingClientRect();
  if (!childrenElement || !itemElement.contains(childrenElement)) {
    return { beforeChildren: itemRect.height, afterChildren: 0 };
  }

  const childrenRect = childrenElement.getBoundingClientRect();
  const beforeChildren = clampVirtualPosition(childrenRect.top - itemRect.top, 0, itemRect.height);
  const afterChildren = clampVirtualPosition(
    itemRect.bottom - childrenRect.bottom,
    0,
    itemRect.height - beforeChildren
  );

  return { beforeChildren, afterChildren };
}

const DYNAMIC_LAYOUT_PRIORITY = 10;
const DEFAULT_ESTIMATED_OWN_HEIGHT = 120;
const MEASUREMENT_EPSILON = 0.5;
const EMPTY_FEATURE_ITEMS: readonly never[] = [];
