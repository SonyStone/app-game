import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createGetterObject } from '@utils/createGetterObject';
import { createMemo, createSignal, mapArray, on } from 'solid-js';
import { createMultipleElementSizes } from './createMultipleElementSizes';
import { createMutationObserverRecords } from './createMutationObserverRecords';

/**
 * To subscribe to all data we need:
 * - top - children position from the top of document + scrollPosition of the container
 *
 *
 */
export function createRegularList<T>(props: {
  items: MaybeAccessor<readonly T[]>; // The items to display
  rowHeight: MaybeAccessor<number>;
  elementRef: MaybeAccessor<Element | undefined>;
  listRef?: MaybeAccessor<Element | undefined>;
}) {
  const size = createElementSize(() => access(props.elementRef));
  const viewportHeight = createMemo(() => size.height ?? 0);
  const scrollPosition = (() => {
    const scrollPosition = createScrollPosition(props.elementRef);
    return createMemo(() => scrollPosition.y);
  })();

  const childListMutations = createMutationObserverRecords(props.listRef ?? props.elementRef);

  const sizes = createMultipleElementSizes();

  const totalHeight = createMemo(
    on([childListMutations, sizes.anySizeChanged], () => access(props.elementRef)?.scrollHeight ?? 0)
  );

  const children = createMemo(
    mapArray(
      () => access(props.items),
      (item) => {
        const [elementRef, setElementRef] = createSignal<HTMLElement | undefined>();

        const size = sizes.observe(elementRef);

        const top = createMemo(
          on([viewportHeight, childListMutations, sizes.anySizeChanged], () => {
            return (elementRef()?.getBoundingClientRect().top ?? 0) + scrollPosition();
          })
        );

        const height = createMemo(() => size.height ?? 0);

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

  return Object.assign(
    createGetterObject({
      scrollPosition,
      viewportHeight,
      totalHeight,
      visibleHeight: createMemo(() => 6000) // Not used in this implementation
    }),
    {
      visibleItems: props.items as T[],
      children,
      paddingTop: 0,
      paddingBottom: 0,
      scrollTo(position: number) {
        const el = access(props.elementRef) as HTMLElement | undefined;
        if (!el) return;
        el.scrollTo({ top: position, behavior: 'smooth' });
      }
    }
  );
}
