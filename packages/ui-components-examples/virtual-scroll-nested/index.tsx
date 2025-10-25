import { ComponentProps } from 'solid-js';
import { OriginalList } from './OriginalList';
import { VirtualScrollNestedList } from './VirtualScrollNestedList';
import { getRandomObject } from './getRandomObject';

declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
} & {
  children: NestedItem[];
};

// Should Virtualize Nested Items too
export default function VirtualScrollNestedExample() {
  const nestedItems: NestedItem[] = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    data: getRandomObject(),
    children: Array.from({ length: 20 }, (_, j) => ({
      id: i * 10 + j, // Unique ID for children
      data: getRandomObject(),
      children: []
    }))
  }));

  return (
    <virtual-scroll-nested-example class="flex h-full gap-4 overflow-hidden">
      <VirtualScrollNestedList items={nestedItems} />

      {/* Original non-virtualized version for comparison */}
      <OriginalList items={nestedItems} rowHeight={60} />
      {/* <FlattenedList items={nestedItems} rowHeight={60} /> */}
    </virtual-scroll-nested-example>
  );
}
