import { ComponentProps } from 'solid-js';
import { getRandomObject } from './getRandomObject';
import { Item } from './Item';
import { OriginalList } from './OriginalList';
import { VirtualScrollNestedList } from './VirtualScrollNestedList';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'test-item': ComponentProps<'div'>;
      'virtual-scroll-nested-example': ComponentProps<'div'>;
    }
  }
}

export type NestedItem = {
  id: number;
  data: Record<string, string>;
  children: NestedItem[];
};

export default function VirtualScrollNestedExample() {
  const nestedItems: NestedItem[] = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    data: getRandomObject(),
    children: Array.from({ length: 20 }, (_, j) => ({
      id: 30 + i * 20 + j,
      data: getRandomObject(),
      children: []
    }))
  }));

  console.log('nestedItems', nestedItems);

  return (
    <virtual-scroll-nested-example class="flex h-full max-h-screen gap-4 overflow-hidden">
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="bg-gray-200 p-2 text-xs font-medium">Nested virtualized</div>
        <VirtualScrollNestedList
          class="min-h-0 flex-1 bg-gray-50"
          ariaLabel="Nested virtual list"
          items={nestedItems}
          getKey={(item) => item.id}
          getChildren={(item) => item.children}
          estimateOwnHeight={(item) => (Object.keys(item.data).length + 3) * 20 + 125}
          overscan={800}
          preview
        >
          {({ item, depth, children }) => (
            <Item
              title={`${depth === 0 ? 'Item' : 'Child'} ${item.id}`}
              index={item.id}
              data={item.data}
              class={depth > 0 ? 'group-child' : 'relative'}
              data-item-index={item.id}
              style={{ 'overflow-anchor': 'none' }}
            >
              {children}
            </Item>
          )}
        </VirtualScrollNestedList>
      </div>

      <OriginalList items={nestedItems} rowHeight={60} />
    </virtual-scroll-nested-example>
  );
}
