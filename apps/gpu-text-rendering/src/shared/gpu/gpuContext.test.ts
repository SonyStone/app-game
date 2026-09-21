import { createRoot, createSignal, flush } from 'solid-js';
import tgpu from 'typegpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGpuCanvas } from './context';
import { createGpuRoot } from './createGpuRoot';

vi.mock('typegpu', () => ({ default: { initFromDevice: vi.fn() } }));
const cleanups: (() => void)[] = [];
beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('GPU provider ownership and typed states', () => {
  it('reports missing WebGPU, null adapters and rejected adapter requests', async () => {
    const { requestAdapter } = setup();
    requestAdapter.mockRejectedValueOnce(new Error('Adapter request rejected'));
    const first = mount();
    await settle();
    expect(first.state()).toMatchObject({ status: 'error', error: { code: 'adapter' } });
    requestAdapter.mockResolvedValueOnce(null);
    const second = mount();
    await settle();
    expect(second.state()).toMatchObject({ status: 'error', error: { code: 'adapter' } });
    vi.stubGlobal('navigator', {});
    const third = mount();
    await settle();
    expect(third.state()).toMatchObject({ status: 'error', error: { code: 'unavailable' } });
  });

  it('checks buffer limits before requesting a device', async () => {
    const { requestDevice } = setup();
    const owner = mount(2 ** 31);
    await settle();
    expect(owner.state()).toMatchObject({ status: 'error', error: { code: 'buffer-limit' } });
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it('does not request a device from an adapter resolved after disposal', async () => {
    const { requestAdapter, requestDevice, adapter } = setup();
    const pending = deferred<GPUAdapter | null>();
    requestAdapter.mockReturnValueOnce(pending.promise);
    const owner = mount();
    owner.dispose();
    pending.resolve(adapter);
    await settle();
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it('destroys a late device without publishing it or allocating a root', async () => {
    const { device, requestDevice } = setup();
    const pending = deferred<GPUDevice>();
    requestDevice.mockReturnValueOnce(pending.promise);
    const owner = mount();
    await settle();
    owner.dispose();
    pending.resolve(device);
    await settle();
    expect(device.destroy).toHaveBeenCalledOnce();
    expect(tgpu.initFromDevice).not.toHaveBeenCalled();
    expect(owner.state().status).toBe('loading');
  });

  it('ignores a late rejection after disposal', async () => {
    const { requestDevice } = setup();
    const pending = deferred<GPUDevice>();
    requestDevice.mockReturnValueOnce(pending.promise);
    const owner = mount();
    await settle();
    owner.dispose();
    pending.reject(new Error('Device request rejected'));
    await settle();
    expect(owner.state().status).toBe('loading');
  });

  it('releases the device when TypeGPU initialization fails', async () => {
    const { device } = setup();
    vi.mocked(tgpu.initFromDevice).mockImplementationOnce(() => {
      throw new Error('Root failed');
    });
    const owner = mount();
    await settle();
    expect(owner.state()).toMatchObject({ status: 'error', error: { code: 'device' } });
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('replaces roots when buffer requirements change and ignores old device loss', async () => {
    const { device, lose, requestDevice } = setup();
    const owner = mount();
    await settle();
    const first = ready(owner);
    const second = Object.assign(new EventTarget(), {
      destroy: vi.fn(),
      lost: new Promise<GPUDeviceLostInfo>(() => {})
    }) as unknown as GPUDevice;
    requestDevice.mockResolvedValueOnce(second);
    owner.setBytes(512 * 1024 * 1024);
    await settle();
    expect(first.signal.aborted).toBe(true);
    expect(device.destroy).toHaveBeenCalledOnce();
    expect(requestDevice).toHaveBeenLastCalledWith({ requiredLimits: { maxBufferSize: 512 * 1024 * 1024 } });
    lose({ message: 'Old device lost', reason: 'unknown' });
    await settle();
    expect(ready(owner).device).toBe(second);
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it.each(['context', 'configure', 'null'])(
    'reports a %s failure without taking ownership of the device',
    async (stage) => {
      const { canvas, context, device, destroyRoot } = setup();
      const owner = mount();
      await settle();
      if (stage === 'null') {
        vi.spyOn(canvas, 'getContext').mockReturnValueOnce(null);
      } else if (stage === 'context') {
        vi.spyOn(canvas, 'getContext').mockImplementationOnce(() => {
          throw new Error('Context failed');
        });
      } else {
        context.configure.mockImplementationOnce(() => {
          throw new Error('Configure failed');
        });
      }
      const result = createRoot((dispose) => {
        cleanups.push(dispose);
        return createGpuCanvas(ready(owner), canvas);
      });
      expect(result._unsafeUnwrapErr()).toMatchObject({ code: 'canvas' });
      expect(device.destroy).not.toHaveBeenCalled();
      expect(destroyRoot).not.toHaveBeenCalled();
    }
  );

  it('unconfigures canvases on disposal and leaves the shared root alive', async () => {
    const { canvas, context, device } = setup();
    const owner = mount();
    await settle();
    const canvasOwner = createRoot((dispose) => ({
      dispose,
      gpu: createGpuCanvas(ready(owner), canvas)._unsafeUnwrap()
    }));
    canvasOwner.dispose();
    canvasOwner.dispose();
    expect(context.unconfigure).toHaveBeenCalledOnce();
    expect(canvasOwner.gpu.signal.aborted).toBe(true);
    expect(device.destroy).not.toHaveBeenCalled();
    expect(ready(owner).checkActive().isOk()).toBe(true);
  });

  it('propagates device loss while idle and cleans up once', async () => {
    const { canvas, context, device, destroyRoot, lose } = setup();
    const owner = mount();
    await settle();
    const root = ready(owner);
    const gpu = createRoot((dispose) => {
      cleanups.push(dispose);
      return createGpuCanvas(root, canvas)._unsafeUnwrap();
    });
    lose({ message: 'GPU removed', reason: 'unknown' });
    await settle();
    expect(owner.state()).toMatchObject({ status: 'error', error: { code: 'lost' } });
    expect(gpu.signal.aborted).toBe(true);
    expect(gpu.checkActive()._unsafeUnwrapErr()).toMatchObject({ code: 'lost' });
    owner.dispose();
    expect(device.destroy).toHaveBeenCalledOnce();
    expect(destroyRoot).toHaveBeenCalledOnce();
    expect(context.unconfigure).toHaveBeenCalledOnce();
  });

  it('does not report intentional destruction as device loss', async () => {
    const { lose, device } = setup();
    const owner = mount();
    await settle();
    const gpu = ready(owner);
    owner.dispose();
    lose({ message: 'Destroyed', reason: 'destroyed' });
    await settle();
    expect(gpu.checkActive()._unsafeUnwrapErr().code).toBe('destroyed');
    expect(owner.state().status).toBe('ready');
    expect(device.destroy).toHaveBeenCalledOnce();
  });
});

function mount(bytes = 1) {
  const result = createRoot((dispose) => {
    cleanups.push(dispose);
    const [bufferBytes, setBytes] = createSignal(bytes);
    return { state: createGpuRoot(bufferBytes), setBytes, dispose };
  });
  flush();
  return result;
}

function ready(owner: ReturnType<typeof mount>) {
  const state = owner.state();
  if (state.status !== 'ready') {
    throw new Error(`Expected ready, got ${state.status}`);
  }
  return state.gpu;
}

function setup() {
  type LostInfo = Pick<GPUDeviceLostInfo, 'message' | 'reason'>;
  let lose!: (info: LostInfo) => void;
  const device = Object.assign(new EventTarget(), {
    destroy: vi.fn(),
    lost: new Promise<LostInfo>((resolve) => {
      lose = resolve;
    })
  }) as unknown as GPUDevice;
  const requestDevice = vi.fn(async () => device);
  const adapter = { limits: { maxBufferSize: 2 ** 30 }, requestDevice } as unknown as GPUAdapter;
  const requestAdapter = vi.fn<() => Promise<GPUAdapter | null>>(async () => adapter);
  vi.stubGlobal('navigator', { gpu: { requestAdapter, getPreferredCanvasFormat: () => 'bgra8unorm' } });
  const destroyRoot = vi.fn();
  vi.mocked(tgpu.initFromDevice).mockImplementation(
    ({ device }) => ({ destroy: destroyRoot, device }) as unknown as ReturnType<typeof tgpu.initFromDevice>
  );
  const context = { configure: vi.fn(), unconfigure: vi.fn() };
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as GPUCanvasContext);
  return { canvas, context, device, destroyRoot, adapter, requestAdapter, requestDevice, lose };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    flush();
  }
}
