import { err } from 'neverthrow';
import { checkAborted, documentError } from '../../../shared/errors';
import { documentFileLimitMessage, maxDocumentFileBytes } from '../limits';
import { runDocumentWorker } from '../runDocumentWorker';

/** Consumes PDF bytes locally in a disposable WASM Worker. Cancellation releases its entire heap. */
export function convertPdf(bytes: ArrayBuffer, signal?: AbortSignal) {
  const active = checkAborted(signal);

  if (active.isErr()) {
    return Promise.resolve(err(active.error));
  }

  if (bytes.byteLength > maxDocumentFileBytes) {
    return Promise.resolve(err(documentError('document-limit', documentFileLimitMessage)));
  }

  return runDocumentWorker<ArrayBuffer>(
    () => new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' }),
    bytes,
    signal
  );
}
