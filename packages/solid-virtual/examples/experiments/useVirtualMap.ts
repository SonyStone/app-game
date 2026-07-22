import { createMemo, createSignal, mapArray, type Accessor, type Setter } from 'solid-js';

const SELF_EMPTY_HEIGHT = 100;

/** Preserves the early recursive-height-map experiment for design comparison. */
export function useVirtualMap<T>(props: { items: WithChildren<T>[] }) {
  const map = new Map<WithChildren<T>, { setHeight: Setter<number> }>();
  const nestedList = createMemo(
    mapArray(
      () => props.items,
      (item) => createVirtualElement({ item, children: item.children, map })
    )
  );
  const listHeight = createListHeight(nestedList);

  return { nestedList, map, listHeight };
}

type WithChildren<T> = T & { children: WithChildren<T>[] };

function createVirtualElement<T>(props: {
  item: WithChildren<T>;
  children: WithChildren<T>[];
  map: Map<WithChildren<T>, { setHeight: Setter<number> }>;
}): {
  readonly height: number;
  readonly listHeight: number;
  readonly children: ReturnType<typeof createVirtualElement<T>>[];
} {
  const [height, setHeight] = createSignal(2_000);
  props.map.set(props.item, { setHeight });
  const children = createMemo(
    mapArray(
      () => props.children,
      (item) => createVirtualElement({ item, children: item.children, map: props.map })
    )
  );
  const listHeight = createListHeight(children);

  return {
    get height() {
      return height();
    },
    get listHeight() {
      return listHeight();
    },
    get children() {
      return children();
    }
  };
}

function createListHeight(items: Accessor<readonly { height: number }[]>): Accessor<number> {
  return createMemo(() => items().reduce((total, element) => total + element.height, SELF_EMPTY_HEIGHT));
}
