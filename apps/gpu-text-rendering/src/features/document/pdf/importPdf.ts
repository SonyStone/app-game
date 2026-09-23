import type { DecodedDocument } from '../format/types';
import { runDocumentWorker } from '../runDocumentWorker';

/** Consumes PDF bytes and returns validated render buffers, without encoding an intermediate GDOC. */
export function importPdf(bytes: ArrayBuffer, signal?: AbortSignal) {
  return runDocumentWorker<DecodedDocument>(
    () => new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' }),
    bytes,
    signal
  );
}
