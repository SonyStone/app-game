import { err, ok, Result } from 'neverthrow';
import { workerShutdown, type WorkerFailure } from './workerProtocol';

/**
 * Starts a worker and attaches its handlers. Plain imperative code: the caller must close() it.
 * close() removes the handlers at once and asks the worker to shut down cooperatively, so its Solid cleanups run
 * and its active request is aborted; terminate() follows after a short grace period for busy workers.
 */
export function openWorker<Input, Reply>(create: () => Worker, handlers: WorkerHandlers<Reply>) {
  const started = Result.fromThrowable(create, (cause): WorkerFailure => ({ kind: 'create', cause }))();
  if (started.isErr()) {
    return err(started.error);
  }

  const worker = started.value;
  const listeners = new AbortController();
  const { signal } = listeners;
  worker.addEventListener('message', handlers.message, { signal });
  worker.addEventListener(
    'error',
    (cause) => {
      cause.preventDefault();
      handlers.error({ kind: 'error', cause });
    },
    { signal }
  );
  worker.addEventListener('messageerror', (cause) => handlers.error({ kind: 'messageerror', cause }), { signal });

  return ok({
    /** Posts one message, transferring the listed buffers. Posting after close() is ignored. */
    post(input: Input, transfer: Transferable[] = []): Result<void, WorkerFailure> {
      if (signal.aborted) {
        return ok();
      }
      return Result.fromThrowable(
        () => worker.postMessage(input, transfer),
        (cause): WorkerFailure => ({ kind: 'post', cause })
      )();
    },
    /** Removes the handlers and shuts the worker down. Repeated calls are ignored. */
    close() {
      if (signal.aborted) {
        return;
      }
      listeners.abort();
      shutdown(worker);
    }
  });
}

/** Messages and failures reported by an open worker. Callbacks must not throw. */
type WorkerHandlers<Reply> = {
  message: (event: MessageEvent<Reply>) => void;
  error: (failure: WorkerFailure) => void;
};

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
