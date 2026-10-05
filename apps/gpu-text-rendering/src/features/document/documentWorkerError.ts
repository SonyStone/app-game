import { errorMessage, type AbortedError } from '@app-game/solid-gpu/errors';
import type { WorkerFailure } from '@app-game/solid-gpu/worker';
import { documentError, type DocumentError } from '../../shared/errors';

/** Converts transport failures while preserving document errors and cancellation. */
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
 * Keeps only a worker-side error's kind, code and message for its reply:
 * an external `cause` (for example a WASM exception) may not survive structured cloning.
 */
export function cloneableDocumentError({ kind, code, message }: DocumentError): DocumentError {
  return { kind, code, message };
}
