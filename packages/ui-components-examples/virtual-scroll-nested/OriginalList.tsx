import { For } from 'solid-js';
import { NestedItem } from '.';
import { Item } from './Item';

export function OriginalList(props: { items: NestedItem[]; rowHeight: number }) {
  return (
    <div class="flex flex-1 flex-col">
      <div class="bg-gray-200 p-2 text-xs font-medium">Non-virtualized (for comparison)</div>
      <div class="flex-1 overflow-auto bg-gray-50">
        <ul class="flex flex-col gap-2 p-2">
          <For each={props.items}>
            {(item, index) => (
              <Item index={index()} title={`Item ${item.id}`}>
                <For each={item.children}>
                  {(child, childIndex) => (
                    <Item
                      ref={(ref) => {
                        if (item.id === 0 && child.id === 0) {
                          console.log(`Render wtf item-${item.id}-${child.id}`, ref);
                        }
                      }}
                      index={childIndex()}
                      title={`Item ${child.id}`}
                      data={child.data}
                    />
                  )}
                </For>
              </Item>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
}
