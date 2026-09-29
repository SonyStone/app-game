import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkerTransport, workerShutdownGraceMs } from './createWorkerTransport';
import { workerShutdown } from './workerProtocol';

afterEach(() => {
  vi.useRealTimers();
});

it('sends repeated messages with transfers and detaches callbacks before shutdown', () => {
  vi.useFakeTimers();
  const native = Object.assign(new EventTarget(), { postMessage: vi.fn(), terminate: vi.fn() });
  const message = vi.fn();
  const error = vi.fn();
  const transport = createWorkerTransport<ArrayBuffer, number>(() => native as unknown as Worker, {
    message,
    error
  })._unsafeUnwrap();
  const data = new ArrayBuffer(8);
  transport.post(data, (data) => [data]);
  transport.post(data, (data) => [data]);
  expect(native.postMessage.mock.calls).toEqual([
    [data, [data]],
    [data, [data]]
  ]);
  native.dispatchEvent(new MessageEvent('message', { data: 42 }));
  expect(message).toHaveBeenCalledOnce();
  native.postMessage.mockImplementationOnce(() => {
    native.dispatchEvent(new MessageEvent('message', { data: 43 }));
  });
  transport.destroy();
  transport.destroy();
  transport.post(data);
  expect(native.postMessage).toHaveBeenCalledTimes(3);
  expect(native.postMessage).toHaveBeenLastCalledWith(workerShutdown);
  expect(message).toHaveBeenCalledOnce();
  expect(native.terminate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(workerShutdownGraceMs);
  expect(native.terminate).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
});

it('removes listeners and shuts down with its Solid owner', () => {
  vi.useFakeTimers();
  const native = Object.assign(new EventTarget(), { postMessage: vi.fn(), terminate: vi.fn() });
  const message = vi.fn();
  const session = createRoot((dispose) => ({
    dispose,
    transport: createWorkerTransport(() => native as unknown as Worker, { message, error: vi.fn() })._unsafeUnwrap()
  }));
  session.dispose();
  native.dispatchEvent(new MessageEvent('message', { data: 42 }));
  session.transport.post(1);
  session.transport.destroy();
  expect(message).not.toHaveBeenCalled();
  expect(native.postMessage.mock.calls).toEqual([[workerShutdown]]);
  vi.advanceTimersByTime(workerShutdownGraceMs);
  expect(native.terminate).toHaveBeenCalledOnce();
});

it('terminates at once when the shutdown message cannot be sent', () => {
  const native = Object.assign(new EventTarget(), {
    postMessage: vi.fn(() => {
      throw new Error('Worker closed');
    }),
    terminate: vi.fn()
  });
  const transport = createWorkerTransport(() => native as unknown as Worker, {
    message: vi.fn(),
    error: vi.fn()
  })._unsafeUnwrap();
  transport.destroy();
  expect(native.terminate).toHaveBeenCalledOnce();
});

it('returns send failures and reports runtime and deserialization failures', () => {
  const cause = new Error('Cannot clone payload');
  const native = Object.assign(new EventTarget(), {
    postMessage: vi.fn(() => {
      throw cause;
    }),
    terminate: vi.fn()
  });
  const error = vi.fn();
  const transport = createWorkerTransport<number, number>(() => native as unknown as Worker, {
    message: vi.fn(),
    error
  })._unsafeUnwrap();
  try {
    expect(transport.post(1)._unsafeUnwrapErr()).toEqual({ kind: 'post', cause });
    const runtime = new ErrorEvent('error', { message: 'Worker failed', cancelable: true });
    native.dispatchEvent(runtime);
    expect(runtime.defaultPrevented).toBe(true);
    expect(error).toHaveBeenLastCalledWith({ kind: 'error', cause: runtime });
    const invalid = new MessageEvent('messageerror');
    native.dispatchEvent(invalid);
    expect(error).toHaveBeenLastCalledWith({ kind: 'messageerror', cause: invalid });
  } finally {
    transport.destroy();
  }
});
