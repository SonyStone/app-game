import { makeEventListenerStack, preventDefault } from '@solid-primitives/event-listener';
import { createSubRoot } from '@solid-primitives/rootless';
import { err, ok, Result } from 'neverthrow';
import { getOwner, isDisposed, onCleanup, untrack } from 'solid-js';
import type { ResultValue } from '../errors';
import { workerShutdown, type WorkerFailure } from './workerProtocol';

/**
 * Owns a worker and its listeners in a disposable Solid scope. Parent disposal also closes it.
 * When called without an owner, the caller must destroy the transport.
 * Closing removes listeners at once and asks the worker to shut down cooperatively, so its Solid cleanups run
 * and its active request is aborted; terminate() follows after a short grace period for busy workers.
 */
export function createWorkerTransport<Input, Reply>(create: () => Worker, handlers: WorkerHandlers<Reply>) {
  const startWorker = Result.fromThrowable(
    () => untrack(create),
    (cause): WorkerFailure => ({ kind: 'create', cause })
  );
  const started = startWorker();
  if (started.isErr()) {
    return err(started.error);
  }

  const worker = started.value;
  return createSubRoot((dispose) => {
    const owner = getOwner()!;
    const [listen] = makeEventListenerStack<WorkerEvents<Reply>>(worker);
    onCleanup(() => shutdown(worker));

    listen('message', handlers.message);
    listen('error', preventDefault(reportError));
    listen('messageerror', reportMessageError);

    return ok({
      post,
      /** Removes listeners and shuts the worker down. Repeated disposal is safe. */
      destroy: dispose
    });

    /** Computes transfers at send time; sends after disposal are ignored. */
    function post(input: Input, transfer: (input: Input) => Transferable[] = () => []) {
      if (isDisposed(owner)) {
        return ok();
      }
      const sendMessage = Result.fromThrowable(
        () => worker.postMessage(input, transfer(input)),
        (cause): WorkerFailure => ({ kind: 'post', cause })
      );
      return sendMessage();
    }

    function reportError(cause: ErrorEvent) {
      handlers.error({ kind: 'error', cause });
    }

    function reportMessageError(cause: MessageEvent) {
      handlers.error({ kind: 'messageerror', cause });
    }
  });
}

/** A live transport returned by createWorkerTransport. */
export type WorkerTransport<Input, Reply> = ResultValue<ReturnType<typeof createWorkerTransport<Input, Reply>>>;

/** Milliseconds a worker may take to run its cleanups before it is terminated. */
export const workerShutdownGraceMs = 1_000;

/**
 * Requests cooperative shutdown. A worker busy in synchronous work (for example WASM decoding) cannot read the
 * message, so terminate() is the fallback; terminating an already closed worker is harmless.
 */
function shutdown(worker: Worker) {
  try {
    worker.postMessage(workerShutdown);
  } catch {
    worker.terminate();
    return;
  }
  setTimeout(() => worker.terminate(), workerShutdownGraceMs);
}

/** Messages and failures reported by a live transport. Callbacks must not throw. */
type WorkerHandlers<Reply> = {
  message: (event: MessageEvent<Reply>) => void;
  error: (failure: WorkerFailure) => void;
};

type WorkerEvents<Reply> = {
  message: MessageEvent<Reply>;
  error: ErrorEvent;
  messageerror: MessageEvent;
};
