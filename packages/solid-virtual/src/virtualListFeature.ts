import type { VirtualListCore } from './createVirtualListCore';

/** Internal protocol implemented by optional virtual-list features. */
export const VIRTUAL_LIST_FEATURE = Symbol('virtual-list-feature');

/** Render data returned when a feature supplies non-uniform item layout. */
export type VirtualFeatureItem<T> = Readonly<{
  /** Source item. */
  item: T;
  /** Zero-based recursive depth. Flat dynamic items use `0`. */
  depth: number;
  /** Number of direct children, including currently unmounted children. */
  childCount: number;
  /** Visible direct children. */
  children: () => readonly VirtualFeatureItem<T>[];
  /** Attaches dynamic measurement to the complete item branch. */
  setElementRef: (element: HTMLElement) => void;
  /** Marks the exact child level inside a dynamically measured branch. */
  setChildrenRef: (element: HTMLElement) => void;
  /** Absolute top edge of the complete item branch. */
  top: number;
  /** Measured or estimated height of the item's own content. */
  ownHeight: number;
  /** Height of the complete branch, excluding the following sibling gap. */
  height: number;
  /** Total height occupied by direct descendant branches. */
  childrenHeight: number;
  /** Space represented before the first rendered direct child. */
  paddingTop: number;
  /** Space represented after the last rendered direct child. */
  paddingBottom: number;
}>;

/** Virtual-list result supplied by dynamic measurement or nested layout. */
export type VirtualFeatureList<T> = Readonly<{
  /** Visible root items in display order. */
  children: () => readonly VirtualFeatureItem<T>[];
  /** Estimated or measured total height of the complete collection. */
  totalHeight: number;
  /** Space represented before the first rendered root item. */
  paddingTop: number;
  /** Space represented after the last rendered root item. */
  paddingBottom: number;
  /** Current scroll offset in pixels. */
  scrollPosition: number;
  /** Current scroll viewport height in pixels. */
  viewportHeight: number;
  /** Configured vertical space between sibling item branches. */
  gap: number;
  /** Scrolls the first visible occurrence of a source item into view. */
  scrollTo: (item: T, options?: Readonly<{ align?: ScrollLogicalPosition; behavior?: ScrollBehavior }>) => boolean;
  /** Scrolls to an absolute vertical offset, clamped to the current layout. */
  scrollToOffset: (position: number, options?: Readonly<{ behavior?: ScrollBehavior }>) => boolean;
}>;

/** Mutable layout fields required by the dynamic-height strategy. */
export type VirtualMeasurementBox = {
  beforeChildren: number;
  afterChildren: number;
  childrenTop: number;
  bottom: number;
};

/** An item's measured regions outside its exact nested child level. */
export type VirtualMeasurement = Readonly<{
  beforeChildren: number;
  afterChildren: number;
}>;

/** Measurement controller created only when dynamic height is installed. */
export type VirtualMeasurementController<Box extends VirtualMeasurementBox> = Readonly<{
  trackMeasurements: () => void;
  readMeasurement: (box: Box) => VirtualMeasurement | undefined;
  setChildrenRef: (element: HTMLElement, box: Box) => void;
  setElementRef: (element: HTMLElement, box: Box) => void;
}>;

/** Sizing capability contributed by `createDynamicHeight`. */
export type VirtualHeightStrategy<T> = Readonly<{
  estimate: (item: T, depth: number) => number;
  createController: <Box extends VirtualMeasurementBox>(ensureLayout: () => void) => VirtualMeasurementController<Box>;
}>;

/** Generic host used to compose optional virtual-list features. */
export type VirtualListFeatureHost<T> = Readonly<{
  core: VirtualListCore<T>;
  itemHeight: unknown;
  heightStrategy: VirtualHeightStrategy<T> | undefined;
  setHeightStrategy: (strategy: VirtualHeightStrategy<T>) => void;
  useLayout: (priority: number, create: () => VirtualFeatureList<T>) => void;
  create: () => VirtualFeatureList<T>;
}>;

/** Feature object accepted by the base virtual-list dispatcher. */
export type VirtualListFeature<T> = Readonly<{
  [VIRTUAL_LIST_FEATURE]: (host: VirtualListFeatureHost<T>) => void;
}>;

/** Creates the generic host through which independent features contribute behavior. */
export function createVirtualListFeatureHost<T>(
  core: VirtualListCore<T>,
  itemHeight: unknown
): VirtualListFeatureHost<T> {
  let heightStrategy: VirtualHeightStrategy<T> | undefined;
  let selectedLayout:
    | Readonly<{
        priority: number;
        create: () => VirtualFeatureList<T>;
      }>
    | undefined;

  return {
    core,
    itemHeight,
    get heightStrategy() {
      return heightStrategy;
    },
    setHeightStrategy(strategy): void {
      heightStrategy = strategy;
    },
    useLayout(priority, create): void {
      if (!selectedLayout || priority > selectedLayout.priority) selectedLayout = { priority, create };
    },
    create(): VirtualFeatureList<T> {
      if (!selectedLayout) throw new Error('Virtual-list features did not provide a layout');
      return selectedLayout.create();
    }
  };
}

/** Returns whether a runtime value implements the virtual-list feature protocol. */
export function isVirtualListFeature<T>(value: unknown): value is VirtualListFeature<T> {
  return typeof value === 'object' && value !== null && VIRTUAL_LIST_FEATURE in value;
}

/** Calculates a native scroll offset for one laid-out item. */
export function alignVirtualItem(props: {
  align: ScrollLogicalPosition;
  current: number;
  itemStart: number;
  itemEnd: number;
  viewportHeight: number;
  totalHeight: number;
}): number {
  const viewportEnd = props.current + props.viewportHeight;
  let position: number;

  switch (props.align) {
    case 'start':
      position = props.itemStart;
      break;
    case 'center':
      position = (props.itemStart + props.itemEnd - props.viewportHeight) / 2;
      break;
    case 'end':
      position = props.itemEnd - props.viewportHeight;
      break;
    case 'nearest': {
      const startPosition = props.itemStart;
      const endPosition = props.itemEnd - props.viewportHeight;
      const itemCoversViewport = props.itemStart <= props.current && props.itemEnd >= viewportEnd;
      const itemInsideViewport = props.itemStart >= props.current && props.itemEnd <= viewportEnd;

      if (itemCoversViewport || itemInsideViewport) position = props.current;
      else {
        const startDistance = Math.abs(startPosition - props.current);
        const endDistance = Math.abs(endPosition - props.current);
        position = startDistance <= endDistance ? startPosition : endPosition;
      }
      break;
    }
  }

  return clampVirtualPosition(position, 0, Math.max(0, props.totalHeight - props.viewportHeight));
}

/** Returns a finite positive size or its fallback. */
export function positiveVirtualSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Clamps a layout or scroll coordinate to an inclusive range. */
export function clampVirtualPosition(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
