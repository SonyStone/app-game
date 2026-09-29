import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { workerShutdownGraceMs } from '../../../../shared/worker/createWorkerTransport';
import { workerShutdown } from '../../../../shared/worker/workerProtocol';
import { createRasterWorker } from './createRasterWorker';
import type { RasterRequest } from './rasterWorkerTypes';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});

it('reuses the decoded source and resends bytes after the idle worker shuts down', async () => {
  vi.useFakeTimers();
  const { decoder, workers } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const first = decoder.decode(request, read);
  const worker = workers[0]!;
  const bytes = read.mock.results[0]!.value;
  expect(worker.postMessage).toHaveBeenCalledWith({ ...request, bytes }, [bytes]);
  worker.reply();
  expect((await first).isOk()).toBe(true);
  const second = decoder.decode(request, read);
  expect(worker.postMessage).toHaveBeenLastCalledWith({ ...request, bytes: undefined }, []);
  worker.reply();
  expect((await second).isOk()).toBe(true);
  expect(read).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(worker.postMessage).toHaveBeenLastCalledWith(workerShutdown);
  await vi.advanceTimersByTimeAsync(workerShutdownGraceMs);
  expect(worker.terminate).toHaveBeenCalledOnce();
  const third = decoder.decode(request, read);
  expect(workers).toHaveLength(2);
  expect(read).toHaveBeenCalledTimes(2);
  workers[1]!.reply();
  expect((await third).isOk()).toBe(true);
});

it('rejects overlapping requests instead of queueing them', async () => {
  const { decoder, workers } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const first = decoder.decode(request, read);
  expect((await decoder.decode(request, read))._unsafeUnwrapErr().message).toContain('busy');
  expect(workers[0]!.postMessage).toHaveBeenCalledOnce();
  workers[0]!.reply();
  expect((await first).isOk()).toBe(true);
});

it('times out stalled work, discards its cache, and ignores its late reply', async () => {
  vi.useFakeTimers();
  const { decoder, workers } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const stalled = decoder.decode(request, read);
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await stalled)._unsafeUnwrapErr().message).toContain('60 seconds');
  expect(workers[0]!.postMessage).toHaveBeenLastCalledWith(workerShutdown);
  const next = decoder.decode(request, read);
  expect(workers).toHaveLength(2);
  workers[0]!.reply();
  workers[1]!.reply();
  expect((await next).isOk()).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
});

it('settles the active request on owner disposal, shuts down cooperatively and rejects future work', async () => {
  vi.useFakeTimers();
  const { decoder, workers, dispose } = fixture();
  const read = vi.fn(() => new ArrayBuffer(4));
  const active = decoder.decode(request, read);
  dispose();
  workers[0]!.reply();
  for (const result of await Promise.all([active, decoder.decode(request, read)])) {
    expect(result._unsafeUnwrapErr().code).toBe('destroyed');
  }
  expect(read).toHaveBeenCalledOnce();
  expect(workers[0]!.postMessage).toHaveBeenLastCalledWith(workerShutdown);
  expect(workers[0]!.terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(workerShutdownGraceMs);
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
