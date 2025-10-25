import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createGetterObject } from '@utils/createGetterObject';
import { createMemo, createSignal, mapArray, on, untrack } from 'solid-js';
import { createMultipleElementSizes } from './createMultipleElementSizes';
import { createMutationObserverRecords } from './createMutationObserverRecords';

function getMarginHeight(el: HTMLElement | null | undefined) {
  if (!el) return 0;
  const computedStyle = getComputedStyle(el);
  const marginTop = parseInt(computedStyle.marginTop) || 0;
  const marginBottom = parseInt(computedStyle.marginBottom) || 0;
  return marginTop + marginBottom;
}

export function createVirtualDynamicList<T>(props: {
  items: MaybeAccessor<readonly T[]>; // The items to display
  defaultRowHeight: MaybeAccessor<number>;
  buffer?: MaybeAccessor<number>;
  elementRef: MaybeAccessor<Element | undefined>;
  listRef?: MaybeAccessor<Element | undefined>;
}) {
  const size = createElementSize(() => access(props.elementRef));
  const viewportHeight = createMemo(() => size.height ?? 0);
  const scrollPosition = (() => {
    const scrollPosition = createScrollPosition(props.elementRef);
    return createMemo(() => scrollPosition.y);
  })();
  const buffer = createMemo(() => access(props.buffer ?? 2));

  const childListMutations = createMutationObserverRecords(props.listRef ?? props.elementRef);

  const sizes = createMultipleElementSizes();

  const children = createMemo(
    mapArray(
      () => access(props.items),
      (item, index) => {
        const [elementRef, setElementRef] = createSignal<HTMLElement | undefined>();

        const size = sizes.observe(elementRef);

        let latestTop = 200 * index();
        const top = createMemo(
          on([viewportHeight, childListMutations, sizes.anySizeChanged], () => {
            const currentTop = elementRef()?.getBoundingClientRect().top;
            if (currentTop) {
              latestTop = currentTop + scrollPosition();
            }

            return latestTop;
          })
        );

        const estimatedTop = 200 * index();
        const top2 = createMemo<number>((prev) => {
          const el = elementRef();
          if (!el) {
            return prev || estimatedTop;
          }

          viewportHeight();
          childListMutations();
          sizes.anySizeChanged();
          const currentTop = el.getBoundingClientRect().top;
          return currentTop + scrollPosition();
        });

        let latestHeight = 200;
        const height = createMemo(() => {
          if (size.height) {
            latestHeight = size.height;
          }
          return size.height || latestHeight;
        });

        return Object.assign(
          createGetterObject({
            top,
            height
          }),
          {
            item,
            setElementRef
          }
        );
      }
    )
  );

  const visible = createMemo(() => {
    const scrollTop = scrollPosition();
    const scrollBottom = scrollPosition() + viewportHeight();
    const items = untrack(children);
    let startIndex = 0;
    let endIndex = items.length;
    for (let i = 0; i < items.length; i++) {
      if (items[i].top + items[i].height < scrollTop) {
        startIndex = Math.max(0, i - buffer());
      }
      if (items[i].top >= scrollBottom) {
        endIndex = Math.min(items.length, i + 1 + buffer());
        break;
      }
    }

    return { startIndex, endIndex, count: endIndex - startIndex };
  });

  // Calculate the gap between items (assuming uniform gap)
  const gap = createMemo<number>((prev) => {
    const el1 = children()[visible().startIndex];
    const el2 = children()[visible().startIndex + 1];
    if (!el1 || !el2) return prev || 0;
    if (el1.top === 0 || el2.top === 0) return prev || 0;
    const result = Math.max(0, el2.top - (el1.top + el1.height));
    return result;
  });

  const totalGapSize = createMemo(() => gap() * (props.items.length - 1));

  const totalHeight = createMemo(
    on([childListMutations, sizes.anySizeChanged], () => {
      const items = untrack(children);
      if (items.length === 0) return 0;
      let height = 0;
      for (let i = 0; i < items.length; i++) {
        height += items[i].height;
      }
      const result = height + totalGapSize();
      return result;
    })
  );

  const paddingTop = createMemo(() => {
    const currentChildren = children();
    const currentGap = gap();
    let total = 0;
    for (let i = 0; i < visible().startIndex; i++) {
      total += currentChildren[i]?.height ?? access(props.defaultRowHeight);
    }
    total += currentGap * Math.min(visible().startIndex, 1);

    return total;
  });

  const paddingBottom = createMemo(() => {
    let total = 0;
    for (let i = visible().endIndex; i < children().length; i++) {
      total += children()[i]?.height ?? access(props.defaultRowHeight);
      if (i < children().length - 1) total += gap();
    }
    return total;
  });

  const visibleItems = createMemo(() => children().slice(visible().startIndex, visible().endIndex));

  return Object.assign(
    createGetterObject({
      scrollPosition,
      viewportHeight,
      totalHeight: totalHeight,
      visibleHeight: createMemo(() => 6000), // Not used in this implementation
      paddingTop,
      paddingBottom
    }),
    {
      gap,
      visible,
      visibleItems,
      children: visibleItems,
      scrollTo(position: number) {
        const el = access(props.elementRef) as HTMLElement | undefined;
        if (!el) return;
        el.scrollTo({ top: position, behavior: 'smooth' });
      }
    }
  );
}
