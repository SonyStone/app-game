import { documentError, errorMessage, type AbortedError, type DocumentError } from '../../shared/errors';
import type { WorkerFailure } from '../../shared/worker/workerProtocol';

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
