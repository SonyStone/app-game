import { describe, expect, it } from 'vitest';
import {
  createNestedVirtualTree,
  findNestedVisibleRange,
  layoutNestedVirtualTree,
  type NestedVirtualMeasurement
} from './VirtualScrollNestedList';

type TestItem = {
  id: string;
  height: number;
  children: TestItem[];
};

const items = [
  {
    id: 'parent',
    height: 10,
    children: [
      { id: 'first-child', height: 20, children: [] },
      { id: 'second-child', height: 30, children: [] }
    ]
  },
  { id: 'sibling', height: 40, children: [] }
] satisfies TestItem[];

const getKey = (item: TestItem) => item.id;
const getChildren = (item: TestItem) => item.children;
const estimateHeight = (item: TestItem) => item.height;

describe('nested virtual tree layout', () => {
  it('keeps the hierarchy and lays descendants out inside their parent subtree', () => {
    const tree = createNestedVirtualTree(items, getKey, getChildren);
    const totalHeight = layoutNestedVirtualTree(tree, new Map(), estimateHeight);

    expect(tree).toHaveLength(2);
    expect(tree[0]?.children.map((node) => node.key)).toEqual(['first-child', 'second-child']);
    expect(tree[0]?.top).toBe(0);
    expect(tree[0]?.childrenTop).toBe(10);
    expect(tree[0]?.children[0]?.top).toBe(10);
    expect(tree[0]?.children[1]?.top).toBe(30);
    expect(tree[0]?.bottom).toBe(60);
    expect(tree[1]?.top).toBe(60);
    expect(totalHeight).toBe(100);
  });

  it('separates content before and after the nested children region', () => {
    const tree = createNestedVirtualTree(items, getKey, getChildren);
    const measurements = new Map<string, NestedVirtualMeasurement>([
      ['parent', { beforeChildren: 15, afterChildren: 5 }]
    ]);

    const totalHeight = layoutNestedVirtualTree(tree, measurements, estimateHeight);

    expect(tree[0]?.childrenTop).toBe(15);
    expect(tree[0]?.childrenBottom).toBe(65);
    expect(tree[0]?.bottom).toBe(70);
    expect(tree[1]?.top).toBe(70);
    expect(totalHeight).toBe(110);
  });

  it('selects intersecting sibling subtrees without flattening them', () => {
    const tree = createNestedVirtualTree(items, getKey, getChildren);
    layoutNestedVirtualTree(tree, new Map(), estimateHeight);

    expect(findNestedVisibleRange(tree, 12, 25)).toEqual({ start: 0, end: 1 });
    expect(findNestedVisibleRange(tree[0]?.children ?? [], 12, 25)).toEqual({ start: 0, end: 1 });
    expect(findNestedVisibleRange(tree[0]?.children ?? [], 30, 31)).toEqual({ start: 1, end: 2 });
    expect(findNestedVisibleRange(tree, 60, 80)).toEqual({ start: 1, end: 2 });
  });

  it('omits collapsed descendants from the hierarchical model', () => {
    const tree = createNestedVirtualTree(items, getKey, getChildren, (item) => item.id !== 'parent');

    expect(tree[0]?.children).toEqual([]);
  });

  it('rejects duplicate keys anywhere in the hierarchy', () => {
    const duplicateItems = [
      {
        id: 'duplicate',
        height: 10,
        children: [{ id: 'duplicate', height: 20, children: [] }]
      }
    ] satisfies TestItem[];

    expect(() => createNestedVirtualTree(duplicateItems, getKey, getChildren)).toThrow(
      'VirtualScrollNestedList requires unique keys. Duplicate key: duplicate'
    );
  });
});
