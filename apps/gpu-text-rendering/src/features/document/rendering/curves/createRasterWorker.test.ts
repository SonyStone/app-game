import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createRasterWorker } from './createRasterWorker';
import type { RasterRequest } from './rasterWorkerTypes';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});

it('queues requests, reuses the decoded source, and resends bytes after idle termination', async () => {
  vi.useFakeTimers();
  const { decoder, workers } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const first = decoder.decode(request, read);
  const second = decoder.decode(request, read);
  const worker = workers[0]!;
  expect(worker.postMessage).toHaveBeenCalledOnce();
  const bytes = read.mock.results[0]!.value;
  expect(worker.postMessage).toHaveBeenCalledWith({ ...request, bytes }, [bytes]);
  worker.reply();
  expect((await first).isOk()).toBe(true);
  expect(worker.postMessage).toHaveBeenLastCalledWith({ ...request, bytes: undefined }, []);
  worker.reply();
  expect((await second).isOk()).toBe(true);
  expect(read).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(worker.terminate).toHaveBeenCalledOnce();
  const third = decoder.decode(request, read);
  expect(workers).toHaveLength(2);
  expect(read).toHaveBeenCalledTimes(2);
  workers[1]!.reply();
  expect((await third).isOk()).toBe(true);
});

it('times out stalled work, discards its cache, and starts queued work in a new worker', async () => {
  vi.useFakeTimers();
  const { decoder, workers } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const stalled = decoder.decode(request, read);
  const queued = decoder.decode(request, read);
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await stalled)._unsafeUnwrapErr().message).toContain('60 seconds');
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(workers).toHaveLength(2);
  workers[0]!.reply();
  expect(workers[1]!.terminate).not.toHaveBeenCalled();
  workers[1]!.reply();
  expect((await queued).isOk()).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
});

it('settles active and queued callers on owner disposal and rejects future work', async () => {
  const { decoder, workers, dispose } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const active = decoder.decode(request, read);
  const queued = decoder.decode(request, read);
  dispose();
  workers[0]!.reply();
  for (const result of await Promise.all([active, queued, decoder.decode(request, read)])) {
    expect(result._unsafeUnwrapErr().code).toBe('destroyed');
  }
  expect(read).toHaveBeenCalledOnce();
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
});

function fixture() {
  const workers: FakeWorker[] = [];
  return createRoot((dispose) => {
    cleanups.push(dispose);
    const decoder = createRasterWorker(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    return { decoder, workers, dispose };
  });
}
class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  reply() {
    this.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: { id: 0, tiles: [] } } }));
  }
}
const request: Omit<RasterRequest, 'bytes'> = { id: 0, width: 2, height: 2, codec: 0, tiles: [] };
