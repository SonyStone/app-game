import { createVirtualList } from '@packages/ui-components/virtual-scroll/create-virtual-list';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { NestedItem } from '.';
import { getColorByIndex } from '../virtual-scroll/get-bg-color';

/**
 * Seems like outline on hover will not well the flatten list
 */
export function FlattenedList(props: { items: NestedItem[]; rowHeight: number }) {
  const [scrollerElementRef, setScrollerElement] = createSignal<HTMLDivElement | undefined>();

  const flettenedItems = createMemo(() => {
    const result: { id: number; child: 'first' | 'last' | 'other' | undefined }[] = [];
    for (const item of props.items) {
      result.push({ id: item.id, child: undefined });
      for (const [index, child] of item.children.entries()) {
        result.push({
          id: child.id,
          child: index === 0 ? 'first' : index === item.children.length - 1 ? 'last' : 'other'
        });
      }
    }
    return result;
  });

  const virtual = createVirtualList({
    items: flettenedItems,
    rowHeight: props.rowHeight,
    elementRef: scrollerElementRef
  });

  return (
    <div class="flex flex-1 flex-col">
      <div class="bg-gray-200 p-2 text-xs font-medium">Flattened List (for comparison)</div>
      <div class="flex-1 overflow-auto bg-gray-50 p-2" ref={setScrollerElement}>
        <ul
          class="flex flex-col"
          style={{
            'padding-top': `${virtual.paddingTop()}px`,
            'padding-bottom': `${virtual.paddingBottom()}px`
          }}
        >
          <For each={virtual.visibleItems()}>
            {(item, index) => (
              <>
                <Show when={!item.child}>
                  <li
                    class={[
                      'rounded-t-2 hover:(bg-blue-50 outline-size-2) overflow-hidden border-x border-t',
                      getColorByIndex(index() ?? 0)
                    ].join(' ')}
                  >
                    <div class="border-b bg-white/50 p-1 text-sm">Header {item.id}</div>
                    <div class="flex flex-col gap-2 p-2">
                      <div>
                        Item {item.id} <input />
                      </div>
                    </div>
                  </li>
                </Show>
                <Show when={item.child}>
                  <div
                    class={[
                      'first:rounded-t-2 last:rounded-b-2 hover:(bg-blue-50 outline-size-2) border-x px-2 py-1',
                      // item.child === 'first' ? 'rounded-t-2 border-t' : '',
                      item.child === 'last' ? 'rounded-b-2 border-b' : ''
                    ].join(' ')}
                  >
                    <li
                      class={[
                        'rounded-2 hover:(bg-blue-50 outline-size-2) overflow-hidden border',
                        getColorByIndex(index() ?? 0)
                      ].join(' ')}
                    >
                      <div class="border-b bg-white/50 p-1 text-sm">Header {item.id}</div>
                      <div class="flex flex-col gap-2 p-2">
                        <div>
                          Item {item.id} <input />
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
