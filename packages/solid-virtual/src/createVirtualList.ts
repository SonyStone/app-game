import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createMemo } from 'solid-js';
import type { DynamicVirtualListProps as DynamicFeatureProps } from './createDynamicHeight';
import { createVirtualListCore, type BaseVirtualListProps, type VirtualListCore } from './createVirtualListCore';
import {
  alignVirtualItem,
  clampVirtualPosition,
  createVirtualListFeatureHost,
  isVirtualListFeature,
  positiveVirtualSize,
  VIRTUAL_LIST_FEATURE,
  type VirtualFeatureList
} from './virtualListFeature';

/** Creates a flat virtual list with opt-in DOM measurement. */
export function createVirtualList<T>(props: DynamicVirtualListProps<T>): DynamicVirtualList<T>;
/** Creates an arithmetic fixed-height flat virtual list. */
export function createVirtualList<T>(props: FixedVirtualListProps<T>): FixedVirtualList<T>;
export function createVirtualList<T>(inputProps: VirtualListProps<T>): VirtualList<T> {
  const props = createVirtualListCore<T, VirtualListProps<T>>(inputProps);

  if (!isDynamicVirtualListProps(props)) return createFixedLayout(props);

  const host = createVirtualListFeatureHost(props, props.itemHeight);
  props.itemHeight[VIRTUAL_LIST_FEATURE](host);
  return host.create();
}

export type { BaseVirtualListProps } from './createVirtualListCore';

/** Options for the optimized fixed-height flat layout. */
export type FixedVirtualListProps<T> = BaseVirtualListProps<T> &
  Readonly<{
    /** Exact height of one item in pixels. May be a reactive accessor. */
    itemHeight: MaybeAccessor<number>;
  }>;

/** Options for a flat list with the dynamic-height feature. */
export type DynamicVirtualListProps<T> = DynamicFeatureProps<T>;

/** Options accepted by {@link createVirtualList}. */
export type VirtualListProps<T> = FixedVirtualListProps<T> | DynamicVirtualListProps<T>;

/** Result returned by any {@link createVirtualList} mode. */
export type VirtualList<T> = FixedVirtualList<T> | DynamicVirtualList<T>;

/** Result returned by a flat list using dynamic DOM measurement. */
export type DynamicVirtualList<T> = VirtualFeatureList<T>;

type FixedVirtualList<T> = ReturnType<typeof createFixedLayout<T>>;

type FixedLayoutProps<T> = VirtualListCore<T> & Pick<FixedVirtualListProps<T>, 'itemHeight'>;

function createFixedLayout<T>(props: FixedLayoutProps<T>) {
  const items = createMemo(() => access(props.items));
  const element = () => access(props.elementRef);
  const viewportHeight = createMemo(() => access(props.viewportHeight));
  const scrollPosition = createMemo(() => access(props.scrollPosition));
  const gap = createMemo(() => Math.max(0, access(props.gap)));
  const overscan = createMemo(() => Math.max(0, access(props.overscan)));
  const itemHeight = createMemo(() => positiveVirtualSize(access(props.itemHeight), DEFAULT_ITEM_HEIGHT));
  const stride = createMemo(() => itemHeight() + gap());
  const totalHeight = createMemo(() => {
    const itemCount = items().length;
    return itemCount === 0 ? 0 : itemCount * stride() - gap();
  });
  const startIndex = createMemo(() => {
    const visibleTop = Math.max(0, scrollPosition() - overscan());
    return Math.min(items().length, Math.floor(visibleTop / stride()));
  });
  const endIndex = createMemo(() => {
    const visibleBottom = scrollPosition() + viewportHeight() + overscan();
    return Math.min(items().length, Math.ceil(visibleBottom / stride()));
  });
  type VisibleChild = Readonly<{ item: T; index: number; top: number; height: number }>;
  const initialChildren: readonly VisibleChild[] = [];
  const visibleChildren = createMemo((previous: readonly VisibleChild[]) => {
    const currentItems = items();
    const currentStartIndex = startIndex();
    const currentEndIndex = endIndex();
    const currentItemHeight = itemHeight();
    const currentStride = stride();
    const childCount = currentEndIndex - currentStartIndex;
    if (childCount === 0) return previous.length === 0 ? previous : initialChildren;

    const previousStart = previous[0]?.index ?? -1;
    let next =
      previous.length === childCount && previousStart === currentStartIndex
        ? undefined
        : new Array<VisibleChild>(childCount);

    for (let offset = 0; offset < childCount; offset += 1) {
      const index = currentStartIndex + offset;
      const item = currentItems[index] as T; // `endIndex` is clamped to `currentItems.length`.
      const previousChild = previous[index - previousStart];
      const top = index * currentStride;
      const child =
        previousChild?.index === index &&
        previousChild.item === item &&
        previousChild.height === currentItemHeight &&
        previousChild.top === top
          ? previousChild
          : { item, index, top, height: currentItemHeight };

      if (!next && child !== previous[offset]) next = previous.slice();
      if (next) next[offset] = child;
    }

    return next ?? previous;
  }, initialChildren);

  return {
    /** Visible items and their absolute layout data. */
    children: visibleChildren,
    /** Complete scrollable height. */
    get totalHeight(): number {
      return totalHeight();
    },
    /** Space represented before the first rendered item. */
    get paddingTop(): number {
      return startIndex() * stride();
    },
    /** Space represented after the last rendered item. */
    get paddingBottom(): number {
      return (items().length - endIndex()) * stride();
    },
    /** Current scroll offset in pixels. */
    get scrollPosition(): number {
      return scrollPosition();
    },
    /** Current viewport height in pixels. */
    get viewportHeight(): number {
      return viewportHeight();
    },
    /** Fixed item height in pixels. */
    get itemHeight(): number {
      return itemHeight();
    },
    /** Configured vertical space between items. */
    get gap(): number {
      return gap();
    },
    /** Number of pixels rendered outside each viewport edge. */
    get overscan(): number {
      return overscan();
    },
    /** Index of the first rendered item. */
    get startIndex(): number {
      return startIndex();
    },
    /** Exclusive index after the last rendered item. */
    get endIndex(): number {
      return endIndex();
    },
    /** Scrolls an item index into view. */
    scrollToIndex(
      index: number,
      options: Readonly<{ align?: ScrollLogicalPosition; behavior?: ScrollBehavior }> = {}
    ): boolean {
      const currentElement = element();
      if (!currentElement || index < 0 || index >= items().length) return false;

      const itemStart = index * stride();
      const top = alignVirtualItem({
        align: options.align ?? 'nearest',
        current: currentElement.scrollTop,
        itemStart,
        itemEnd: itemStart + itemHeight(),
        viewportHeight: viewportHeight(),
        totalHeight: totalHeight()
      });
      currentElement.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    },
    /** Scrolls to an absolute vertical offset, clamped to the current layout. */
    scrollToOffset(position: number, options: Readonly<{ behavior?: ScrollBehavior }> = {}): boolean {
      const currentElement = element();
      if (!currentElement) return false;

      const maximum = Math.max(0, totalHeight() - viewportHeight());
      const top = clampVirtualPosition(Number.isFinite(position) ? position : 0, 0, maximum);
      currentElement.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    }
  };
}

function isDynamicVirtualListProps<T>(props: VirtualListProps<T>): props is DynamicVirtualListProps<T> {
  return isVirtualListFeature<T>(props.itemHeight);
}

const DEFAULT_ITEM_HEIGHT = 120;
