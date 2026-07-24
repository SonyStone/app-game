import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createMemo, createSignal, mapArray } from 'solid-js';

/** Measures every dynamic-height item for the non-virtualized comparison. */
export function createRegularList<T>(props: {
  /** Items rendered by the comparison. */
  items: MaybeAccessor<readonly T[]>;
  /** Fallback height used before an item is measured. */
  rowHeight: MaybeAccessor<number>;
  /** Scrollable comparison element. */
  elementRef: MaybeAccessor<HTMLElement | undefined>;
  /** Vertical space between rendered items. Defaults to `0`. */
  gap?: MaybeAccessor<number>;
}) {
  const scrollerSize = createElementSize(() => access(props.elementRef));
  const scroll = createScrollPosition(() => access(props.elementRef));
  const children = createMemo(
    mapArray(
      () => access(props.items),
      (item) => {
        const [element, setElementRef] = createSignal<HTMLElement | undefined>();
        const size = createElementSize(element);

        return {
          item,
          setElementRef,
          get top(): number {
            const scroller = access(props.elementRef);
            const itemElement = element();
            if (!scroller || !itemElement) return 0;
            return itemElement.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroll.y;
          },
          get height(): number {
            return size.height ?? access(props.rowHeight);
          }
        };
      }
    )
  );

  return {
    children,
    get totalHeight(): number {
      const gap = access(props.gap ?? 0);
      const measuredHeight =
        children().reduce((total, child) => total + child.height, 0) + Math.max(0, children().length - 1) * gap;
      return Math.max(access(props.elementRef)?.scrollHeight ?? 0, measuredHeight);
    },
    get viewportHeight(): number {
      return scrollerSize.height ?? 0;
    },
    get scrollPosition(): number {
      return scroll.y;
    },
    get paddingTop(): number {
      return 0;
    },
    get paddingBottom(): number {
      return 0;
    },
    /** Scrolls the comparison to an absolute offset. */
    scrollToOffset(position: number): boolean {
      const element = access(props.elementRef);
      if (!element) return false;
      element.scrollTo({ top: position, behavior: 'smooth' });
      return true;
    }
  };
}
