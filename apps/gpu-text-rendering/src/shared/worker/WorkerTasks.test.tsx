import { err, ok } from 'neverthrow';
import { flush, onCleanup } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { mountWorker } from './mountWorker';
import type { WorkerReply } from './workerProtocol';
import { workerShutdown } from './workerProtocol';
import { WorkerTasks } from './WorkerTasks';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

type Reply = WorkerReply<number, string, number>;

it('runs requests one at a time with progress, transfers, and cleanup before the next starts', async () => {
  const target = endpoint();
  const first = deferred();
  const events: string[] = [];
  const buffer = new ArrayBuffer(4);
  cleanups.push(
    mountWorker(
      () => (
        <WorkerTasks<number, Reply>
          endpoint={target}
          execute={async (input, { progress }) => {
            events.push(`start ${input}`);
            onCleanup(() => events.push(`stop ${input}`));
            progress(input);
            if (input === 1) await first.promise;
            return ok(input);
          }}
          error={String}
          transfer={() => [buffer]}
        />
      ),
      target
    )
  );
  target.send(1);
  await settle();
  expect(events).toEqual(['start 1']);
  first.resolve();
  await settle();
  target.send(2);
  await settle();
  expect(events).toEqual(['start 1', 'stop 1', 'start 2', 'stop 2']);
  expect(target.postMessage.mock.calls).toEqual([
    [{ progress: 1 }, { transfer: [] }],
    [{ ok: true, value: 1 }, { transfer: [buffer] }],
    [{ progress: 2 }, { transfer: [] }],
    [{ ok: true, value: 2 }, { transfer: [buffer] }]
  ]);
});

it('refuses a request that arrives while another is active instead of queueing it', async () => {
  const target = endpoint();
  const first = deferred();
  const execute = vi.fn(async (input: number) => {
    await first.promise;
    return ok(input);
  });
  cleanups.push(
    mountWorker(
      () => <WorkerTasks<number, Reply> endpoint={target} execute={execute} error={(cause) => String(cause)} />,
      target
    )
  );
  target.send(1);
  target.send(2);
  await settle();
  expect(target.postMessage.mock.calls.map(([value]) => value)).toEqual([
    { ok: false, error: 'Error: The worker is busy with another request' }
  ]);
  first.resolve();
  await settle();
  expect(execute).toHaveBeenCalledOnce();
  expect(target.postMessage).toHaveBeenLastCalledWith({ ok: true, value: 1 }, { transfer: [] });
});

it.each(['throw', 'reject', 'result'] as const)(
  'replies once to a %s failure and serves the next request',
  async (failure) => {
    const target = endpoint();
    cleanups.push(
      mountWorker(
        () => (
          <WorkerTasks<number, Reply>
            endpoint={target}
            execute={(input) => {
              if (input === 1) {
                if (failure === 'throw') throw new Error('failed');
                if (failure === 'reject') return Promise.reject(new Error('failed'));
                return err('failed');
              }
              return ok(input);
            }}
            error={() => 'failed'}
          />
        ),
        target
      )
    );
    target.send(1);
    await settle();
    target.send(2);
    await settle();
    expect(target.postMessage.mock.calls.map(([value]) => value)).toEqual([
      { ok: false, error: 'failed' },
      { ok: true, value: 2 }
    ]);
  }
);

it('shuts down on request: aborts active work, runs cleanups, closes, and drops late messages', async () => {
  const target = endpoint();
  const events: string[] = [];
  const pending = deferred();
  let signal!: AbortSignal;
  const execute = vi.fn(async (input: number, context: { signal: AbortSignal; progress: (value: number) => void }) => {
    signal = context.signal;
    onCleanup(() => events.push(`stop ${input}`));
    await pending.promise;
    context.progress(100);
    return ok(input);
  });
  mountWorker(() => {
    onCleanup(() => events.push('worker cleanup'));
    return <WorkerTasks<number, Reply> endpoint={target} execute={execute} error={String} />;
  }, target);
  target.send(1);
  await settle();
  target.close.mockImplementation(() => events.push('close'));
  target.dispatchEvent(new MessageEvent('message', { data: workerShutdown }));
  expect(signal.aborted).toBe(true);
  expect(events).toEqual(['stop 1', 'worker cleanup', 'close']);
  pending.resolve();
  target.send(2);
  await settle();
  expect(execute).toHaveBeenCalledOnce();
  expect(events).toHaveLength(3);
  expect(target.postMessage).not.toHaveBeenCalled();
});

function endpoint() {
  return Object.assign(new EventTarget(), {
    postMessage: vi.fn<(message: unknown, options: { transfer: Transferable[] }) => void>(),
    close: vi.fn(),
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
