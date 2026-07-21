import { createRoot, createSignal } from 'solid-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createVirtualNestedList } from './createVirtualNestedList';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});

afterAll(() => vi.unstubAllGlobals());

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

describe('createVirtualNestedList', () => {
  it('returns recursive visible children with complete layout data', () => {
    withVirtualList(items, { overscan: 1_000 }, (virtual) => {
      const roots = virtual.children();
      const parent = roots[0];
      const sibling = roots[1];
      if (!parent || !sibling) throw new Error('Expected parent and sibling nodes');

      expect(roots).toHaveLength(2);
      expect(parent.children().map((node) => node.item.id)).toEqual(['first-child', 'second-child']);
      expect(parent.top).toBe(0);
      expect(parent.ownHeight).toBe(10);
      expect(parent.height).toBe(60);
      expect(parent.children()[0]?.top).toBe(10);
      expect(parent.children()[1]?.top).toBe(30);
      expect(sibling.top).toBe(60);
      expect(virtual.totalHeight).toBe(100);
    });
  });

  it('returns virtual padding at every visible sibling level', () => {
    withVirtualList(items, { overscan: 25 }, (virtual) => {
      const parent = virtual.children()[0];
      if (!parent) throw new Error('Expected a visible parent node');

      expect(virtual.children().map((node) => node.item.id)).toEqual(['parent']);
      expect(virtual.paddingTop).toBe(0);
      expect(virtual.paddingBottom).toBe(40);
      expect(parent.children().map((node) => node.item.id)).toEqual(['first-child']);
      expect(parent.paddingTop).toBe(0);
      expect(parent.paddingBottom).toBe(30);
    });
  });

  it('uses the same primitive for flat input', () => {
    const flatItems = items.map((item) => ({ ...item, children: [] }));

    withVirtualList(flatItems, { overscan: 1_000 }, (virtual) => {
      expect(virtual.children().map((node) => node.item.id)).toEqual(['parent', 'sibling']);
      expect(virtual.children().every((node) => node.childCount === 0)).toBe(true);
      expect(virtual.totalHeight).toBe(50);
    });
  });

  it('omits collapsed descendants', () => {
    withVirtualList(items, { isExpanded: (item) => item.id !== 'parent', overscan: 1_000 }, (virtual) => {
      const parent = virtual.children()[0];

      expect(parent?.childCount).toBe(2);
      expect(parent?.children()).toEqual([]);
      expect(virtual.totalHeight).toBe(50);
    });
  });

  it('preserves layout nodes while descendants collapse and expand', () => {
    const [expanded, setExpanded] = createSignal(true);

    withVirtualList(items, { isExpanded: () => expanded(), overscan: 1_000 }, (virtual) => {
      const parent = virtual.children()[0];
      const firstChild = parent?.children()[0];
      if (!parent || !firstChild) throw new Error('Expected expanded parent and child nodes');

      setExpanded(false);
      expect(virtual.children()[0]).toBe(parent);
      expect(parent.children()).toEqual([]);
      expect(parent.height).toBe(10);

      setExpanded(true);
      expect(virtual.children()[0]).toBe(parent);
      expect(parent.children()[0]).toBe(firstChild);
      expect(parent.height).toBe(60);
    });
  });

  it('uses internal node identity when application values repeat', () => {
    const repeatedItems = [
      {
        id: 'duplicate',
        height: 10,
        children: [{ id: 'duplicate', height: 20, children: [] }]
      }
    ] satisfies TestItem[];

    withVirtualList(repeatedItems, { overscan: 1_000 }, (virtual) => {
      const root = virtual.children()[0];
      const child = root?.children()[0];

      expect(root?.item.id).toBe('duplicate');
      expect(child?.item.id).toBe('duplicate');
      expect(root).not.toBe(child);
      expect(virtual.totalHeight).toBe(30);
    });
  });
});

function withVirtualList(
  testItems: readonly TestItem[],
  options: Partial<Pick<Parameters<typeof createVirtualNestedList<TestItem>>[0], 'gap' | 'isExpanded' | 'overscan'>>,
  run: (virtual: ReturnType<typeof createVirtualNestedList<TestItem>>) => void
): void {
  createRoot((dispose) => {
    try {
      run(
        createVirtualNestedList({
          items: testItems,
          getChildren: (item) => item.children,
          elementRef: undefined,
          estimateOwnHeight: (item) => item.height,
          gap: 0,
          ...options
        })
      );
    } finally {
      dispose();
    }
  });
}
