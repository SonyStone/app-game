import { createRoot } from 'solid-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createVirtualDynamicList } from '../src/createVirtualDynamicList';
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
        rowHeight: 20,
        elementRef: undefined,
        overscan: 2
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

  it('scrolls to indexes and clamps absolute offsets', async () => {
    const scroller = createScroller(40);

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const virtual = createVirtualList({
          items: ['a', 'b', 'c', 'd'],
          rowHeight: 20,
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
});

describe('createVirtualDynamicList', () => {
  it('uses the nested virtualizer for a flat dynamic-height list', () => {
    createRoot((dispose) => {
      const items = [{ height: 10 }, { height: 20 }];
      const virtual = createVirtualDynamicList({
        items,
        elementRef: undefined,
        estimateHeight: (item, index) => item.height + index,
        overscan: 1_000,
        gap: 0
      });

      expect(virtual.children().map((child) => child.item)).toEqual(items);
      expect(virtual.children().map((child) => child.ownHeight)).toEqual([10, 21]);
      expect(virtual.totalHeight).toBe(31);
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
