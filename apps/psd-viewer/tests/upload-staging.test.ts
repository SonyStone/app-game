import { afterEach, expect, it, vi } from 'vitest';
import { makeUploadStaging } from '../src/features/gpu-viewport/makeUploadStaging';

afterEach(() => vi.unstubAllGlobals());

it('bounds in-flight staging and reuses a buffer only after its asynchronous map completes', async () => {
  const { staging, buffers, finish } = fixture();
  const acquired = Array.from({ length: 128 }, () => {
    const slot = staging.acquire()!;
    slot.view[0] = 42;
    slot.unmap();
    return slot.buffer;
  });
  expect(new Set(acquired).size).toBe(128);
  expect(staging.acquire()).toBeUndefined();
  staging.submit();
  expect(buffers.every((buffer) => buffer.mapAsync.mock.calls.length === 1)).toBe(true);
  expect(staging.acquire()).toBeUndefined();
  finish[0]();
  await Promise.resolve();
  expect(staging.acquire()?.buffer).toBe(acquired[0]);
  staging.destroy();
});

it('releases all buffers and ignores late maps and commands after disposal', async () => {
  const { staging, buffers, finish } = fixture();
  staging.acquire()!.unmap();
  staging.submit();
  staging.destroy();
  staging.destroy();
  finish[0]();
  await Promise.resolve();
  expect(buffers.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
  expect(buffers.every((buffer) => buffer.getMappedRange.mock.calls.length === 1)).toBe(true);
  expect(staging.acquire()).toBeUndefined();
  staging.submit();
  expect(buffers[0].mapAsync).toHaveBeenCalledOnce();
});

function fixture() {
  vi.stubGlobal('GPUBufferUsage', { MAP_WRITE: 2, COPY_SRC: 4 });
  vi.stubGlobal('GPUMapMode', { WRITE: 2 });
  const finish: (() => void)[] = [];
  const buffers: ReturnType<typeof buffer>[] = [];
  function buffer(size: number) {
    const bytes = new ArrayBuffer(size);
    return {
      getMappedRange: vi.fn(() => bytes),
      unmap: vi.fn(),
      destroy: vi.fn(),
      mapAsync: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish.push(resolve);
          })
      )
    };
  }

  const staging = makeUploadStaging({
    createBuffer: (descriptor) => {
      const mocked = buffer(descriptor.size);
      buffers.push(mocked);
      // Deliberate device double: the staging owner uses only these four GPUBuffer operations.
      return mocked as unknown as GPUBuffer;
    }
  });
  return { staging, buffers, finish };
}
