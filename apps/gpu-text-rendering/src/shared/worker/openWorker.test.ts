import { afterEach, expect, it, vi } from 'vitest';
import { openWorker, workerShutdownGraceMs } from './openWorker';
import { workerShutdown } from './workerProtocol';

afterEach(() => {
  vi.useRealTimers();
});

it('sends repeated messages with transfers and detaches handlers before shutdown', () => {
  vi.useFakeTimers();
  const native = fake();
  const message = vi.fn();
  const error = vi.fn();
  const worker = openWorker<ArrayBuffer, number>(() => native, { message, error })._unsafeUnwrap();
  const data = new ArrayBuffer(8);
  worker.post(data, [data]);
  worker.post(data, [data]);
  expect(native.postMessage.mock.calls).toEqual([
    [data, [data]],
    [data, [data]]
  ]);
  native.dispatchEvent(new MessageEvent('message', { data: 42 }));
  expect(message).toHaveBeenCalledOnce();
  native.postMessage.mockImplementationOnce(() => {
    native.dispatchEvent(new MessageEvent('message', { data: 43 }));
  });
  worker.close();
  worker.close();
  worker.post(data);
  expect(native.postMessage).toHaveBeenCalledTimes(3);
  expect(native.postMessage).toHaveBeenLastCalledWith(workerShutdown);
  expect(message).toHaveBeenCalledOnce();
  expect(native.terminate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(workerShutdownGraceMs);
  expect(native.terminate).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
});

it('terminates at once when the shutdown message cannot be sent', () => {
  const native = fake();
  native.postMessage.mockImplementation(() => {
    throw new Error('Worker closed');
  });
  openWorker(() => native, { message: vi.fn(), error: vi.fn() })
    ._unsafeUnwrap()
    .close();
  expect(native.terminate).toHaveBeenCalledOnce();
});

it('returns creation and send failures and reports runtime and deserialization failures', () => {
  const blocked = new Error('Blocked');
  const failed = openWorker(
    () => {
      throw blocked;
    },
    { message: vi.fn(), error: vi.fn() }
  );
  expect(failed._unsafeUnwrapErr()).toEqual({ kind: 'create', cause: blocked });

  const cause = new Error('Cannot clone payload');
  const native = fake();
  native.postMessage.mockImplementation(() => {
    throw cause;
  });
  const error = vi.fn();
  const worker = openWorker<number, number>(() => native, { message: vi.fn(), error })._unsafeUnwrap();
  try {
    expect(worker.post(1)._unsafeUnwrapErr()).toEqual({ kind: 'post', cause });
    const runtime = new ErrorEvent('error', { message: 'Worker failed', cancelable: true });
    native.dispatchEvent(runtime);
    expect(runtime.defaultPrevented).toBe(true);
    expect(error).toHaveBeenLastCalledWith({ kind: 'error', cause: runtime });
    const invalid = new MessageEvent('messageerror');
    native.dispatchEvent(invalid);
    expect(error).toHaveBeenLastCalledWith({ kind: 'messageerror', cause: invalid });
  } finally {
    worker.close();
  }
});

function fake() {
  return Object.assign(new EventTarget() as Worker, {
    postMessage: vi.fn<(message: unknown, transfer?: Transferable[]) => void>(),
    terminate: vi.fn()
  });
}
