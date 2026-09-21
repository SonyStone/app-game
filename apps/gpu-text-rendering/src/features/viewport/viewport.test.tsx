import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { Viewport, useViewport } from './Viewport';
import { measureViewport } from './measureViewport';

vi.mock('../../shared/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));
let gpu: ReturnType<typeof gpuFixture>['gpu'];
const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('caps DPR and GPU dimensions uniformly, including fractional sizes and invalid measurements', () => {
  expect(measureViewport(800, 600, 3, 2, 8192)).toEqual({
    css: { width: 800, height: 600 },
    pixels: { width: 1600, height: 1200 },
    dpr: 2
  });
  expect(measureViewport(800, 600, 3, 3, 1000)).toEqual({
    css: { width: 800, height: 600 },
    pixels: { width: 1000, height: 750 },
    dpr: 1.25
  });
  expect(measureViewport(800.5, 600.5, 1.25, 2, 8192).pixels).toEqual({ width: 1001, height: 751 });
  expect(measureViewport(0, NaN, Infinity, -1, 8192)).toEqual({
    css: { width: 1, height: 1 },
    pixels: { width: 1, height: 1 },
    dpr: 1
  });
});

it('reacts to resize, DPR and cap changes; shares inverse pointer conversions and cleans up observers', () => {
  const canvas = document.createElement('canvas');
  let rect = { left: 30, top: 50, width: 800, height: 600 };
  canvas.getBoundingClientRect = () => rect as DOMRect;
  gpu = gpuFixture().gpu;
  Object.assign(gpu.context, { canvas });

  let resize!: ResizeObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    }
  );
  const queries: (EventTarget & { media: string })[] = [];
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => {
    const query = Object.assign(new EventTarget(), { media });
    queries.push(query);
    return query as MediaQueryList;
  });
  vi.stubGlobal('devicePixelRatio', 3);
  let viewport!: ReturnType<typeof useViewport>;

  function Probe() {
    viewport = useViewport();
    return null;
  }

  const mounted = createRoot((disposeState) => {
    const [cap, setCap] = createSignal(2);
    const disposeView = render(
      () => (
        <Viewport maxDpr={cap()}>
          <Probe />
        </Viewport>
      ),
      document.createElement('div')
    );
    const dispose = () => {
      disposeView();
      disposeState();
    };
    cleanups.push(dispose);
    return { setCap, dispose };
  });

  flush();
  expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
  expect(viewport.clientToScreen({ x: 70, y: 80 })).toEqual({ x: 40, y: 30 });
  expect(viewport.screenToPixel({ x: 40, y: 30 })).toEqual({ x: 80, y: 60 });
  expect(viewport.pixelToScreen({ x: 80, y: 60 })).toEqual({ x: 40, y: 30 });
  expect(viewport.screenToClip({ x: 400, y: 300 })).toEqual({ x: 0, y: 0 });

  rect = { left: 10, top: 20, width: 400, height: 300 };
  resize(
    [
      { target: canvas, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }
    ] as unknown as ResizeObserverEntry[],
    {} as ResizeObserver
  );
  flush();
  expect([canvas.width, canvas.height]).toEqual([800, 600]);
  expect(viewport.clientToScreen({ x: 70, y: 80 })).toEqual({ x: 60, y: 60 });

  vi.stubGlobal('devicePixelRatio', 1.25);
  queries[0]!.dispatchEvent(new Event('change'));
  flush();
  expect(queries.at(-1)!.media).toBe('(resolution: 1.25dppx)');
  expect([canvas.width, canvas.height]).toEqual([500, 375]);

  mounted.setCap(1);
  flush();
  expect([canvas.width, canvas.height]).toEqual([400, 300]);
  mounted.dispose();
  expect(disconnect).toHaveBeenCalledOnce();

  vi.stubGlobal('devicePixelRatio', 2);
  queries.at(-1)!.dispatchEvent(new Event('change'));
  window.dispatchEvent(new Event('resize'));
  flush();
  expect([canvas.width, canvas.height]).toEqual([400, 300]);
});
