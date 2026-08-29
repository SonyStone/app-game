import { createRoot, createSignal, flush } from 'solid-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDynamicHeight } from '../src/createDynamicHeight';
import { createVirtualList } from '../src/createVirtualList';

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

describe('createVirtualList', () => {
  it('returns visible items with fixed layout data and padding', () => {
    createRoot((dispose) => {
      const virtual = createVirtualList({
        items: ['a', 'b', 'c'],
        itemHeight: 20,
        elementRef: undefined,
        overscan: 40
      });

      expect(virtual.children()).toEqual([
        { item: 'a', index: 0, top: 0, height: 20 },
        { item: 'b', index: 1, top: 20, height: 20 }
      ]);
      expect(virtual.totalHeight).toBe(60);
      expect(virtual.paddingTop).toBe(0);
      expect(virtual.paddingBottom).toBe(20);
      dispose();
    });
  });

  it('reacts to accessor-based layout props through normalized getters', () => {
    const [gap, setGap] = createSignal(0);
    const [overscan, setOverscan] = createSignal(20);
    const { dispose, virtual } = createRoot((dispose) => ({
      dispose,
      virtual: createVirtualList({
        items: ['a', 'b', 'c'],
        itemHeight: 20,
        elementRef: undefined,
        gap,
        overscan
      })
    }));

    expect(virtual.children().map((child) => child.item)).toEqual(['a']);
    expect(virtual.totalHeight).toBe(60);

    setGap(10);
    setOverscan(60);
    flush();
    expect(virtual.children().map((child) => child.item)).toEqual(['a', 'b']);
    expect(virtual.children()[1]?.top).toBe(30);
    expect(virtual.totalHeight).toBe(80);
    dispose();
  });

  it('scrolls to indexes and clamps absolute offsets', async () => {
    const scroller = createScroller(40);

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const virtual = createVirtualList({
          items: ['a', 'b', 'c', 'd'],
          itemHeight: 20,
          elementRef: scroller.element,
          overscan: 0
        });

        queueMicrotask(() => {
          try {
            expect(virtual.scrollToIndex(2, { align: 'center', behavior: 'smooth' })).toBe(true);
            expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 30, behavior: 'smooth' });

            expect(virtual.scrollToOffset(1_000)).toBe(true);
            expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 40, behavior: 'auto' });
            resolve();
          } catch (error: unknown) {
            reject(error);
          } finally {
            dispose();
          }
        });
      });
    });
  });

  it('preserves visible child identity while scrolling', async () => {
    const scroller = createScroller(40);

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const virtual = createVirtualList({
          items: ['a', 'b', 'c', 'd'],
          itemHeight: 20,
          elementRef: scroller.element,
          overscan: 0
        });

        queueMicrotask(() => {
          try {
            scrollTo(scroller.element, 1);
            const initialChildren = virtual.children();

            scrollTo(scroller.element, 2);
            expect(virtual.children()).toBe(initialChildren);

            scrollTo(scroller.element, 20);
            const shiftedChildren = virtual.children();
            expect(shiftedChildren.map((child) => child.item)).toEqual(['b', 'c']);
            expect(shiftedChildren[0]).toBe(initialChildren[1]);
            expect(shiftedChildren[1]).toBe(initialChildren[2]);
            resolve();
          } catch (error: unknown) {
            reject(error);
          } finally {
            dispose();
          }
        });
      });
    });
  });

  it('preserves the visible array when an item update does not affect it', () => {
    const [items, setItems] = createSignal<readonly string[]>(['a', 'b', 'c']);
    const { dispose, virtual } = createRoot((dispose) => ({
      dispose,
      virtual: createVirtualList({
        items,
        itemHeight: 20,
        elementRef: undefined,
        overscan: 40
      })
    }));
    const initialChildren = virtual.children();

    setItems(['a', 'b', 'changed']);
    flush();
    expect(virtual.children()).toBe(initialChildren);

    setItems(['changed', 'b', 'c']);
    flush();
    const changedChildren = virtual.children();
    expect(changedChildren).not.toBe(initialChildren);
    expect(changedChildren[1]).toBe(initialChildren[1]);
    dispose();
  });

  it('adds dynamic height without enabling nesting', () => {
    createRoot((dispose) => {
      const items = [{ height: 10 }, { height: 20 }];
      const virtual = createVirtualList({
        items,
        elementRef: undefined,
        itemHeight: createDynamicHeight<(typeof items)[number]>({
          estimate: (item) => item.height
        }),
        overscan: 1_000,
        gap: 0
      });

      expect(virtual.children().map((child) => child.item)).toEqual(items);
      expect(virtual.children().map((child) => child.ownHeight)).toEqual([10, 20]);
      expect(virtual.children().every((child) => child.childCount === 0)).toBe(true);
      expect(virtual.totalHeight).toBe(30);
      dispose();
    });
  });
});

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
