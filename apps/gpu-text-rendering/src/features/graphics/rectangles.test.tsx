import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { FrameLoop } from '../scene/FrameLoop';
import { ScreenSpace } from '../scene/SceneSpace';
import { Rectangle } from './Rectangle';
import { Rectangles } from './Rectangles';

vi.mock('../viewport/Viewport', () => ({
  useViewport: () => ({
    size: () => ({ css: { width: 800, height: 600 } }),
    screenToClip: (point: { x: number; y: number }) => point,
    clientToScreen: (point: { x: number; y: number }) => point
  })
}));
vi.mock('../../shared/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));

let gpu: ReturnType<typeof gpuFixture>['gpu'];
let events: string[];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  events = [];
  gpu = gpuFixture().gpu;
  let buffers = 0;
  const pipeline = {
    with: () => pipeline,
    draw: (vertices: number, instances: number) => events.push(`draw ${vertices}x${instances}`)
  };
  Object.assign(gpu, {
    format: 'bgra8unorm',
    root: {
      createUniform: vi.fn(() => ({ buffer: { write: vi.fn(), destroy: vi.fn() } })),
      createBuffer: vi.fn((schema: { elementCount: number }) => {
        const id = ++buffers;
        events.push(`allocate ${id}:${schema.elementCount}`);
        const buffer = {
          write: (items: unknown[]) => events.push(`write ${id}:${items.length}`),
          destroy: () => events.push(`destroy ${id}`)
        };
        return { $usage: () => buffer };
      }),
      createBindGroup: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => pipeline)
    }
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  frames.clear();
  vi.unstubAllGlobals();
});

it('shares one pipeline per root and uploads replaced items before drawing, reallocating on count changes', async () => {
  const [items, setItems] = createSignal([{ x: 0, y: 0, width: 1, height: 1 }]);
  mount(() => (
    <ScreenSpace>
      <Rectangle x={0} y={0} width={10} height={10} color={[1, 0, 0, 1]} />
      <Rectangles items={items()} color={[0, 1, 0, 1]} />
    </ScreenSpace>
  ));
  await tick();
  expect(gpu.root.createRenderPipeline).toHaveBeenCalledOnce();
  expect(events).toEqual(['allocate 1:1', 'allocate 2:1', 'write 1:1', 'write 2:1', 'draw 4x1', 'draw 4x1']);

  events.length = 0;
  setItems([...items()]);
  flush();
  await tick();
  expect(events).toEqual(['write 2:1', 'draw 4x1', 'draw 4x1']);

  events.length = 0;
  setItems([...items(), { x: 2, y: 2, width: 1, height: 1 }]);
  flush();
  await tick();
  expect(events).toEqual(['allocate 3:2', 'destroy 2', 'write 3:2', 'draw 4x1', 'draw 4x2']);

  events.length = 0;
  setItems([]);
  flush();
  await tick();
  expect(events).toEqual(['allocate 4:1', 'destroy 3', 'draw 4x1']);
});

function mount(children: () => ReturnType<typeof ScreenSpace>) {
  const dispose = createRoot((disposeRoot) => {
    const disposeView = render(
      () => <FrameLoop onError={vi.fn()}>{children()}</FrameLoop>,
      document.createElement('div')
    );

    return () => {
      disposeView();
      disposeRoot();
    };
  });

  cleanups.push(dispose);
  flush();
}

async function tick() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(performance.now()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
}
