import { createElementSize } from '@solid-primitives/resize-observer';
import { createVirtualList } from '@solid-primitives/virtual';
import { createMemo, createSignal, For } from 'solid-js';
import { getColorByIndex } from './get-bg-color';

export function PrimitivesVirtualListExample(props: { items: number[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const size = createElementSize(scroller);
  const rootHeight = createMemo(() => size.height ?? 0);
  const [virtual, onScroll] = createVirtualList({
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
