import type { Result } from 'neverthrow';
import { documentError, errorMessage, type AbortedError, type DocumentError } from '../../shared/errors';
import type { WorkerFailure, WorkerReply } from '../../shared/worker/workerProtocol';

/** Converts transport failures while preserving document errors and owner cancellation. */
export function documentWorkerError(
  failure: WorkerFailure | DocumentError | AbortedError
): DocumentError | AbortedError {
  switch (failure.kind) {
    case 'document':
    case 'aborted':
      return failure;
    case 'create':
      return documentError('load', `Unable to start document worker: ${errorMessage(failure.cause)}`, failure.cause);
    case 'post':
      return documentError('load', errorMessage(failure.cause), failure.cause);
    case 'error':
      return documentError('decode', failure.cause.message || 'Document worker failed');
    case 'messageerror':
      return documentError('decode', 'Unable to transfer document data');
  }
}

/**
 * Adapts a worker-side result to its reply envelope. Errors keep only their kind, code and message:
 * an external `cause` (for example a WASM exception) may not survive structured cloning.
 */
export function documentReply<T>(
  result: Result<T, DocumentError>
): Exclude<WorkerReply<T, DocumentError>, { progress: unknown }> {
  if (result.isErr()) {
    const { kind, code, message } = result.error;
    return { ok: false, error: { kind, code, message } };
  }

  return { ok: true, value: result.value };
}
