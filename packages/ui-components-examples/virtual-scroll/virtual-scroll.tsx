import { createVirtualList } from '@packages/ui-components/virtual-scroll/create-virtual-list';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createSignal, For } from 'solid-js';
import { getColorByIndex } from './get-bg-color';

export default function VirtualScrollExample() {
  const items = Array.from({ length: 1000 }, (_, i) => i);

  return (
    <div class="flex h-full gap-10 overflow-hidden">
      <VirtualListExample items={items} rowHeight={128} />
      <VirtualListExample2 items={items} rowHeight={128} />
      <div class="flex-1 overflow-auto">
        <div>
          <For each={items}>
            {(item, index) => (
              <div
                class={getColorByIndex(item)}
                data-index={item}
                data-item-index={item}
                data-known-size={128}
                style={{
                  height: `128px`,
                  'overflow-anchor': 'none'
                }}
              >
                <div>Item {item}</div>
                <div>Index {index()}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function DebugView(props: {
  totalHeight: MaybeAccessor<number>;
  viewportHeight: MaybeAccessor<number>;
  scrollPosition: MaybeAccessor<number>;
  visibleCount: MaybeAccessor<number>;
  buffer: MaybeAccessor<number>;
  startIndex: MaybeAccessor<number>;
  endIndex: MaybeAccessor<number>;
  paddingTop: MaybeAccessor<number>;
  paddingBottom: MaybeAccessor<number>;
}) {
  return (
    <div class="bg-warmGray z-1 absolute start-20 p-2">
      <code>
        <pre>Total Height: {access(props.totalHeight)}</pre>
        <pre>Viewport Height: {access(props.viewportHeight)}</pre>
        <pre>Scroll Position: {access(props.scrollPosition)}</pre>
        <pre>Visible Count: {access(props.visibleCount)}</pre>
        <pre>Buffer: {access(props.buffer)}</pre>
        <pre>
          Indexes: {access(props.startIndex)} {access(props.endIndex)}
        </pre>
        <pre>Items in viewport: {access(props.endIndex) - access(props.startIndex)}</pre>
        <pre>Padding Top: {access(props.paddingTop)}</pre>
        <pre>Padding Bottom: {access(props.paddingBottom)}</pre>
      </code>
    </div>
  );
}

// Using `padding-top` and `padding-bottom`
function VirtualListExample(props: { items: number[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createVirtualList({
    items: props.items,
    rowHeight: props.rowHeight,
    buffer: 2,
    elementRef: scroller
  });

  return (
    <div class="relative flex-1">
      <DebugView {...virtual} />
      <div
        class="relative h-full flex-1 overflow-y-auto outline-none"
        ref={setScroller}
        data-testid="virtuoso-scroller"
        data-virtuoso-scroller="true"
      >
        <div
          data-testid="virtuoso-item-list"
          class="mt-0 box-border"
          style={{
            'padding-top': `${virtual.paddingTop()}px`,
            'padding-bottom': `${virtual.paddingBottom()}px`
          }}
        >
          <For each={virtual.visibleItems()}>
            {(item, index) => (
              <div
                class={getColorByIndex(item)}
                data-index={item}
                data-item-index={item}
                data-known-size={virtual.rowHeight()}
                style={{
                  height: `${virtual.rowHeight()}px`,
                  'overflow-anchor': 'none'
                }}
              >
                <div>Item {item}</div>
                <div>Index {index()}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

// Using `transform: translateY`
function VirtualListExample2(props: { items: number[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createVirtualList({
    items: props.items,
    rowHeight: props.rowHeight,
    buffer: 2,
    elementRef: scroller
  });

  return (
    <div class="relative flex-1">
      <DebugView {...virtual} />
      <div
        class="relative h-full flex-1 flex-1 overflow-y-auto outline-none"
        ref={setScroller}
        data-testid="virtuoso-scroller"
      >
        <div
          data-testid="virtuoso-item-list"
          class="contain-content absolute left-0 top-0 w-full"
          style={{
            transform: `translateY(${virtual.paddingTop()}px)`
          }}
        >
          <For each={virtual.visibleItems()}>
            {(item, index) => (
              <div
                class={getColorByIndex(item)}
                data-index={item}
                data-item-index={item}
                data-known-size={virtual.rowHeight()}
                style={{
                  height: `${virtual.rowHeight()}px`,
                  'overflow-anchor': 'none'
                }}
              >
                <div>Item {item}</div>
                <div>Index {index()}</div>
              </div>
            )}
          </For>
        </div>
        <div data-testid="cdk-virtual-scroll-spacer" style={{ height: `${virtual.totalHeight()}px` }}></div>
      </div>
    </div>
  );
}
