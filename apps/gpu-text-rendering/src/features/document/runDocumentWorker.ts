import { err, ok, Result, type Result as WorkerResult } from 'neverthrow';
import { checkAborted, documentError, errorMessage, type AbortedError, type DocumentError } from '../../shared/errors';
import type { DocumentProgress, OnDocumentProgress } from './documentProgress';

/**
 * One transferred request per Worker, owned by the document session's AbortSignal.
 * No wall-clock deadline: large documents may legitimately take minutes on slower devices.
 * Completion, failure and cancellation terminate the Worker and remove lifetime listeners.
 */
export async function runDocumentWorker<T>(
  create: () => Worker,
  source: unknown,
  signal?: AbortSignal,
  onProgress?: OnDocumentProgress
): Promise<WorkerResult<T, DocumentError | AbortedError>> {
  const active = checkAborted(signal);

  if (active.isErr()) {
    return err(active.error);
  }

  const created = Result.fromThrowable(create, (cause) =>
    documentError('load', `Unable to start document worker: ${errorMessage(cause)}`, cause)
  )();

  if (created.isErr()) {
    return err(created.error);
  }

  const worker = created.value;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: WorkerResult<T, DocumentError | AbortedError>) => {
      if (settled) {
        return;
      }

      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      resolve(result);
    };

    const abort = () => finish(err({ kind: 'aborted', message: 'Operation cancelled' }));

    worker.onmessage = (
      event: MessageEvent<{ ok: true; value: T } | { ok: false; error: DocumentError } | { progress: DocumentProgress }>
    ) => {
      if (settled) return;
      if ('progress' in event.data) {
        onProgress?.(event.data.progress);
        return;
      }
      finish(event.data.ok ? ok(event.data.value) : err(event.data.error));
    };

    worker.onerror = (event) => {
      event.preventDefault();
      finish(err(documentError('decode', event.message || 'Document worker failed')));
    };

    worker.onmessageerror = () => finish(err(documentError('decode', 'Unable to transfer document data')));
    signal?.addEventListener('abort', abort, { once: true });

    const sent = Result.fromThrowable(
      () => worker.postMessage(source, source instanceof ArrayBuffer ? [source] : []),
      (cause) => documentError('load', errorMessage(cause), cause)
    )();

    if (sent.isErr()) {
      finish(err(sent.error));
    }
  });
}
