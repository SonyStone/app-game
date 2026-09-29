import { afterEach, expect, it, vi } from 'vitest';
import { readFileBytes } from './readFileBytes';

afterEach(() => vi.restoreAllMocks());

it('reads bytes with initial and final progress and releases the abort listener', async () => {
  const controller = new AbortController();
  const progress = vi.fn();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const bytes = await readFileBytes(new Blob(['hello']), { signal: controller.signal, onProgress: progress });
  expect(new TextDecoder().decode(bytes)).toBe('hello');
  expect(progress).toHaveBeenNthCalledWith(1, 0, 5);
  expect(progress).toHaveBeenLastCalledWith(5, 5);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('does not read an already aborted source', async () => {
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  const reason = new Error('Stopped');
  await expect(readFileBytes(new Blob(['hello']), { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
  expect(read).not.toHaveBeenCalled();
});

it('stops an active read and rejects with the cancellation reason', async () => {
  const controller = new AbortController();
  const abort = vi.spyOn(FileReader.prototype, 'abort');
  const reading = readFileBytes(new Blob(['hello']), { signal: controller.signal });
  controller.abort();
  await expect(reading).rejects.toBe(controller.signal.reason);
  expect(abort).toHaveBeenCalledOnce();
});

it('releases the abort listener when starting the read throws', async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const failure = new Error('Read failed');
  vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementationOnce(() => {
    throw failure;
  });
  await expect(readFileBytes(new Blob(), { signal: controller.signal })).rejects.toBe(failure);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it.each(['initial', 'final'] as const)('rejects when the %s progress callback throws', async (stage) => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const failure = new Error('Progress failed');
  await expect(
    readFileBytes(new Blob(['hello']), {
      signal: controller.signal,
      onProgress: (completed, total) => {
        if (completed === (stage === 'initial' ? 0 : total)) throw failure;
      }
    })
  ).rejects.toBe(failure);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it.each(['initial', 'final'] as const)('honors cancellation from the %s progress callback', async (stage) => {
  const controller = new AbortController();
  await expect(
    readFileBytes(new Blob(['hello']), {
      signal: controller.signal,
      onProgress: (completed, total) => {
        if (completed === (stage === 'initial' ? 0 : total)) controller.abort();
      }
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
});
