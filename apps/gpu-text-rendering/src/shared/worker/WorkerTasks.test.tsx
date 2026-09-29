import { flush, onCleanup } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkerRequests } from './createWorkerRequests';
import { mountWorker } from './mountWorker';
import type { WorkerReply } from './workerProtocol';
import { WorkerTasks } from './WorkerTasks';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

it('runs queued tasks once with progress, transfers and per-task cleanup', async () => {
  const target = endpoint();
  const first = deferred();
  const events: string[] = [];
  const buffer = new ArrayBuffer(4);
  cleanups.push(
    mountWorker(() => {
      const request = createWorkerRequests<number, WorkerReply<number, string, number>>(target);
      return (
        <WorkerTasks
          request={request}
          execute={async (input, { progress }) => {
            events.push(`start ${input}`);
            onCleanup(() => events.push(`stop ${input}`));
            progress(input);
            if (input === 1) await first.promise;
            return { ok: true, value: input };
          }}
          error={String}
          transfer={() => [buffer]}
        />
      );
    })
  );
  target.send(1);
  target.send(2);
  await settle();
  expect(events).toEqual(['start 1']);
  first.resolve();
  await settle();
  expect(events).toEqual(['start 1', 'stop 1', 'start 2', 'stop 2']);
  expect(target.postMessage.mock.calls).toEqual([
    [{ progress: 1 }, { transfer: [] }],
    [{ ok: true, value: 1 }, { transfer: [buffer] }],
    [{ progress: 2 }, { transfer: [] }],
    [{ ok: true, value: 2 }, { transfer: [buffer] }]
  ]);
});

it.each(['throw', 'reject', 'result'] as const)('continues the queue after a %s failure', async (failure) => {
  const target = endpoint();
  cleanups.push(
    mountWorker(() => {
      const request = createWorkerRequests<number, WorkerReply<number, string>>(target);
      return (
        <WorkerTasks
          request={request}
          execute={(input) => {
            if (input === 1) {
              if (failure === 'throw') throw new Error('failed');
              if (failure === 'reject') return Promise.reject(new Error('failed'));
              return { ok: false, error: 'failed' };
            }
            return { ok: true, value: input };
          }}
          error={() => 'failed'}
        />
      );
    })
  );
  target.send(1);
  target.send(2);
  await settle();
  expect(target.postMessage.mock.calls.map(([value]) => value)).toEqual([
    { ok: false, error: 'failed' },
    { ok: true, value: 2 }
  ]);
});

it('aborts running tasks and suppresses late progress and replies on disposal', async () => {
  const target = endpoint();
  const pending = deferred();
  let signal!: AbortSignal;
  const execute = vi.fn(async (_input: number, context: { signal: AbortSignal; progress: (value: number) => void }) => {
    signal = context.signal;
    await pending.promise;
    context.progress(100);
    return { ok: true as const, value: 1 };
  });
  const dispose = mountWorker(() => {
    const request = createWorkerRequests<number, WorkerReply<number, string, number>>(target);
    return <WorkerTasks request={request} execute={execute} error={String} />;
  });
  cleanups.push(dispose);
  target.send(1);
  target.send(2);
  await settle();
  dispose();
  expect(signal.aborted).toBe(true);
  pending.resolve();
  await settle();
  expect(execute).toHaveBeenCalledOnce();
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
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  for (let i = 0; i < 50; i++) {
    flush();
    await Promise.resolve();
  }
}
