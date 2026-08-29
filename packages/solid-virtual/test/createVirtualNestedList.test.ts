import { createRoot, createSignal, flush } from 'solid-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDynamicHeight,
  createVirtualNestedList,
  type VirtualNestedList,
  type VirtualNestedListProps
} from '../src';

const observeElement = vi.fn();

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(element: Element): void {
        observeElement(element);
      }
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});

beforeEach(() => observeElement.mockClear());

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

  it('supports root collections without descendants', () => {
    const flatItems = items.map((item) => ({ ...item, children: [] }));

    withVirtualList(flatItems, { overscan: 1_000 }, (virtual) => {
      expect(virtual.children().map((node) => node.item.id)).toEqual(['parent', 'sibling']);
      expect(virtual.children().every((node) => node.childCount === 0)).toBe(true);
      expect(virtual.totalHeight).toBe(50);
    });
  });

  it('places gaps only between sibling branches at every level', () => {
    withVirtualList(items, { gap: 10, overscan: 1_000 }, (virtual) => {
      const parent = virtual.children()[0];
      const sibling = virtual.children()[1];
      if (!parent || !sibling) throw new Error('Expected parent and sibling nodes');

      expect(parent.children()[0]?.top).toBe(10);
      expect(parent.children()[1]?.top).toBe(40);
      expect(parent.height).toBe(70);
      expect(sibling.top).toBe(80);
      expect(sibling.height).toBe(40);
      expect(virtual.totalHeight).toBe(120);
    });
  });

  it('does not observe item elements in the default fixed-height mode', () => {
    withVirtualList(items, { overscan: 1_000 }, (virtual) => {
      const parent = virtual.children()[0];
      if (!parent) throw new Error('Expected a parent node');

      parent.setElementRef(document.createElement('article'));
      parent.setChildrenRef(document.createElement('div'));

      expect(observeElement).not.toHaveBeenCalled();
    });
  });

  it('activates item observation through the dynamic-height strategy', () => {
    createRoot((dispose) => {
      try {
        const virtual = createVirtualNestedList({
          items,
          elementRef: undefined,
          itemHeight: createDynamicHeight<TestItem>({
            estimate: (item) => item.height
          }),
          getChildren: (item) => item.children,
          gap: 0,
          overscan: 1_000
        });
        const parent = virtual.children()[0];
        if (!parent) throw new Error('Expected a parent node');
        const element = document.createElement('article');

        expect(virtual.totalHeight).toBe(100);
        parent.setElementRef(element);

        expect(observeElement).toHaveBeenCalledOnce();
        expect(observeElement).toHaveBeenCalledWith(element);
      } finally {
        dispose();
      }
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
      flush();
      expect(virtual.children()[0]).toBe(parent);
      expect(parent.children()).toEqual([]);
      expect(parent.height).toBe(10);

      setExpanded(true);
      flush();
      expect(virtual.children()[0]).toBe(parent);
      expect(parent.children()[0]).toBe(firstChild);
      expect(parent.height).toBe(60);
    });
  });

  it('preserves nested render identity when the source collection refreshes', () => {
    const [roots, setRoots] = createSignal<readonly TestItem[]>(items);
    const { dispose, virtual } = createRoot((dispose) => ({
      dispose,
      virtual: createVirtualNestedList({
        items: roots,
        elementRef: undefined,
        itemHeight: (item: TestItem) => item.height,
        getChildren: (item) => item.children,
        gap: 0,
        overscan: 1_000
      })
    }));
    const parent = virtual.children()[0];
    const sibling = virtual.children()[1];
    const firstChild = parent?.children()[0];
    if (!parent || !sibling || !firstChild) throw new Error('Expected the initial nested nodes');

    const appended = { id: 'appended', height: 50, children: [] } satisfies TestItem;
    setRoots([items[0]!, appended, items[1]!]);
    flush();

    expect(virtual.children()[0]).toBe(parent);
    expect(virtual.children()[0]?.children()[0]).toBe(firstChild);
    expect(virtual.children()[2]).toBe(sibling);
    expect(virtual.children()[1]?.item).toBe(appended);
    dispose();
  });

  it('preserves nested item identity while scrolling', async () => {
    const scroller = createScroller(25);

    await withScrollableVirtualList(items, scroller.element, { overscan: 0 }, (virtual) => {
      const parent = virtual.children()[0];
      if (!parent) throw new Error('Expected a visible parent node');

      scrollTo(scroller.element, 11);
      const initialChildren = parent.children();
      expect(initialChildren.map((node) => node.item.id)).toEqual(['first-child', 'second-child']);

      scrollTo(scroller.element, 12);
      const nextChildren = parent.children();
      expect(nextChildren[0]).toBe(initialChildren[0]);
      expect(nextChildren[1]).toBe(initialChildren[1]);
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

  it('scrolls to a nested item that is outside the rendered range', async () => {
    const scroller = createScroller(25);
    const deepItems = [
      {
        id: 'root',
        height: 10,
        children: [
          {
            id: 'child',
            height: 20,
            children: [{ id: 'grandchild', height: 30, children: [] }]
          }
        ]
      }
    ] satisfies TestItem[];
    const target = deepItems[0]?.children[0]?.children[0];
    if (!target) throw new Error('Expected grandchild target');

    await withScrollableVirtualList(deepItems, scroller.element, {}, (virtual) => {
      expect(virtual.children()[0]?.children()[0]?.children()).toEqual([]);
      expect(virtual.scrollTo(target, { align: 'start', behavior: 'smooth' })).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 30, behavior: 'smooth' });
    });
  });

  it('supports item alignment and clamps absolute offsets', async () => {
    const scroller = createScroller(25);
    const target = items[1];
    if (!target) throw new Error('Expected sibling target');

    await withScrollableVirtualList(items, scroller.element, {}, (virtual) => {
      expect(virtual.viewportHeight).toBe(25);

      expect(virtual.scrollTo(target, { align: 'center' })).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 67.5, behavior: 'auto' });

      expect(virtual.scrollTo(target, { align: 'end' })).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 75, behavior: 'auto' });

      expect(virtual.scrollTo(target, { align: 'nearest' })).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 75, behavior: 'auto' });

      expect(virtual.scrollToOffset(1_000)).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 75, behavior: 'auto' });

      expect(virtual.scrollToOffset(-100)).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });

      expect(virtual.scrollTo(target, { align: 'nearest' })).toBe(true);
      expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 60, behavior: 'auto' });
    });
  });

  it('does not scroll to hidden or missing items', async () => {
    const scroller = createScroller(25);
    const hiddenTarget = items[0]?.children[0];
    if (!hiddenTarget) throw new Error('Expected hidden child target');

    await withScrollableVirtualList(
      items,
      scroller.element,
      { isExpanded: (item) => item.id !== 'parent' },
      (virtual) => {
        expect(virtual.scrollTo(hiddenTarget)).toBe(false);
        expect(virtual.scrollTo({ id: 'missing', height: 10, children: [] })).toBe(false);
        expect(scroller.scrollTo).not.toHaveBeenCalled();
      }
    );
  });

  it('reports that scrolling is unavailable without a scroll element', () => {
    withVirtualList(items, {}, (virtual) => {
      const target = items[0];
      if (!target) throw new Error('Expected root target');

      expect(virtual.scrollTo(target)).toBe(false);
      expect(virtual.scrollToOffset(10)).toBe(false);
    });
  });
});

type TestVirtualListOptions = Partial<Pick<VirtualNestedListProps<TestItem>, 'gap' | 'overscan'>> &
  Readonly<{ isExpanded?: (item: TestItem) => boolean }>;

function withVirtualList(
  testItems: readonly TestItem[],
  options: TestVirtualListOptions,
  run: (virtual: VirtualNestedList<TestItem>) => void
): void {
  const { dispose, virtual } = createRoot((dispose) => ({
    dispose,
    virtual: createVirtualNestedList({
      items: testItems,
      elementRef: undefined,
      itemHeight: (item) => item.height,
      getChildren: (item) => item.children,
      ...(options.isExpanded === undefined ? {} : { isExpanded: options.isExpanded }),
      gap: options.gap ?? 0,
      ...(options.overscan === undefined ? {} : { overscan: options.overscan })
    })
  }));

  try {
    run(virtual);
  } finally {
    dispose();
  }
}

async function withScrollableVirtualList(
  testItems: readonly TestItem[],
  elementRef: HTMLElement,
  options: TestVirtualListOptions,
  run: (virtual: VirtualNestedList<TestItem>) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    createRoot((dispose) => {
      const virtual = createVirtualNestedList({
        items: testItems,
        elementRef,
        itemHeight: (item) => item.height,
        getChildren: (item) => item.children,
        ...(options.isExpanded === undefined ? {} : { isExpanded: options.isExpanded }),
        gap: options.gap ?? 0,
        overscan: options.overscan ?? 0
      });

      queueMicrotask(() => {
        try {
          run(virtual);
          resolve();
        } catch (error: unknown) {
          reject(error);
        } finally {
          dispose();
        }
      });
    });
  });
}

function createScroller(height: number) {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => new DOMRect(0, 0, 100, height);
  const scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
    element.scrollTop = typeof options === 'number' ? (y ?? element.scrollTop) : (options?.top ?? element.scrollTop);
  });
  element.scrollTo = scrollTo;

  return { element, scrollTo };
}

function scrollTo(element: HTMLElement, top: number): void {
  element.scrollTop = top;
  element.dispatchEvent(new Event('scroll'));
  flush();
}
