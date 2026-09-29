import { err, ok, ResultAsync } from 'neverthrow';
import { checkAborted, documentError, errorMessage } from '../../shared/errors';
import { readFileBytes } from '../../shared/readFileBytes';
import type { OnDocumentProgress } from './documentProgress';
import { documentFileLimitMessage, maxDocumentFileBytes } from './limits';

/** Reads a local file with cancellation and byte progress, then identifies its format by signature. */
export async function readDocumentFile(file: File, signal?: AbortSignal, onProgress?: OnDocumentProgress) {
  const active = checkAborted(signal);
  if (active.isErr()) {
    return err(active.error);
  }
  if (file.size > maxDocumentFileBytes) {
    return err(documentError('document-limit', documentFileLimitMessage));
  }

  const read = await ResultAsync.fromPromise(
    readFileBytes(file, {
      signal,
      onProgress: (completed, total) => onProgress?.({ stage: 'readingFile', completed, total })
    }),
    (cause) =>
      signal?.aborted
        ? { kind: 'aborted' as const, message: 'Operation cancelled' }
        : documentError('load', errorMessage(cause))
  );

  return read
    .andThrough(() => checkAborted(signal))
    .andThen((bytes) => {
      const header = new TextDecoder('ascii').decode(bytes.slice(0, 1024));
      if (header.startsWith('GDOC\r\n\x1a\n')) {
        return ok({ format: 'gdoc' as const, bytes });
      }
      if (header.includes('%PDF-')) {
        return ok({ format: 'pdf' as const, bytes });
      }
      return err(documentError('unsupported-format', 'Choose a PDF or GDOC document'));
    });
}
