import { createRoot } from 'solid-js';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GpuContext } from './context';
import { createGpuResource } from './createGpuResource';

vi.mock('./GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));

let abort: AbortController;
let gpu: GpuContext;

beforeEach(() => {
  abort = new AbortController();
  gpu = { signal: abort.signal } as GpuContext;
});

it('passes the canvas context to create and destroys the resource with its owner', () => {
  const resource = { destroy: vi.fn() };
  const create = vi.fn(() => resource);

  const dispose = createRoot((dispose) => {
    expect(createGpuResource(create)).toBe(resource);
    return dispose;
  });

  expect(create).toHaveBeenCalledWith(gpu);
  expect(resource.destroy).not.toHaveBeenCalled();
  dispose();
  expect(resource.destroy).toHaveBeenCalledOnce();
});

it('destroys the resource once when the canvas detaches before its owner', () => {
  const resource = { destroy: vi.fn() };
  const dispose = createRoot((dispose) => {
    createGpuResource(() => resource);
    return dispose;
  });

  abort.abort();
  dispose();
  expect(resource.destroy).toHaveBeenCalledOnce();
});

it('destroys a resource created after the canvas has already detached', () => {
  const resource = { destroy: vi.fn() };
  abort.abort();

  createRoot((dispose) => {
    createGpuResource(() => resource);
    return dispose;
  });

  expect(resource.destroy).toHaveBeenCalledOnce();
});
