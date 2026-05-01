import { createVirtualList } from '@packages/ui-components/virtual-scroll/create-virtual-list';
import { Brand } from '@packages/utils/Brand.type';
import { createSignal, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Item } from '../virtual-scroll-nested/Item';
import { VirtualScrollPreview } from '../virtual-scroll-nested/VirtualPreview';
import { getRandomObject } from '../virtual-scroll-nested/getRandomObject';
import { DebugView } from './DebugView';
import { createRegularList } from './createRegularList';
import { createVirtualDynamicList } from './createVirualDynamicList';
import { getColorByIndex } from './get-bg-color';

export type ItemId = Brand<string, 'ItemId'>;

export type Item = {
  id: ItemId;
  index: number;
  data: Record<string, string>;
};

export default function VirtualScrollExample() {
  const [store, setStore] = createStore<Item[]>(
    Array.from({ length: 200 }, (_, i) => ({ id: `item-${i}` as ItemId, index: i, data: getRandomObject() }))
  );

  const actions = {
    addItemAfter: (index: number) => {
      setStore((items) => [
        ...items.slice(0, index + 1),
        { id: (`new` + items.length) as ItemId, index: items.length, data: getRandomObject() },
        ...items.slice(index + 1)
      ]);
    },
    removeItem: (id: ItemId) => {
      setStore((items) => items.filter((item) => item.id !== id));
    },
    updateItem: (index: number, data: Record<string, string>) => {
      setStore(index, (item) => ({ ...item, data }));
    },
    updateItemId: (index: number, id: ItemId) => {
      setStore(index, (item) => ({ ...item, id }));
    }
  };

  return (
    <div class="flex h-full gap-10 overflow-hidden">
      <VirtualListExample items={store} rowHeight={128} />
      {/* <VirtualListExample2 items={store} rowHeight={128} /> */}
      <VirtualDynamicList items={store} rowHeight={128} {...actions} />
      {/* <OriginalList items={store} rowHeight={128} {...actions} /> */}
    </div>
  );
}

// Using `padding-top` and `padding-bottom`
function VirtualListExample(props: { items: Item[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createVirtualList({
    items: props.items,
    rowHeight: props.rowHeight,
    elementRef: scroller
  });

  return (
    <div class="relative flex flex-1">
      <DebugView {...virtual} />

      <div class="relative h-full flex-1 overflow-y-auto outline-none" ref={setScroller}>
        <div
          class="mt-0 box-border"
          style={{
            'padding-top': `${virtual.paddingTop}px`,
            'padding-bottom': `${virtual.paddingBottom}px`
          }}
        >
          <For each={virtual.visibleItems}>
            {(item, index) => (
              <div
                class={getColorByIndex(index())}
                style={{
                  height: `${virtual.rowHeight}px`,
                  'overflow-anchor': 'none'
                }}
              >
                <div>Item {item.id}</div>
                <div>Index {index()}</div>
              </div>
            )}
          </For>
        </div>
      </div>
      <VirtualScrollPreview {...virtual} />
    </div>
  );
}

// Using `transform: translateY`
function VirtualListExample2(props: { items: Item[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createVirtualList({
    items: props.items,
    rowHeight: props.rowHeight,
    buffer: 2,
    elementRef: scroller
  });

  return (
    <div class="relative flex flex-1">
      <DebugView {...virtual} />
      <div
        class="relative h-full flex-1 flex-1 overflow-y-auto outline-none"
        ref={setScroller}
        data-testid="virtuoso-scroller"
      >
        <div
          data-testid="virtuoso-item-list"
          class="absolute left-0 top-0 w-full contain-content"
          style={{
            transform: `translateY(${virtual.paddingTop}px)`
          }}
        >
          <For each={virtual.visibleItems}>
            {(item, index) => (
              <div
                class={getColorByIndex(index())}
                style={{
                  height: `${virtual.rowHeight}px`,
                  'overflow-anchor': 'none'
                }}
              >
                <div>Item {item.id}</div>
                <div>Index {index()}</div>
              </div>
            )}
          </For>
        </div>
        <div data-testid="cdk-virtual-scroll-spacer" style={{ height: `${virtual.totalHeight}px` }}></div>
      </div>
      <VirtualScrollPreview {...virtual} />
    </div>
  );
}

function VirtualDynamicList(props: {
  items: Item[];
  rowHeight: number;
  addItemAfter: (index: number) => void;
  removeItem: (id: ItemId) => void;
  updateItem: (index: number, data: Record<string, string>) => void;
  updateItemId: (index: number, id: ItemId) => void;
}) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createVirtualDynamicList({
    items: props.items,
    elementRef: scroller,
    buffer: 5,
    defaultRowHeight: () => props.rowHeight
  });

  return (
    <div class="relative flex flex-1">
      <div class="bg-warmGray z-1 absolute start-20 rounded border bg-gray-200 p-2">
        <code>
          <pre>Total Height: {virtual.totalHeight}</pre>
          <pre>Viewport Height: {virtual.viewportHeight}</pre>
          <pre>Scroll Position: {virtual.scrollPosition}</pre>
          <pre>Visible Count: {virtual.children().length}</pre>
          <pre>
            Indexes: {virtual.visible().startIndex} {virtual.visible().endIndex}
          </pre>
          <pre>Items in viewport: {virtual.visible().count}</pre>
          <pre>Padding Top: {virtual.paddingTop}</pre>
          <pre>Padding Bottom: {virtual.paddingBottom}</pre>
          <pre>Gap: {virtual.gap()}</pre>
        </code>
      </div>
      <ul ref={setScroller} class="relative flex h-full flex-1 flex-col overflow-y-auto p-1 outline-none">
        <div
          class="mt-0 box-border flex flex-col gap-0"
          style={{
            'padding-top': `${virtual.paddingTop}px`,
            'padding-bottom': `${virtual.paddingBottom}px`
          }}
        >
          <For each={virtual.children()}>
            {(child, index) => (
              <Item
                ref={child.setElementRef}
                onAdd={() => props.addItemAfter(index())}
                onRemove={() => props.removeItem(child.item.id)}
                onValueChange={(data) => props.updateItem(child.item.index, data)}
                onItemIdChange={(id) => props.updateItemId(child.item.index, id)}
                title={child.item.id}
                index={child.item.index}
                data={child.item.data}
              >
                <pre>{child.top}</pre>
              </Item>
            )}
          </For>
        </div>
      </ul>
      <VirtualScrollPreview {...virtual} children={virtual.children()} visibleItems={virtual.children()} />
    </div>
  );
}

function OriginalList(props: {
  items: Item[];
  rowHeight: number;
  addItemAfter: (index: number) => void;
  removeItem: (id: ItemId) => void;
  updateItem: (index: number, data: Record<string, string>) => void;
  updateItemId: (index: number, id: ItemId) => void;
}) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createRegularList({
    items: props.items,
    elementRef: scroller,
    rowHeight: () => props.rowHeight
  });

  return (
    <div class="flex flex-1">
      <ul ref={setScroller} class="relative flex h-full flex-1 flex-col gap-40 overflow-y-auto p-1 outline-none">
        <For each={virtual.children()}>
          {(child, index) => (
            <Item
              ref={child.setElementRef}
              onAdd={() => props.addItemAfter(index())}
              onRemove={() => props.removeItem(child.item.id)}
              onValueChange={(data) => props.updateItem(child.item.index, data)}
              onItemIdChange={(id) => props.updateItemId(child.item.index, id)}
              title={child.item.id}
              index={child.item.index}
              data={child.item.data}
            >
              <pre>{child.top}</pre>
            </Item>
          )}
        </For>
      </ul>
      <VirtualScrollPreview {...virtual} children={virtual.children()} />
    </div>
  );
}
