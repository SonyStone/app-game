import type { Result } from 'neverthrow';
import type { AbortedError } from '../errors';

/** A completed request, including domain errors, native worker failures, and cancellation. */
export type WorkerResult<Output, Failure> = Result<Output, Failure | WorkerFailure | WorkerCancelled>;

/** Wire protocol shared by request clients and worker handlers. Progress never completes a request. */
export type WorkerReply<Output, Failure, Progress = never> =
  | { ok: true; value: Output }
  | { ok: false; error: Failure }
  | { progress: Progress };

/** Terminal value type declared by a reply protocol. */
export type ReplyOutput<Reply> = Reply extends { ok: true; value: infer Output } ? Output : never;

/** Expected failure type declared by a reply protocol. */
export type ReplyFailure<Reply> = Reply extends { ok: false; error: infer Failure } ? Failure : never;

/** Progress type declared by a reply protocol; never when the worker reports no progress. */
export type ReplyProgress<Reply> = Reply extends { progress: infer Progress } ? Progress : never;

/** Identifies a native transport failure independently of application-level errors. */
export type WorkerFailure =
  | { kind: 'create' | 'post'; cause: unknown }
  | { kind: 'error'; cause: ErrorEvent }
  | { kind: 'messageerror'; cause: MessageEvent };

/** Cancellation settles requests normally, rather than rejecting their promises. */
export type WorkerCancelled = AbortedError;

/**
 * Control message sent by the main thread instead of a request. The worker disposes its Solid root, which aborts the
 * active request and runs cleanups, then closes itself. Request payloads must not use the `workerShutdown` key.
 */
export const workerShutdown = { workerShutdown: true } as const;

/** Distinguishes the shutdown control message from request payloads on the shared message channel. */
export function isWorkerShutdown(data: unknown): data is typeof workerShutdown {
  return typeof data === 'object' && data !== null && (data as Partial<typeof workerShutdown>).workerShutdown === true;
}
