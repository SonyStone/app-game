import { createMemo, createRenderEffect, Errored, flush, Loading, onCleanup, Show } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkerRequests } from './createWorkerRequests';
import { mountWorker } from './mountWorker';
import { workerShutdown } from './workerProtocol';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

it('retains same-batch messages and disposes each request before processing the next', async () => {
  const target = endpoint();
  const first = deferred<number>();
  const second = deferred<number>();
  const events: string[] = [];
  const buffer = new ArrayBuffer(4);
  cleanups.push(
    mountWorker(() => {
      const request = createWorkerRequests<number, unknown>(target);
      return (
        <Show when={request()} keyed>
          {(request) => {
            events.push(`start ${request.data}`);
            onCleanup(() => events.push(`stop ${request.data}`));
            return (
              <Loading>
                {(() => {
                  const value = createMemo(() => (request.data === 1 ? first.promise : second.promise));
                  createRenderEffect(value, (value) => {
                    request.post({ progress: value });
                    request.reply(value, [buffer]);
                    request.reply('duplicate');
                    request.post('late');
                  });
                  return null;
                })()}
              </Loading>
            );
          }}
        </Show>
      );
    })
  );
  target.send(1);
  target.send(2);
  await settle();
  expect(events).toEqual(['start 1']);
  first.resolve(10);
  await settle();
  expect(events).toEqual(['start 1', 'stop 1', 'start 2']);
  expect(target.postMessage.mock.calls).toEqual([
    [{ progress: 10 }, { transfer: [] }],
    [10, { transfer: [buffer] }]
  ]);
  second.resolve(20);
  await settle();
  expect(events).toEqual(['start 1', 'stop 1', 'start 2', 'stop 2']);
  expect(target.postMessage).toHaveBeenCalledTimes(4);
});

it('aborts active work, drops queued messages and ignores late replies after disposal', async () => {
  const target = endpoint();
  const pending = deferred<number>();
  let signal: AbortSignal | undefined;
  const run = vi.fn((value: AbortSignal) => {
    signal = value;
    return pending.promise;
  });
  const dispose = mountWorker(() => {
    const request = createWorkerRequests<number, unknown>(target);
    return (
      <Show when={request()} keyed>
        {(request) => (
          <Loading>
            {(() => {
              const result = createMemo(() => run(request.signal));
              createRenderEffect(result, (value) => request.reply(value));
              return null;
            })()}
          </Loading>
        )}
      </Show>
    );
  });
  cleanups.push(dispose);
  target.send(1);
  target.send(2);
  await settle();
  dispose();
  expect(signal?.aborted).toBe(true);
  pending.resolve(10);
  target.send(3);
  await settle();
  expect(run).toHaveBeenCalledOnce();
  expect(target.postMessage).not.toHaveBeenCalled();
});

it.each([false, true])('continues after a failed computation, async = %s', async (asynchronous) => {
  const target = endpoint();
  cleanups.push(
    mountWorker(() => {
      const request = createWorkerRequests<number, unknown>(target);
      return (
        <Show when={request()} keyed>
          {(request) => (
            <Errored
              fallback={() => {
                request.reply('error');
                return null;
              }}
            >
              <Loading>
                {(() => {
                  const result = createMemo(() => {
                    if (request.data === 1) {
                      if (asynchronous) return Promise.reject(new Error('failed'));
                      throw new Error('failed');
                    }
                    return request.data;
                  });
                  createRenderEffect(result, (value) => request.reply(value));
                  return null;
                })()}
              </Loading>
            </Errored>
          )}
        </Show>
      );
    })
  );
  target.send(1);
  target.send(2);
  await settle();
  expect(target.postMessage.mock.calls.map(([value]) => value)).toEqual(['error', 2]);
});

it('shuts down on request: aborts active work, runs cleanups, then closes the worker', async () => {
  const target = Object.assign(endpoint(), { close: vi.fn() });
  const events: string[] = [];
  let signal: AbortSignal | undefined;
  mountWorker(() => {
    const request = createWorkerRequests<number, unknown>(target);
    onCleanup(() => events.push('worker cleanup'));
    return (
      <Show when={request()} keyed>
        {(request) => {
          signal = request.signal;
          onCleanup(() => events.push(`stop ${request.data}`));
          return null;
        }}
      </Show>
    );
  }, target);
  target.send(1);
  await settle();
  target.close.mockImplementation(() => events.push('close'));
  target.dispatchEvent(new MessageEvent('message', { data: workerShutdown }));
  expect(signal?.aborted).toBe(true);
  expect(events).toEqual(['stop 1', 'worker cleanup', 'close']);
  target.send(2);
  await settle();
  expect(events).toHaveLength(3);
  expect(target.postMessage).not.toHaveBeenCalled();
});

function endpoint() {
  return Object.assign(new EventTarget(), {
    postMessage: vi.fn<(message: unknown, options: { transfer: Transferable[] }) => void>(),
    send(this: EventTarget, data: number) {
      this.dispatchEvent(new MessageEvent('message', { data }));
    }
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  for (let i = 0; i < 30; i++) {
    flush();
    await Promise.resolve();
  }
  flush();
}
