import { createVirtualList } from '@packages/ui-components/virtual-scroll/create-virtual-list';
import { createElementSize } from '@solid-primitives/resize-observer';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createVirtualList as createVirtualList2 } from '@solid-primitives/virtual';
import { createMemo, createSignal, For } from 'solid-js';

const COLORS = [
  'bg-red-100',
  'bg-blue-100',
  'bg-green-100',
  'bg-yellow-100',
  'bg-purple-100',
  'bg-pink-100',
  'bg-orange-100',
  'bg-teal-100',
  'bg-gray-100',
  'bg-indigo-100',
  'bg-lime-100',
  'bg-amber-100',
  'bg-cyan-100',
  'bg-emerald-100'
];

const getColorByIndex = (index: number) => {
  return COLORS[index % COLORS.length];
};

export default function VirtualScrollExample() {
  const items = Array.from({ length: 1000 }, (_, i) => i);

  return (
    <div class="flex h-full gap-10 overflow-hidden">
      <VirtualListExample items={items} rowHeight={128} />
      <VirtualList2Example items={items} rowHeight={128} />
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
    <div class="bg-warmGray z-1 fixed start-20 p-2">
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

function VirtualListExample(props: { items: number[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();

  const virtual = createVirtualList({
    items: props.items,
    rowHeight: props.rowHeight,
    buffer: 2,
    elementRef: scroller
  });

  return (
    <>
      <DebugView {...virtual} />
      <div
        class="flex-1"
        ref={setScroller}
        data-testid="virtuoso-scroller"
        data-virtuoso-scroller="true"
        tabindex="0"
        style="height: 100%; outline: none; overflow-y: auto; position: relative;"
      >
        <div
          data-testid="virtuoso-item-list"
          style={{
            'box-sizing': 'border-box',
            'margin-top': '0px',
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
    </>
  );
}

function VirtualList2Example(props: { items: number[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const size = createElementSize(scroller);
  const rootHeight = createMemo(() => size.height ?? 0);
  const [virtual, onScroll] = createVirtualList2({
    items: props.items,
    rootHeight: rootHeight,
    rowHeight: props.rowHeight,
    overscanCount: 2
  });

  return (
    <div ref={setScroller} class="flex-1 overflow-auto">
      <div
        style={{
          overflow: 'auto',
          height: `${rootHeight()}px`
        }}
        onScroll={onScroll}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: `${virtual().containerHeight}px`
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: `${virtual().viewerTop}px`
            }}
          >
            <For each={virtual().visibleItems}>
              {(item, index) => (
                <div
                  class={getColorByIndex(item)}
                  data-index={item}
                  data-item-index={item}
                  data-known-size={props.rowHeight}
                  style={{
                    height: `${props.rowHeight}px`,
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
    </div>
  );
}
