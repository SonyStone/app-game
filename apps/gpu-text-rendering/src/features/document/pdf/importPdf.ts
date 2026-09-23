import type { OnDocumentProgress } from '../documentProgress';
import type { DecodedDocument } from '../format/types';
import { runDocumentWorker } from '../runDocumentWorker';

/** Consumes PDF bytes and returns validated render buffers, without encoding an intermediate GDOC. */
export function importPdf(bytes: ArrayBuffer, signal?: AbortSignal, onProgress?: OnDocumentProgress) {
  if (!signal?.aborted) onProgress?.({ stage: 'loadingDecoder' });
  return runDocumentWorker<DecodedDocument>(
    () => new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' }),
    bytes,
    signal,
    onProgress
  );
}
