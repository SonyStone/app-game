import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { d } from 'typegpu';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import type { Viewport } from '../viewport/createViewport';
import { createUniform } from './createUniform';
import { FrameLoop } from './FrameLoop';
import { RenderLayer } from './RenderLayer';

const viewport = {
  size: () => ({ css: { width: 800, height: 600 }, pixels: { width: 800, height: 600 }, dpr: 1 }),
  clientToScreen: (point: { x: number; y: number }) => point,
  screenToClip: (point: { x: number; y: number }) => point
} as Viewport;

vi.mock('@app-game/solid-gpu/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));

let gpu: ReturnType<typeof gpuFixture>['gpu'];
let buffer: { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  buffer = { write: vi.fn(), destroy: vi.fn() };
  gpu = gpuFixture().gpu;
  Object.assign(gpu, { root: { createUniform: vi.fn(() => ({ buffer })) } });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  frames.clear();
  vi.unstubAllGlobals();
});

it('writes the latest value before each drawn frame and redraws when a reactive input changes', async () => {
  const [scale, setScale] = createSignal(1);
  const camera = { zoom: 2 };
  const order: string[] = [];
  buffer.write.mockImplementation((value: number) => order.push(`write ${value}`));

  function Scene() {
    createUniform(d.f32, () => scale() * camera.zoom);
    return <RenderLayer draw={() => void order.push('draw')} />;
  }

  const dispose = mount(() => <Scene />);
  await tick();
  expect(gpu.root.createUniform).toHaveBeenCalledWith(d.f32);
  expect(order).toEqual(['write 2', 'draw']);

  setScale(3);
  flush();
  expect(frames.size).toBe(1);
  await tick();
  expect(order).toEqual(['write 2', 'draw', 'write 6', 'draw']);

  // Non-reactive inputs are read whenever a frame is drawn for another reason.
  camera.zoom = 4;
  setScale(1);
  flush();
  await tick();
  expect(order.at(-2)).toBe('write 4');

  dispose();
  expect(buffer.destroy).toHaveBeenCalledOnce();
});

function mount(children: () => ReturnType<typeof RenderLayer>) {
  const dispose = createRoot((disposeRoot) => {
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          {children()}
        </FrameLoop>
      ),
      document.createElement('div')
    );

    return () => {
      disposeView();
      disposeRoot();
    };
  });

  flush();
  return dispose;
}

async function tick() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(performance.now()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
}
