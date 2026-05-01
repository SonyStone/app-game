// Virtualizing

import { createElementSize } from '@solid-primitives/resize-observer';
import { createScrollPosition } from '@solid-primitives/scroll';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createMemo } from 'solid-js';

export type VirtualListItem<T = unknown> = {
  id: string | number;
  data: T;
  level: number;
  isParent: boolean;
  isExpanded?: boolean;
  parentId?: string | number;
  type: 'parent' | 'child';
  children?: T[];
};

export function flattenNestedItems<T>(
  items: T[],
  options: {
    getId: (item: T) => string | number;
    getChildren: (item: T) => T[] | undefined;
    isExpanded?: (item: T) => boolean;
    level?: number;
    parentId?: string | number;
  }
): VirtualListItem<T>[] {
  const { getId, getChildren, isExpanded = () => true, level = 0, parentId } = options;
  const result: VirtualListItem<T>[] = [];

  for (const item of items) {
    const id = getId(item);
    const children = getChildren(item);
    const hasChildren = children && children.length > 0;
    const expanded = isExpanded(item);

    const virtualItem: VirtualListItem<T> = {
      id,
      data: item,
      level,
      isParent: !!hasChildren,
      isExpanded: expanded,
      parentId,
      type: 'parent',
      children: hasChildren && expanded ? children : undefined
    };

    result.push(virtualItem);

    // Don't add children as separate items - they'll be rendered within the parent
    // This creates truly nested rendering instead of just flat indentation
  }

  return result;
}

// I have no clue what createNestedVirtualList is doing
// I think it doing nothing
export function createNestedVirtualList<T>(props: {
  /** The nested items to display */
  items: MaybeAccessor<T[]>;
  /** Function to get item ID */
  getId: (item: T) => string | number;
  /** Function to get children */
  getChildren: (item: T) => T[] | undefined;
  /** Function to check if item is expanded */
  isExpanded?: (item: T) => boolean;
  /** The height of each row */
  rowHeight: MaybeAccessor<number>;
  /** Optional buffer for pre-rendering */
  buffer?: MaybeAccessor<number>;
  /** Reference to the container element */
  elementRef: MaybeAccessor<Element | undefined>;
}) {
  const flattenedItems = createMemo(() => {
    const items = access(props.items);
    return flattenNestedItems(items, {
      getId: props.getId,
      getChildren: props.getChildren,
      isExpanded: props.isExpanded
    });
  });

  // Calculate dynamic heights for each item
  const itemHeights = createMemo(() => {
    const baseHeight = access(props.rowHeight);
    const childHeight = 40; // Height of each child item

    return flattenedItems().map((item) => {
      if (item.isExpanded && item.children && item.children.length > 0) {
        return baseHeight + item.children.length * childHeight;
      }
      return baseHeight;
    });
  });

  const totalHeight = createMemo(() => {
    return itemHeights().reduce((sum, height) => sum + height, 0);
  });

  // Custom virtual list logic for variable heights
  const size = createElementSize(() => access(props.elementRef));
  const scrollPosition = (() => {
    const scrollPosition = createScrollPosition(props.elementRef);
    return createMemo(() => scrollPosition.y);
  })();

  const viewportHeight = createMemo(() => size.height ?? 0);
  const buffer = createMemo(() => access(props.buffer ?? 2));

  // Calculate visible items with variable heights
  const visibleData = createMemo(() => {
    const items = flattenedItems();
    const heights = itemHeights();
    const scrollY = scrollPosition();
    const viewport = viewportHeight();
    const bufferCount = buffer();

    let currentY = 0;
    let startIndex = 0;
    let endIndex = 0;

    // Find start index
    for (let i = 0; i < items.length; i++) {
      if (currentY + heights[i] > scrollY) {
        startIndex = Math.max(0, i - bufferCount);
        break;
      }
      currentY += heights[i];
    }

    // Find end index
    currentY = 0;
    for (let i = 0; i < startIndex; i++) {
      currentY += heights[i];
    }

    for (let i = startIndex; i < items.length; i++) {
      if (currentY > scrollY + viewport) {
        endIndex = Math.min(items.length, i + bufferCount);
        break;
      }
      currentY += heights[i];
    }

    if (endIndex === 0) endIndex = items.length;

    // Calculate padding
    const paddingTop = heights.slice(0, startIndex).reduce((sum, h) => sum + h, 0);
    const paddingBottom = heights.slice(endIndex).reduce((sum, h) => sum + h, 0);

    return {
      visibleItems: items.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop,
      paddingBottom
    };
  });

  return {
    visibleItems: () => visibleData().visibleItems,
    paddingTop: () => visibleData().paddingTop,
    paddingBottom: () => visibleData().paddingBottom,
    totalHeight,
    startIndex: () => visibleData().startIndex,
    endIndex: () => visibleData().endIndex,
    visibleCount: () => visibleData().endIndex - visibleData().startIndex,
    viewportHeight,
    buffer,
    scrollPosition,
    rowHeight: () => access(props.rowHeight),
    flattenedItems,
    itemHeights
  };
}
