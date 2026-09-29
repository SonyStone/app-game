import { makeEventListener } from '@solid-primitives/event-listener';
import { createSubRoot } from '@solid-primitives/rootless';
import { err, ok } from 'neverthrow';
import { onCleanup } from 'solid-js';
import { createWorkerTransport } from './createWorkerTransport';
import type {
  ReplyFailure,
  ReplyOutput,
  ReplyProgress,
  WorkerCancelled,
  WorkerReply,
  WorkerResult
} from './workerProtocol';

/**
 * Runs one request in a fresh worker. Completion, cancellation, or owner disposal closes the worker.
 * Cancellation shuts the worker down cooperatively, aborting its request signal before termination.
 * Calls run independently and resolve typed results. Outside a Solid owner, the signal owns cancellation.
 */
export function runWorkerRequest<Input, Output, Failure, Progress = never>(
  create: () => Worker,
  input: Input,
  options: WorkerRequestOptions<Progress>
): Promise<WorkerResult<Output, Failure>> {
  return new Promise((resolve) => {
    createSubRoot((dispose) => {
      onCleanup(() => resolve(err(cancelled())));
      if (options.signal.aborted) {
        return dispose();
      }

      const connection = createWorkerTransport<Input, WorkerReply<Output, Failure, Progress>>(create, {
        message: receive,
        error: (failure) => complete(err(failure))
      });
      if (connection.isErr()) {
        return complete(err(connection.error));
      }

      makeEventListener(options.signal, 'abort', dispose, { once: true });
      // The worker factory can synchronously cancel the request.
      if (options.signal.aborted) {
        return dispose();
      }

      const sent = connection.value.post(input, () => options.transfer ?? []);
      if (sent.isErr()) {
        complete(err(sent.error));
      }

      function receive({ data: reply }: MessageEvent<WorkerReply<Output, Failure, Progress>>) {
        if ('progress' in reply) {
          options.onProgress?.(reply.progress);
          return;
        }
        complete(reply.ok ? ok(reply.value) : err(reply.error));
      }

      function complete(result: WorkerResult<Output, Failure>) {
        // Publish before disposal's cancellation fallback. Promise observers run after cleanup.
        resolve(result);
        dispose();
      }
    });
  });
}

/** Cancellation, buffer ownership, and optional progress for a single request. */
export type WorkerRequestOptions<Progress = never> = {
  /** An already aborted signal prevents worker creation. */
  signal: AbortSignal;
  /** Buffers to transfer rather than clone; ownership passes to the worker when posted. */
  transfer?: Transferable[];
  /** Receives intermediate messages without completing the request; must not throw. */
  onProgress?: (value: Progress) => void;
};

/** A request with its worker factory and cancellation signal supplied by the caller. */
export type WorkerRequest<Input, Output, Failure> = (input: Input) => Promise<WorkerResult<Output, Failure>>;

/** A request typed by the input and reply protocol a worker declares, so protocol changes fail at call sites. */
export type ProtocolRequest<Input, Reply> = WorkerRequest<Input, ReplyOutput<Reply>, ReplyFailure<Reply>>;

/** runWorkerRequest instantiated from a worker's declared protocol instead of restated generics. */
export type RunProtocolRequest<Input, Reply> = typeof runWorkerRequest<
  Input,
  ReplyOutput<Reply>,
  ReplyFailure<Reply>,
  ReplyProgress<Reply>
>;

function cancelled(): WorkerCancelled {
  return { kind: 'aborted', message: 'Operation cancelled' };
}
