import { render } from '@solidjs/web';
import { createRoot, createSignal, flush, onCleanup } from 'solid-js';
import tgpu from 'typegpu';
import { afterEach, expect, it, vi } from 'vitest';
import type { GpuContext } from './context';
import { GpuCanvasProvider, useGpuCanvas } from './GpuCanvasProvider';
import { TypeGPURootProvider } from './TypeGPURootProvider';

vi.mock('typegpu', () => ({ default: { initFromDevice: vi.fn() } }));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('replaces/removes canvas consumers without recreating their device', async () => {
  const device = Object.assign(new EventTarget(), { destroy: vi.fn(), lost: new Promise(() => {}) });
  const requestDevice = vi.fn(async () => device);
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({ limits: { maxBufferSize: 2 ** 30 }, requestDevice }),
      getPreferredCanvasFormat: () => 'bgra8unorm'
    }
  });
  const destroyRoot = vi.fn();
  vi.mocked(tgpu.initFromDevice).mockReturnValue({ device, destroy: destroyRoot } as unknown as ReturnType<
    typeof tgpu.initFromDevice
  >);
  const first = canvasFixture();
  const second = canvasFixture();
  const bindings: GpuContext[] = [];
  const detached = vi.fn();
  const onError = vi.fn(() => null);
  function Consumer() {
    bindings.push(useGpuCanvas());
    onCleanup(detached);
    return null;
  }
  const { setCanvas, dispose } = createRoot((disposeState) => {
    const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
    const disposeView = render(
      () => (
        <TypeGPURootProvider requiredBufferBytes={1} error={onError}>
          <GpuCanvasProvider canvas={canvas()} error={onError}>
            <Consumer />
          </GpuCanvasProvider>
        </TypeGPURootProvider>
      ),
      document.createElement('div')
    );
    const dispose = () => {
      disposeView();
      disposeState();
    };
    cleanups.push(dispose);
    return { setCanvas, dispose };
  });
  await settle();
  expect(bindings).toHaveLength(0);
  setCanvas(first.canvas);
  await settle();
  expect(bindings[0]!.context).toBe(first.context);
  setCanvas(second.canvas);
  await settle();
  expect(bindings[0]!.signal.aborted).toBe(true);
  expect(first.context.unconfigure).toHaveBeenCalledOnce();
  expect(bindings[1]!.context).toBe(second.context);
  expect(detached).toHaveBeenCalledOnce();
  expect(requestDevice).toHaveBeenCalledOnce();
  expect(device.destroy).not.toHaveBeenCalled();
  setCanvas(undefined);
  await settle();
  expect(second.context.unconfigure).toHaveBeenCalledOnce();
  expect(detached).toHaveBeenCalledTimes(2);
  dispose();
  expect(destroyRoot).toHaveBeenCalledOnce();
  expect(device.destroy).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
});

function canvasFixture() {
  const canvas = document.createElement('canvas');
  const context = { canvas, configure: vi.fn(), unconfigure: vi.fn() };
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as GPUCanvasContext);
  return { canvas, context };
}

async function settle() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
    flush();
  }
}
