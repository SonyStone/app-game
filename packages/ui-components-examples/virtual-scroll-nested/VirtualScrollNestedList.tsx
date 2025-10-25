import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access } from '@solid-primitives/utils';
import createContextProvider from '@utils/createContextProvider';
import { createGetterObject } from '@utils/createGetterObject';
import { Accessor, createEffect, createMemo, createSignal, For, onCleanup, onMount, ParentProps } from 'solid-js';
import { NestedItem } from '.';
import { getColorByIndex } from '../virtual-scroll/get-bg-color';
import { useVirtualMap } from './useVirtualMap';
import { VirtualScrollPreview } from './VirtualPreview';

function createViewportHeight(target: Accessor<Element | false | undefined | null>) {
  const size = createElementSize(target);
  const viewportHeight = createMemo(() => size.height ?? 0);
  return viewportHeight;
}

/**
 * I need an access to the root element of the virtual list for each item
 * I need an access to the first level
 */
const [VirtualList, useVirtualList] = createContextProvider();

/**
 * Row Height is dynamic now, we dont know each row height.
 * We have default row height, but we need to measure each row height and replace default one
 *
 * And we need to calculate startIndex and endIndex based on dynamic heights
 * - startIndex - we need to loop through the list and sum the heights until we reach the scroll position
 * - endIndex - we need to loop through the list and sum the heights until we reach the scroll position + viewport height
 */
function createVirtualList(props: { items: NestedItem[]; buffer?: number }) {
  // ! Element where scroll itself is
  const [scrollerElementRef, setScrollerElement] = createSignal<HTMLDivElement | undefined>();

  const virtualMap = useVirtualMap({ items: props.items });

  const buffer = createMemo(() => access(props.buffer ?? 2));
  const items = createMemo(() => access(props.items));

  // ! Scroll Position
  const scrollPosition = (() => {
    const scrollPosition = createScrollPosition(scrollerElementRef);
    return createMemo(() => scrollPosition.y);
  })();
  // ! Viewport Height
  const viewportHeight = createViewportHeight(scrollerElementRef);

  const boundingBox = createGetterObject({
    top: createMemo(() => scrollPosition()),
    bottom: createMemo(() => scrollPosition() + viewportHeight())
  });

  // createEffect(() => {
  //   const ref = scrollerElementRef();
  //   if (!ref) return;
  //   console.log('🌲 Scroll Position', scrollPosition(), ref.scrollTop, ref.getBoundingClientRect());
  // });

  const startIndex = createMemo(() => {
    let total = 0;
    let index = 0;
    const top = boundingBox.top;
    const list = virtualMap.nestedList();
    while (index < items().length && total < top) {
      total += list[index].height;
      if (total >= top) break;
      index++;
    }
    return Math.max(0, index - buffer());
  });

  const endIndex = createMemo(() => {
    let total = 0;
    let index = 0;
    const bottom = boundingBox.bottom;
    const list = virtualMap.nestedList();
    while (index < items().length && total < bottom) {
      total += list[index].height;
      if (total >= bottom) break;
      index++;
    }
    return Math.min(items().length, index + buffer());
  });

  const paddingTop = createMemo(() => {
    let total = 0;
    for (let i = 0; i < startIndex(); i++) {
      total += virtualMap.nestedList()[i]?.height ?? 100;
    }
    return total;
  });

  const paddingBottom = createMemo(() => {
    let total = 0;
    for (let i = endIndex(); i < items().length; i++) {
      total += virtualMap.nestedList()[i]?.height ?? 100;
    }
    return total;
  });
  const totalHeight = createMemo(() => virtualMap.listHeight());

  const visibleItems = createMemo(() => items().slice(startIndex(), endIndex()) as unknown as NestedItem[]);

  const visibleHeight = createMemo(() => {
    let total = 0;
    for (let i = startIndex(); i < endIndex(); i++) {
      total += virtualMap.nestedList()[i]?.height ?? 100;
    }
    return total;
  });

  const childParentMap = new Map<NestedItem, HTMLElement>();

  /**
   * To calculate how much padding top and padding bottom we need to add
   * We need to know
   * - the height of each item
   * - the total height of the list
   * - gap between each item
   * - gap between first item and top of the container
   * - gap between last item and bottom of the container
   *
   * We need to measure each item height and store it in a map
   */
  const createSizeVirtual = (name: string, item: NestedItem, parent?: NestedItem) => (elementRef: HTMLElement) => {
    onMount(() => {
      childParentMap.set(item, elementRef);

      const size = createElementSize(elementRef);
      createEffect(() => {
        const { setHeight } = virtualMap.map.get(item) ?? {};
        if (setHeight) {
          setHeight(size.height ?? 100);
        }
      });

      const position = createMemo(() => {
        if (!parent) return 0;
        scrollPosition(); // TODO: remove
        const parentElement = childParentMap.get(parent);
        if (!parentElement) return 0;
        return elementRef.getBoundingClientRect().y - parentElement.getBoundingClientRect().y;
      });

      onCleanup(() => {
        childParentMap.delete(item);
      });
    });
  };

  // createEffect(() => {
  //   console.log('🌲 Virtual Map', virtualMap.nestedList());
  // });

  const scrollTo = (position: number) => {
    const scroller = scrollerElementRef();
    if (scroller) {
      scroller.scrollTo({ top: position });
    }
  };

  return Object.assign(
    createGetterObject({
      visibleItems,
      paddingTop,
      paddingBottom,
      totalHeight,
      visibleHeight,
      scrollPosition,
      viewportHeight,
      startIndex,
      endIndex
    }),
    {
      ...boundingBox,
      createSizeVirtual,
      scrollTo,
      setScrollerElement
    }
  );
}

export function VirtualScrollNestedList(props: { items: NestedItem[]; buffer?: number }) {
  const virtual = createVirtualList(props);

  function SubVirtual(props: ParentProps & { items: NestedItem[]; buffer?: number }) {
    return (
      <>
        <div class="absolute right-5 top-2 z-10 rounded border bg-white p-2 text-xs shadow">
          <div>Total Items: {props.items.length}</div>
          <div>Scroll Position: {virtual.scrollPosition}</div>
          {/* <div>Viewport Height: {virtual.viewportHeight()}</div> */}
        </div>
        {props.children}
      </>
    );
  }

  return (
    <div class="relative flex flex-1 flex-col">
      {/* Debug Info */}
      <div class="absolute right-40 top-2 z-10 rounded border bg-white p-2 text-xs shadow">
        <div>Total Items: {props.items.length}</div>
        <div>Scroll Position: {virtual.scrollPosition}</div>
        <div>
          Viewport Height: {virtual.top} | {virtual.bottom}
        </div>
        <div>
          Visible Items: {virtual.startIndex} : {virtual.endIndex}
        </div>
        <div>Visible Items: {virtual.visibleItems.length}</div>
      </div>

      <div class="bg-gray-200 p-2 text-xs font-medium">Virtualized List</div>

      <div class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-auto" ref={virtual.setScrollerElement} style="outline: none;" tabindex="0">
          <ul
            class="mt-2 box-border select-none px-2"
            style={{
              'padding-top': `${virtual.paddingTop}px`,
              'padding-bottom': `${virtual.paddingBottom}px`
            }}
          >
            <For each={virtual.visibleItems}>
              {(item: NestedItem) => (
                <Item
                  title={`Item ${item.id}`}
                  class={`${getColorByIndex(item.id as number)} relative`}
                  data-index={item.id}
                  data-item-index={item.id}
                  style={{
                    'overflow-anchor': 'none'
                  }}
                  ref={virtual.createSizeVirtual(`item-${item.id}`, item)}
                >
                  <For each={item.children}>
                    {(child, index) => (
                      <Item
                        ref={(ref) => {
                          // if (item.id === 0 && child.id === 0) {
                          //   console.log(`Render grid item-${item.id}-${child.id}`);
                          // }
                          virtual.createSizeVirtual(`item-${item.id}-${child.id}`, child, item)(ref);
                        }}
                        class="group-child"
                        title={`Child ${child.id}`}
                        index={index()}
                        data={child.data}
                      />
                    )}
                  </For>
                </Item>
              )}
            </For>
          </ul>
        </div>
        <VirtualScrollPreview {...virtual} scrollTo={virtual.scrollTo} />
      </div>
    </div>
  );
}
