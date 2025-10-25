import { createGetterObject } from '@utils/createGetterObject';
import { Accessor, createMemo, createSignal, mapArray, Setter } from 'solid-js';

type WithChildren<T> = T & { children: WithChildren<T>[] };

const SELF_EMPTY_HEIGHT = 100;

function createListHeight(items: Accessor<{ height: number }[]>): Accessor<number> {
  return createMemo(() => {
    let total = 0;
    for (const element of items()) {
      total += element.height;
    }
    total += SELF_EMPTY_HEIGHT;
    return total;
  });
}

function VirtualElement<T>(props: {
  item: WithChildren<T>;
  children: WithChildren<T>[];
  map: Map<WithChildren<T>, { setHeight: Setter<number> }>;
}): {
  height: number;
  listHeight: number;
  children: ReturnType<typeof VirtualElement<T>>[];
} {
  const [height, setHeight] = createSignal(2000);
  props.map.set(props.item, { setHeight });

  const children = createMemo(
    mapArray(
      () => props.children,
      (item) => VirtualElement({ item, children: item.children, map: props.map })
    )
  );

  const listHeight = createListHeight(children);

  return createGetterObject({
    height,
    listHeight,
    children
  });
}

/**
 * TODO:
 * - I need to get a hight of each item and store it in a map
 * - I need to get full hight of the list
 * - I need to get hight of each item
 * ```typescript
 * [
 *   {
 *    height: 100,
 *    children: [
 *      { height: 50, children: [] },
 *      { height: 50, children: [] }
 *    ]
 *   }
 * ]
 * ```
 */
export function useVirtualMap<T>(props: { items: WithChildren<T>[] }) {
  const map = new Map<WithChildren<T>, { setHeight: Setter<number> }>();

  const nestedList = createMemo(
    mapArray(
      () => props.items,
      (item) => VirtualElement({ item, children: item.children, map })
    )
  );

  const listHeight = createListHeight(nestedList);

  return {
    nestedList,
    map,
    listHeight
  };
}
