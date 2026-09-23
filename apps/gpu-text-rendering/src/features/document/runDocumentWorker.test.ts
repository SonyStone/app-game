import { expect, it, vi } from 'vitest';
import { runDocumentWorker } from './runDocumentWorker';

it('keeps the worker alive for progress, aborts it and ignores late messages', async () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: undefined };
  const abort = new AbortController();
  const progress = vi.fn();
  const result = runDocumentWorker(() => worker as unknown as Worker, new ArrayBuffer(0), abort.signal, progress);
  const send = (data: unknown) => (worker as unknown as Worker).onmessage!(new MessageEvent('message', { data }));
  send({ progress: { stage: 'processingPages', completed: 1, total: 5 } });
  expect(progress).toHaveBeenCalledWith({ stage: 'processingPages', completed: 1, total: 5 });
  expect(worker.terminate).not.toHaveBeenCalled();
  abort.abort();
  expect((await result)._unsafeUnwrapErr().kind).toBe('aborted');
  send({ progress: { stage: 'processingPages', completed: 2, total: 5 } });
  send({ ok: true, value: {} });
  expect(progress).toHaveBeenCalledTimes(1);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('resolves the document only after the terminal reply', async () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
  const result = runDocumentWorker(() => worker, 'demo.gdoc');
  worker.onmessage!(new MessageEvent('message', { data: { progress: { stage: 'decodingDocument' } } }));
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.onmessage!(new MessageEvent('message', { data: { ok: true, value: 42 } }));
  expect((await result)._unsafeUnwrap()).toBe(42);
  expect(worker.terminate).toHaveBeenCalledOnce();
});
