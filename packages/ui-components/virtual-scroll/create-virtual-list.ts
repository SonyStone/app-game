import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createGetterObject } from '@utils/createGetterObject';
import { createMemo } from 'solid-js';

/**
 * To make VirtualList list work, we need
 * - viewport size
 * - scroll position
 * - row height
 *
 * on scroll we need to calculate which items are visible
 * - start index
 * - end index
 * and how much padding we need to add to the top and bottom of the list
 * - paddingTop
 * - paddingBottom
 *
 * then we can slice the items array to get visible items
 * - visibleItems
 */

export function createVirtualList<T extends readonly unknown[]>(props: {
  /** Define the properties you need for your virtual list */
  items: MaybeAccessor<T>; // The items to display
  /** The height of each row */
  rowHeight: MaybeAccessor<number>;
  /** Optional buffer for pre-rendering */
  buffer?: MaybeAccessor<number>;
  /** Reference to the container element */
  elementRef: MaybeAccessor<Element | undefined>;
}) {
  const size = createElementSize(() => access(props.elementRef));
  const viewportHeight = createMemo(() => size.height ?? 0);
  const scrollPosition = (() => {
    const scrollPosition = createScrollPosition(props.elementRef);
    return createMemo(() => scrollPosition.y);
  })();
  const rowHeight = createMemo(() => access(props.rowHeight));
  const buffer = createMemo(() => access(props.buffer ?? 2));
  const items = createMemo(() => access(props.items));
  const totalHeight = createMemo(() => items().length * rowHeight());

  const visibleCount = createMemo(() => Math.ceil(viewportHeight() / rowHeight()));

  const startIndex = createMemo(() => Math.max(0, Math.floor(scrollPosition() / rowHeight()) - buffer()));
  const endIndex = createMemo(() => Math.min(items().length, startIndex() + visibleCount() + buffer() * 2));

  const paddingTop = createMemo(() => startIndex() * rowHeight());
  const paddingBottom = createMemo(() => (items().length - endIndex()) * rowHeight());

  const visibleItems = createMemo(() => items().slice(startIndex(), endIndex()) as unknown as T);

  const visibleHeight = createMemo(() => visibleItems().length * rowHeight());

  const scrollTo = (position: number) => {
    const el = access(props.elementRef) as HTMLElement | undefined;
    if (!el) return;
    el.scrollTo({ top: position, behavior: 'smooth' });
  };

  return Object.assign(
    createGetterObject({
      visibleItems,
      paddingTop,
      paddingBottom,
      totalHeight,
      startIndex,
      endIndex,
      visibleCount,
      viewportHeight,
      buffer,
      scrollPosition,
      rowHeight,
      visibleHeight
    }),
    {
      scrollTo
    }
  );
}
