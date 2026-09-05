import { describe, expect, it, vi } from 'vitest';
import { createMethodProxy, installWebGLContextHook } from './index';

describe('installWebGLContextHook', () => {
  it('wraps each WebGL context once and restores only its own patch', () => {
    const nativeContext = { getParameter: vi.fn() } as unknown as WebGLRenderingContext;
    class TestCanvas {
      getContext(type: string): WebGLRenderingContext | null {
        return type === 'webgl2' ? nativeContext : null;
      }
    }
    const originalGetContext = TestCanvas.prototype.getContext;
    const wrappedContext = { getParameter: vi.fn() } as unknown as WebGLRenderingContext;
    const wrapContext = vi.fn(() => wrappedContext);
    const onContext = vi.fn();
    const hook = installWebGLContextHook({
      target: { HTMLCanvasElement: TestCanvas as unknown as typeof HTMLCanvasElement },
      wrapContext,
      onContext
    });
    const canvas = new TestCanvas();

    expect(canvas.getContext('webgl2')).toBe(wrappedContext);
    expect(canvas.getContext('webgl2')).toBe(wrappedContext);
    expect(wrapContext).toHaveBeenCalledTimes(1);
    expect(onContext).toHaveBeenCalledTimes(1);
    expect(hook.contexts).toEqual(new Set([wrappedContext]));

    hook.restore();

    expect(TestCanvas.prototype.getContext).toBe(originalGetContext);
    expect(hook.contexts.size).toBe(0);
  });

  it('leaves non-WebGL contexts alone', () => {
    const context2d = { fillRect: vi.fn() };
    class TestCanvas {
      getContext(): typeof context2d {
        return context2d;
      }
    }
    const wrapContext = vi.fn();
    const hook = installWebGLContextHook({
      target: { HTMLCanvasElement: TestCanvas as unknown as typeof HTMLCanvasElement },
      wrapContext
    });

    expect(new TestCanvas().getContext()).toBe(context2d);
    expect(wrapContext).not.toHaveBeenCalled();
    hook.restore();
  });
});

describe('createMethodProxy', () => {
  it('uses the native receiver and reports returned values and errors', () => {
    const error = new Error('bad call');
    const target = {
      value: 2,
      multiply(this: { value: number }, amount: number) {
        return this.value * amount;
      },
      fail() {
        throw error;
      }
    };
    const onCall = vi.fn();
    const proxy = createMethodProxy(target, { onCall, now: () => 10 });

    expect(proxy.multiply(3)).toBe(6);
    expect(() => proxy.fail()).toThrow(error);
    expect(onCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'multiply', status: 'returned', result: 6, startTime: 10, endTime: 10 })
    );
    expect(onCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'fail', status: 'threw', error, startTime: 10, endTime: 10 })
    );
  });
});
