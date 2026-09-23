import { err, type Result as ReadResult } from 'neverthrow';
import { checkAborted, documentError, type AbortedError, type DocumentError } from '../../../shared/errors';
import { documentFileLimitMessage, maxDocumentFileBytes } from '../limits';
import { runDocumentWorker } from '../runDocumentWorker';
import type { DecodedDocument } from './types';

/**
 * Loads a URL or consumes an ArrayBuffer in a dedicated module Worker.
 * Transferring a supplied buffer detaches it from the caller. Completion and
 * cancellation terminate the Worker, including its WASM heap and pending fetch.
 * Usable without a Solid owner; providers pass their own lifetime's AbortSignal.
 */
export async function readGdoc(
  source: string | ArrayBuffer,
  signal?: AbortSignal
): Promise<ReadResult<DecodedDocument, DocumentError | AbortedError>> {
  const active = checkAborted(signal);

  if (active.isErr()) {
    return err(active.error);
  }

  if (typeof source !== 'string' && source.byteLength > maxDocumentFileBytes) {
    return err(documentError('document-limit', documentFileLimitMessage));
  }

  return runDocumentWorker<DecodedDocument>(
    () => new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' }),
    source,
    signal
  );
}
