import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createMemo } from 'solid-js';

/** Creates a headless fixed-height virtual list. */
export function createVirtualList<T>(props: {
  /** Items in display order. May be a reactive accessor. */
  items: MaybeAccessor<readonly T[]>;
  /** Fixed height of one item in pixels. */
  rowHeight: MaybeAccessor<number>;
  /** Scrollable element containing the rendered list. */
  elementRef: MaybeAccessor<HTMLElement | undefined>;
  /** Extra items rendered before and after the viewport. Defaults to `2`. */
  overscan?: MaybeAccessor<number>;
}) {
  const size = createElementSize(() => access(props.elementRef));
  const scroll = createScrollPosition(() => access(props.elementRef));
  const items = createMemo(() => access(props.items));
  const rowHeight = createMemo(() => Math.max(1, access(props.rowHeight)));
  const overscan = createMemo(() => Math.max(0, Math.floor(access(props.overscan ?? 2))));
  const viewportHeight = createMemo(() => size.height ?? 0);
  const totalHeight = createMemo(() => items().length * rowHeight());
  const range = createMemo(() => {
    const firstVisible = Math.floor(Math.max(0, scroll.y) / rowHeight());
    const visibleCount = Math.ceil(viewportHeight() / rowHeight());
    const start = Math.max(0, firstVisible - overscan());
    const end = Math.min(items().length, firstVisible + visibleCount + overscan());
    return { start, end };
  });
  const visibleChildren = createMemo(() =>
    items()
      .slice(range().start, range().end)
      .map((item, offset) => {
        const index = range().start + offset;
        return { item, index, top: index * rowHeight(), height: rowHeight() } as const;
      })
  );

  return {
    /** Visible items and their absolute layout data. */
    children: visibleChildren,
    /** Estimated total list height. */
    get totalHeight(): number {
      return totalHeight();
    },
    /** Space represented before the first rendered item. */
    get paddingTop(): number {
      return range().start * rowHeight();
    },
    /** Space represented after the last rendered item. */
    get paddingBottom(): number {
      return (items().length - range().end) * rowHeight();
    },
    /** Current scroll offset in pixels. */
    get scrollPosition(): number {
      return scroll.y;
    },
    /** Current viewport height in pixels. */
    get viewportHeight(): number {
      return viewportHeight();
    },
    /** Fixed item height in pixels. */
    get rowHeight(): number {
      return rowHeight();
    },
    /** Number of items rendered outside each viewport edge. */
    get overscan(): number {
      return overscan();
    },
    /** Index of the first rendered item. */
    get startIndex(): number {
      return range().start;
    },
    /** Exclusive index after the last rendered item. */
    get endIndex(): number {
      return range().end;
    },
    /** Scrolls an item index into view. */
    scrollToIndex(
      index: number,
      options: Readonly<{ align?: ScrollLogicalPosition; behavior?: ScrollBehavior }> = {}
    ): boolean {
      const element = access(props.elementRef);
      if (!element || index < 0 || index >= items().length) return false;

      const top = alignScrollOffset({
        align: options.align ?? 'nearest',
        current: element.scrollTop,
        itemStart: index * rowHeight(),
        itemEnd: (index + 1) * rowHeight(),
        viewportHeight: viewportHeight(),
        totalHeight: totalHeight()
      });
      element.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    },
    /** Scrolls to an absolute vertical offset, clamped to the current layout. */
    scrollToOffset(position: number, options: Readonly<{ behavior?: ScrollBehavior }> = {}): boolean {
      const element = access(props.elementRef);
      if (!element) return false;

      const maximum = Math.max(0, totalHeight() - viewportHeight());
      const top = clamp(Number.isFinite(position) ? position : 0, 0, maximum);
      element.scrollTo({ top, behavior: options.behavior ?? 'auto' });
      return true;
    }
  };
}

/** Props accepted by {@link createVirtualList}. */
export type VirtualListProps<T> = Parameters<typeof createVirtualList<T>>[0];

function alignScrollOffset(props: {
  align: ScrollLogicalPosition;
  current: number;
  itemStart: number;
  itemEnd: number;
  viewportHeight: number;
  totalHeight: number;
}): number {
  const maximum = Math.max(0, props.totalHeight - props.viewportHeight);
  const aligned = (() => {
    if (props.align === 'start') return props.itemStart;
    if (props.align === 'center')
      return props.itemStart - (props.viewportHeight - (props.itemEnd - props.itemStart)) / 2;
    if (props.align === 'end') return props.itemEnd - props.viewportHeight;
    if (props.itemStart < props.current) return props.itemStart;
    if (props.itemEnd > props.current + props.viewportHeight) return props.itemEnd - props.viewportHeight;
    return props.current;
  })();

  return clamp(aligned, 0, maximum);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
