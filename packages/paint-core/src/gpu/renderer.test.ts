import { afterEach, expect, it, vi } from 'vitest';
import { createPaintRenderer } from './renderer';

const initFromDevice = vi.hoisted(() => vi.fn());
vi.mock('typegpu', async (importOriginal) => {
  const original = await importOriginal<typeof import('typegpu')>();
  const tgpu = { ...original.tgpu, initFromDevice };
  return { ...original, tgpu, default: tgpu };
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('releases a self-created device when the canvas cannot start WebGPU', async () => {
  const gpu = fakeGpu();
  initFromDevice.mockReturnValue(gpu.root);

  const failure = createPaintRenderer(gpu.canvas(null), vi.fn());

  await expect(failure).rejects.toMatchObject({ cause: { kind: 'gpu', code: 'canvas' } });
  expect(gpu.device.destroy).toHaveBeenCalledOnce();
  expect(gpu.root.destroy).toHaveBeenCalledOnce();
});

it('releases the device, root, listener and context when a later allocation throws', async () => {
  const gpu = fakeGpu();
  const context = { configure: vi.fn(), unconfigure: vi.fn() };
  gpu.root.createRenderPipeline.mockImplementation(() => {
    throw new Error('pipeline failed');
  });
  initFromDevice.mockReturnValue(gpu.root);

  await expect(createPaintRenderer(gpu.canvas(context), vi.fn())).rejects.toThrow('pipeline failed');

  expect(gpu.device.destroy).toHaveBeenCalledOnce();
  expect(gpu.root.destroy).toHaveBeenCalledOnce();
  expect(gpu.device.removeEventListener).toHaveBeenCalledWith('uncapturederror', expect.any(Function));
  expect(context.unconfigure).toHaveBeenCalledOnce();
});

it('keeps a borrowed device alive when construction fails', async () => {
  const gpu = fakeGpu();
  initFromDevice.mockReturnValue(gpu.root);

  await expect(
    createPaintRenderer(gpu.canvas(null), vi.fn(), { device: gpu.device as unknown as GPUDevice })
  ).rejects.toMatchObject({ cause: { code: 'canvas' } });

  expect(gpu.device.destroy).not.toHaveBeenCalled();
  expect(gpu.root.destroy).toHaveBeenCalledOnce();
});

it('reports a missing adapter as a typed adapter failure', async () => {
  const canvas = fakeGpu().canvas(null);
  vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null, getPreferredCanvasFormat: () => 'bgra8unorm' } });

  await expect(createPaintRenderer(canvas, vi.fn())).rejects.toMatchObject({
    cause: { code: 'adapter' }
  });
});

/** A WebGPU double that records releases; renderer construction stops before any real GPU work. */
function fakeGpu() {
  const device = {
    lost: new Promise(() => {}),
    limits: { maxTextureDimension2D: 8192, maxTextureArrayLayers: 256 },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    destroy: vi.fn()
  };
  const root = {
    device,
    destroy: vi.fn(),
    createRenderPipeline: vi.fn(),
    createBuffer: vi.fn(),
    createSampler: vi.fn(),
    createTexture: vi.fn(),
    createBindGroup: vi.fn()
  };
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({ requestDevice: async () => device }),
      getPreferredCanvasFormat: () => 'bgra8unorm'
    }
  });

  return {
    device,
    root,
    canvas: (context: unknown) => ({ getContext: () => context }) as unknown as OffscreenCanvas
  };
}
