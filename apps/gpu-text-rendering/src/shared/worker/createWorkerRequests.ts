import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, flush, onCleanup } from 'solid-js';
import { isWorkerShutdown } from './workerProtocol';

/**
 * Queues messages from a fixed endpoint and exposes the active request under the current Solid owner.
 * Render the accessor with a keyed Show to give each request its own scope.
 * reply clears the accessor and flushes cleanup before advancing the FIFO queue; post keeps it active.
 * Owner disposal removes the listener, aborts the active request and drops queued messages.
 * Shutdown control messages are left to mountWorker, which disposes this owner.
 */
export function createWorkerRequests<Request, Reply>(
  target: EventTarget & { postMessage(message: Reply, options: { transfer: Transferable[] }): void }
) {
  const [active, setActive] = createSignal<WorkerRequest<Request, Reply>>();
  const queue: Request[] = [];
  let busy = false;
  let disposed = false;
  let cancel: (() => void) | undefined;

  makeEventListener<{ message: MessageEvent<Request> }>(target, 'message', (event) => {
    if (isWorkerShutdown(event.data)) {
      return;
    }
    queue.push(event.data);
    next();
  });
  onCleanup(() => {
    disposed = true;
    cancel?.();
    queue.length = 0;
  });

  return active;

  function next() {
    if (disposed || busy || !queue.length) {
      return;
    }
    busy = true;
    const data = queue.shift()!;
    let completed = false;
    const abort = new AbortController();
    cancel = () => abort.abort();
    setActive({
      data,
      signal: abort.signal,
      post(message, transfer = []) {
        if (!disposed && !completed) {
          target.postMessage(message, { transfer });
        }
      },
      reply(message, transfer = []) {
        if (disposed || completed) {
          return;
        }
        target.postMessage(message, { transfer });
        completed = true;
        abort.abort();
        // reply can run synchronously inside the request scope's own render callback or Errored fallback.
        // Replacing the keyed scope from there would dispose it mid-mount, so defer to a microtask.
        queueMicrotask(() => {
          if (disposed) {
            return;
          }
          setActive(undefined);
          // Signal writes are batched; flush commits the old scope's disposal (and its cleanups)
          // before the next request can acquire resources such as a decoder heap.
          flush();
          busy = false;
          next();
        });
      }
    });
  }
}

/** A message and its reply lifetime; post/reply become inert after completion or owner disposal. */
export type WorkerRequest<Request, Reply> = {
  data: Request;
  signal: AbortSignal;
  /** Emits progress or another intermediate message without advancing the queue. */
  post: (message: Reply, transfer?: Transferable[]) => void;
  /** Sends the terminal reply once and advances the queue. */
  reply: (message: Reply, transfer?: Transferable[]) => void;
};
