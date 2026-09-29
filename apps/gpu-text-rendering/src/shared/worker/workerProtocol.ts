import type { Result } from 'neverthrow';

/** A completed request, including domain errors, native worker failures, and cancellation. */
export type WorkerResult<Output, Failure> = Result<Output, Failure | WorkerFailure | WorkerCancelled>;

/** Wire protocol shared by request clients and worker handlers. Progress never completes a request. */
export type WorkerReply<Output, Failure, Progress = never> =
  | { ok: true; value: Output }
  | { ok: false; error: Failure }
  | { progress: Progress };

/** Identifies a native transport failure independently of application-level errors. */
export type WorkerFailure =
  | { kind: 'create' | 'post'; cause: unknown }
  | { kind: 'error'; cause: ErrorEvent }
  | { kind: 'messageerror'; cause: MessageEvent };

/** Cancellation settles requests normally, rather than rejecting their promises. */
export type WorkerCancelled = { kind: 'aborted'; message: string };
