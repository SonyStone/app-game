import { createVirtualList } from '@app-game/solid-virtual/createVirtualList';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { getColorByIndex } from '../shared/get-bg-color';
import type { NestedItem } from '../virtual-scroll-nested';

/**
 * Preserves the earlier flattened rendering experiment for comparison.
 * It is not used by the current recursive example.
 */
export function FlattenedList(props: { items: NestedItem[]; rowHeight: number }) {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const flattenedItems = createMemo(() => {
    const result: { id: number; child: 'first' | 'last' | 'other' | undefined }[] = [];

    for (const item of props.items) {
      result.push({ id: item.index, child: undefined });
      for (const [index, child] of item.children.entries()) {
        result.push({
          id: child.index,
          child: index === 0 ? 'first' : index === item.children.length - 1 ? 'last' : 'other'
        });
      }
    }

    return result;
  });
  const virtual = createVirtualList({
    items: flattenedItems,
    rowHeight: props.rowHeight,
    elementRef: scroller
  });

  return (
    <div class="flex flex-1 flex-col">
      <div class="bg-gray-200 p-2 text-xs font-medium">Flattened List (for comparison)</div>
      <div class="flex-1 overflow-auto bg-gray-50 p-2" ref={setScroller}>
        <ul
          class="flex flex-col"
          style={{
            'padding-top': `${virtual.paddingTop}px`,
            'padding-bottom': `${virtual.paddingBottom}px`
          }}
        >
          <For each={virtual.children()}>
            {(node) => (
              <>
                <Show when={!node.item.child}>
                  <li
                    class={[
                      'rounded-t-2 hover:(bg-blue-50 outline-size-2) overflow-hidden border-x border-t',
                      getColorByIndex(node.index)
                    ].join(' ')}
                  >
                    <div class="border-b bg-white/50 p-1 text-sm">Header {node.item.id}</div>
                    <div class="flex flex-col gap-2 p-2">
                      <div>
                        Item {node.item.id} <input />
                      </div>
                    </div>
                  </li>
                </Show>
                <Show when={node.item.child}>
                  <div
                    class={[
                      'first:rounded-t-2 last:rounded-b-2 hover:(bg-blue-50 outline-size-2) border-x px-2 py-1',
                      node.item.child === 'last' ? 'rounded-b-2 border-b' : ''
                    ].join(' ')}
                  >
                    <li
                      class={[
                        'rounded-2 hover:(bg-blue-50 outline-size-2) overflow-hidden border',
                        getColorByIndex(node.index)
                      ].join(' ')}
                    >
                      <div class="border-b bg-white/50 p-1 text-sm">Header {node.item.id}</div>
                      <div class="flex flex-col gap-2 p-2">
                        <div>
                          Item {node.item.id} <input />
                        </div>
                      </div>
                    </li>
                  </div>
                </Show>
              </>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
}
