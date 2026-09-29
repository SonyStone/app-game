import { createRoot } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { runWorkerRequest } from './runWorkerRequest';

it('transfers input, forwards progress, and terminates before returning its result', async () => {
  const worker = native();
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const progress = vi.fn();
  const bytes = new ArrayBuffer(8);
  const result = runWorkerRequest<ArrayBuffer, number, string, number>(() => worker, bytes, {
    signal: controller.signal,
    transfer: [bytes],
    onProgress: progress
  });
  expect(worker.postMessage).toHaveBeenCalledWith(bytes, [bytes]);
  worker.dispatchEvent(new MessageEvent('message', { data: { progress: 50 } }));
  expect(progress).toHaveBeenCalledWith(50);
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: 10 } }));
  expect((await result)._unsafeUnwrap()).toBe(10);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
  worker.dispatchEvent(new MessageEvent('message', { data: { progress: 100 } }));
  controller.abort();
  expect(progress).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('runs simultaneous calls independently without a queue or shared cancellation', async () => {
  const first = native();
  const second = native();
  const abort = new AbortController();
  const pending = runWorkerRequest(() => first, 1, { signal: abort.signal });
  const other = runWorkerRequest(() => second, 2, { signal: new AbortController().signal });
  expect(first.postMessage).toHaveBeenCalledWith(1, []);
  expect(second.postMessage).toHaveBeenCalledWith(2, []);
  abort.abort();
  expect(first.terminate).toHaveBeenCalledOnce();
  expect((await pending)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  first.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: 99 } }));
  second.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: 20 } }));
  expect((await other)._unsafeUnwrap()).toBe(20);
  expect(second.terminate).toHaveBeenCalledOnce();
});

it('settles cancellation and releases the worker when its Solid owner is disposed', async () => {
  const worker = native();
  const signal = new AbortController().signal;
  const session = createRoot((dispose) => ({
    dispose,
    pending: runWorkerRequest(() => worker, 1, { signal })
  }));
  session.dispose();
  expect(signal.aborted).toBe(false);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect((await session.pending)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
});

it('does not create a worker for an already aborted signal', async () => {
  const create = vi.fn(() => native());
  const result = await runWorkerRequest(create, 1, { signal: AbortSignal.abort() });
  expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(create).not.toHaveBeenCalled();
});

it('terminates without posting if cancellation happens during creation', async () => {
  const controller = new AbortController();
  const worker = native();
  const result = await runWorkerRequest(
    () => {
      controller.abort();
      return worker;
    },
    1,
    { signal: controller.signal }
  );
  expect(result._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('returns domain failures and permits a fresh request with the same signal', async () => {
  const signal = new AbortController().signal;
  const worker = native();
  const result = runWorkerRequest(() => worker, 1, { signal });
  worker.dispatchEvent(new MessageEvent('message', { data: { ok: false, error: 'broken' } }));
  expect((await result)._unsafeUnwrapErr()).toBe('broken');
  expect(worker.terminate).toHaveBeenCalledOnce();
  const retry = native();
  const retried = runWorkerRequest(() => retry, 2, { signal });
  retry.dispatchEvent(new MessageEvent('message', { data: { ok: true, value: 20 } }));
  expect((await retried)._unsafeUnwrap()).toBe(20);
});

it.each(['create', 'post', 'error', 'messageerror'] as const)(
  'settles transport failure %s and releases its worker and abort listener',
  async (kind) => {
    const worker = native();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    worker.postMessage.mockImplementation(() => {
      if (kind === 'post') throw new Error('clone');
    });
    const pending = runWorkerRequest(
      () => {
        if (kind === 'create') throw new Error('blocked');
        return worker;
      },
      1,
      { signal: controller.signal }
    );
    if (kind === 'error') worker.dispatchEvent(new ErrorEvent('error', { message: 'failed', cancelable: true }));
    if (kind === 'messageerror') worker.dispatchEvent(new MessageEvent('messageerror'));
    expect((await pending)._unsafeUnwrapErr()).toMatchObject({ kind });
    if (kind !== 'create') {
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    }
  }
);

function native() {
  return Object.assign(new EventTarget() as Worker, {
    postMessage: vi.fn<(input: unknown, transfer: Transferable[]) => void>(),
    terminate: vi.fn()
  });
}
