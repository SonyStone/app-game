import { createRoot } from 'solid-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDynamicGap } from '../src/createDynamicGap';
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

describe('createDynamicGap', () => {
  it('reads the layout container row gap and supplies it to a virtual list', () => {
    createRoot((dispose) => {
      const gap = createDynamicGap();
      const container = document.createElement('div');
      document.body.append(container);
      container.style.rowGap = '10px';
      gap.setElementRef(container);

      const virtual = createVirtualList({
        items: ['a', 'b', 'c'],
        itemHeight: createDynamicHeight({ estimate: 20 }),
        elementRef: undefined,
        overscan: 100,
        gap
      });

      expect(gap()).toBe(10);
      expect(virtual.totalHeight).toBe(80);
      container.remove();
      dispose();
    });
  });

  it('reacts when the attached element inline style changes', async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const gap = createDynamicGap();
        const container = document.createElement('div');
        document.body.append(container);
        container.style.rowGap = '8px';
        gap.setElementRef(container);

        queueMicrotask(() => {
          container.style.rowGap = '16px';

          setTimeout(() => {
            try {
              expect(gap()).toBe(16);
              resolve();
            } catch (error: unknown) {
              reject(error);
            } finally {
              container.remove();
              dispose();
            }
          });
        });
      });
    });
  });

  it('ignores virtual padding style changes', async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
        const gap = createDynamicGap();
        const container = document.createElement('div');
        document.body.append(container);
        container.style.rowGap = '8px';
        gap.setElementRef(container);
        const initialReadCount = getComputedStyleSpy.mock.calls.length;

        container.style.paddingTop = '100px';
        container.style.paddingBottom = '200px';

        setTimeout(() => {
          try {
            expect(gap()).toBe(8);
            expect(getComputedStyleSpy).toHaveBeenCalledTimes(initialReadCount);
            resolve();
          } catch (error: unknown) {
            reject(error);
          } finally {
            getComputedStyleSpy.mockRestore();
            container.remove();
            dispose();
          }
        });
      });
    });
  });

  it('uses its fallback before attachment and treats CSS normal as zero', () => {
    createRoot((dispose) => {
      const gap = createDynamicGap({ fallback: 6 });
      const container = document.createElement('div');
      document.body.append(container);

      expect(gap()).toBe(6);
      gap.setElementRef(container);

      expect(gap()).toBe(0);
      container.remove();
      dispose();
    });
  });
});
