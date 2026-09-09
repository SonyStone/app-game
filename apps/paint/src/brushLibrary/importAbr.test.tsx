import { afterEach, expect, it, vi } from 'vitest';
import type { Result } from '../asyncResult';
import type { BrushLibrary } from './decodeAbrLibrary';
import { importAbr } from './importAbr';

const workers = vi.hoisted(() => {
  const instances: {
    onmessage: ((event: { data: Result<BrushLibrary, string> }) => void) | null;
    onerror: ((event: { message: string }) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }[] = [];
  return { instances };
});
vi.mock('./importAbr.worker?worker', () => ({
  default: class {
    onmessage = null;
    onerror = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.instances.push(this);
    }
  }
}));
afterEach(() => {
  workers.instances.length = 0;
  vi.useRealTimers();
});

it('releases the decoder and abort listener after success', async () => {
  const abort = new AbortController();
  const result = importAbr(new File(['x'], 'tips.abr'), abort.signal);
  const worker = workers.instances[0]!;
  const library: BrushLibrary = { name: 'tips.abr', brushes: [], tips: [], skipped: 0, notices: 0 };
  worker.onmessage!({ data: { ok: true, value: library } });
  await expect(result).resolves.toBe(library);
  expect(worker.terminate).toHaveBeenCalledOnce();
  abort.abort();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('cancels a running import when its editor lifetime ends', async () => {
  const abort = new AbortController();
  const result = importAbr(new File(['x'], 'tips.abr'), abort.signal);
  const rejection = expect(result).rejects.toThrow('cancelled');
  abort.abort();
  await rejection;
  expect(workers.instances[0]!.terminate).toHaveBeenCalledOnce();
  await expect(importAbr(new File(['x'], 'tips.abr'), abort.signal)).rejects.toThrow('cancelled');
  expect(workers.instances).toHaveLength(1);
});

it('terminates a stuck decoder after the timeout', async () => {
  vi.useFakeTimers();
  const result = importAbr(new File(['x'], 'tips.abr'), new AbortController().signal);
  const rejection = expect(result).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(60_000);
  await rejection;
  expect(workers.instances[0]!.terminate).toHaveBeenCalledOnce();
});

it('reports parser and worker failures and terminates both decoders', async () => {
  const parsed = importAbr(new File(['x'], 'bad.abr'), new AbortController().signal);
  workers.instances[0]!.onmessage!({ data: { ok: false, error: 'Invalid header' } });
  await expect(parsed).rejects.toThrow('Invalid header');
  const crashed = importAbr(new File(['x'], 'bad.abr'), new AbortController().signal);
  workers.instances[1]!.onerror!({ message: 'Worker failed' });
  await expect(crashed).rejects.toThrow('Worker failed');
  for (const worker of workers.instances) expect(worker.terminate).toHaveBeenCalledOnce();
});
