import {
  createNestedVirtualList,
  VirtualListItem
} from '@packages/ui-components/virtual-scroll/create-nested-virtual-list';
import { createSignal, For } from 'solid-js';
import { getColor2ByIndex, getColorByIndex } from '../virtual-scroll/get-bg-color';

type NestedItem = {
  id: number;
  children: NestedItem[];
};

// Should Virtualize Nested Items too

export default function VirtualScrollNestedExample() {
  const [scroller, setScroller] = createSignal<HTMLDivElement | undefined>();
  const [expandedItems, setExpandedItems] = createSignal<Set<number>>(new Set([0, 1, 2, 3, 4])); // Some items expanded by default

  const nestedItems: NestedItem[] = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    children: Array.from({ length: 100 }, (_, j) => ({
      id: i * 1000 + j, // Unique ID for children
      children: []
    }))
  }));

  const toggleExpanded = (id: number) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const virtual = createNestedVirtualList({
    items: nestedItems,
    getId: (item) => item.id,
    getChildren: (item) => (item.children.length > 0 ? item.children : undefined),
    isExpanded: (item) => expandedItems().has(item.id),
    rowHeight: 60, // We'll handle dynamic height in the render
    buffer: 2,
    elementRef: scroller
  });

  return (
    <div class="flex h-full gap-10 overflow-hidden">
      <div class="relative flex-1">
        {/* Debug Info */}
        <div class="absolute right-0 top-0 z-10 rounded border bg-white p-2 text-xs shadow">
          <div>Total Items: {virtual.flattenedItems().length}</div>
          <div>
            Visible: {virtual.startIndex()} - {virtual.endIndex()}
          </div>
          <div>Expanded: {expandedItems().size}</div>
        </div>

        <div class="h-full overflow-auto " ref={setScroller} style="outline: none;" tabindex="0">
          <div
            class="mt-0 box-border"
            style={{
              'padding-top': `${virtual.paddingTop()}px`,
              'padding-bottom': `${virtual.paddingBottom()}px`
            }}
          >
            <For each={virtual.visibleItems()}>
              {(virtualItem: VirtualListItem<NestedItem>) => (
                <div
                  class={`${getColorByIndex(virtualItem.id as number)} border-b border-gray-200`}
                  data-index={virtualItem.id}
                  data-item-index={virtualItem.id}
                  style={{
                    'overflow-anchor': 'none'
                  }}
                >
                  <ParentItem virtualItem={virtualItem} height={virtual.rowHeight()} toggleExpanded={toggleExpanded} />

                  {/* Children - rendered inside parent when expanded */}
                  {virtualItem.isExpanded && virtualItem.children && (
                    <div class="ml-8 border-l-2 border-gray-300">
                      <For each={virtualItem.children}>
                        {(child, childIndex) => <ChildItem child={child} childIndex={childIndex()} />}
                      </For>
                    </div>
                  )}
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Original non-virtualized version for comparison */}
      <div class="flex-1 overflow-auto bg-gray-50">
        <div class="bg-gray-200 p-2 text-xs font-medium">Non-virtualized (for comparison)</div>
        <div>
          <For each={nestedItems.slice(0, 10)}>
            {(item, index) => (
              <div class={[getColorByIndex(item.id), '[overflow-anchor:none]'].join(' ')} data-index={item}>
                <div>Item {item.id}</div>
                <div>Index {index()}</div>
                <div class="flex flex-col gap-2 p-2">
                  <For each={item.children.slice(0, 5)}>
                    {(child, childIndex) => (
                      <div class={[getColor2ByIndex(child.id), 'p-2 [overflow-anchor:none]'].join(' ')}>
                        Child {child.id} of Item {item.id} at index {childIndex()}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function ParentItem(props: {
  virtualItem: VirtualListItem<NestedItem>;
  height: number;
  toggleExpanded: (id: number) => void;
}) {
  return (
    <div
      class="flex items-center"
      style={{
        height: `${props.height}px`,
        'padding-left': `${props.virtualItem.level * 20}px`
      }}
    >
      {props.virtualItem.isParent && (
        <button
          class="mr-2 flex h-6 w-6 items-center justify-center rounded bg-gray-300 text-sm hover:bg-gray-400"
          onClick={() => props.toggleExpanded(props.virtualItem.id as number)}
        >
          {props.virtualItem.isExpanded ? '−' : '+'}
        </button>
      )}

      <div class="flex-1">
        <div class="font-medium">Item {props.virtualItem.data.id}</div>
        <div class="text-xs text-gray-500">
          Parent • {props.virtualItem.data.children.length} children
          {props.virtualItem.isExpanded && ' • Expanded'}
        </div>
      </div>
    </div>
  );
}

function ChildItem(props: { child: NestedItem; childIndex: number }) {
  return (
    <div class={`${getColor2ByIndex(props.child.id)} flex h-10 items-center border-b border-gray-100 pl-5`}>
      <div class="flex-1">
        <div class="text-sm font-medium">Child {props.child.id}</div>
        <div class="text-xs text-gray-500">
          Child of Item {Math.floor(props.child.id / 1000)} • Index {props.childIndex}
        </div>
      </div>
    </div>
  );
}
