import { describe, expect, it, vi } from 'vitest';
import { installSpectorContextHook } from './spector-context-hook';

describe('installSpectorContextHook', () => {
  it('reports each WebGL context once and restores the canvas prototype', () => {
    const context = { getParameter: vi.fn() } as unknown as WebGLRenderingContext;
    class TestCanvas {
      getContext(type: string): WebGLRenderingContext | null {
        return type === 'webgl2' ? context : null;
      }
    }
    const originalGetContext = TestCanvas.prototype.getContext;
    const onContext = vi.fn();
    const hook = installSpectorContextHook({
      target: { HTMLCanvasElement: TestCanvas as unknown as typeof HTMLCanvasElement },
      onContext
    });
    const canvas = new TestCanvas();

    expect(canvas.getContext('webgl2')).toBe(context);
    expect(canvas.getContext('webgl2')).toBe(context);
    expect(onContext).toHaveBeenCalledTimes(1);
    expect(hook.contexts.size).toBe(1);

    hook.restore();

    expect(TestCanvas.prototype.getContext).toBe(originalGetContext);
    expect(hook.contexts.size).toBe(0);
  });

  it('ignores non-WebGL contexts', () => {
    const onContext = vi.fn();
    class TestCanvas {
      getContext(): { fillRect(): void } {
        return { fillRect() {} };
      }
    }
    const hook = installSpectorContextHook({
      target: { HTMLCanvasElement: TestCanvas as unknown as typeof HTMLCanvasElement },
      onContext
    });

    new TestCanvas().getContext();

    expect(onContext).not.toHaveBeenCalled();
    hook.restore();
  });
});
