import { err, ok } from 'neverthrow';
import { abortedError } from '../errors';
import { openWorker } from './openWorker';
import type { WorkerReply, WorkerResult } from './workerProtocol';

/**
 * Runs one request in a fresh worker and resolves a typed result; it never rejects. Completion, failure or
 * cancellation through the signal closes the worker cooperatively, aborting its request before termination.
 * Calls run independently. An already aborted signal prevents worker creation.
 */
export function runWorkerRequest<Input, Output, Failure, Progress = never>(
  create: () => Worker,
  input: Input,
  options: WorkerRequestOptions<Progress>
): Promise<WorkerResult<Output, Failure>> {
  const { signal } = options;
  if (signal.aborted) {
    return Promise.resolve(err(abortedError()));
  }

  return new Promise((resolve) => {
    let settled = false;
    const opened = openWorker<Input, WorkerReply<Output, Failure, Progress>>(create, {
      message: ({ data: reply }) => {
        if ('progress' in reply) {
          options.onProgress?.(reply.progress);
        } else {
          settle(reply.ok ? ok(reply.value) : err(reply.error));
        }
      },
      error: (failure) => settle(err(failure))
    });
    if (opened.isErr()) {
      return resolve(err(opened.error));
    }

    const worker = opened.value;
    signal.addEventListener('abort', cancel);
    // The worker factory can synchronously cancel the request.
    if (signal.aborted) {
      return cancel();
    }

    const sent = worker.post(input, options.transfer);
    if (sent.isErr()) {
      settle(err(sent.error));
    }

    function cancel() {
      settle(err(abortedError()));
    }

    function settle(result: WorkerResult<Output, Failure>) {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', cancel);
      worker.close();
      resolve(result);
    }
  });
}

/** Cancellation, buffer ownership, and optional progress for a single request. */
export type WorkerRequestOptions<Progress = never> = {
  /** Required cancellation; an already aborted signal prevents worker creation. */
  signal: AbortSignal;
  /** Buffers to transfer rather than clone; ownership passes to the worker when posted. */
  transfer?: Transferable[];
  /** Receives intermediate messages without completing the request; must not throw. */
  onProgress?: (value: Progress) => void;
};
