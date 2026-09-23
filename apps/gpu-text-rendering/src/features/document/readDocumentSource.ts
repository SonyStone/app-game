import { err, ok, ResultAsync, safeTry } from 'neverthrow';
import { checkAborted, documentError, errorMessage } from '../../shared/errors';
import { documentFileLimitMessage, maxDocumentFileBytes } from './limits';
import { convertPdf } from './pdf/convertPdf';

/** Reads a selected file, sniffing the bytes rather than trusting its extension. PDF output is reusable GDOC. */
export async function readDocumentSource(file: File, signal?: AbortSignal, onConverted?: (file: File) => void) {
  return safeTry(async function* () {
    yield* checkAborted(signal);

    if (file.size > maxDocumentFileBytes) {
      return err(documentError('document-limit', documentFileLimitMessage));
    }

    const bytes = yield* await ResultAsync.fromThrowable(
      () => file.arrayBuffer(),
      (cause) => documentError('load', errorMessage(cause))
    )();
    yield* checkAborted(signal);
    const header = new TextDecoder('ascii').decode(bytes.slice(0, 1024));

    if (header.startsWith('GDOC\r\n\x1a\n')) {
      return ok(bytes);
    }

    if (!header.includes('%PDF-')) {
      return err(documentError('unsupported-format', 'Choose a PDF or GDOC document'));
    }

    const converted = yield* await convertPdf(bytes, signal);
    yield* checkAborted(signal);
    onConverted?.(
      new File([converted], file.name.replace(/\.[^.]+$/, '') + '.gdoc', { type: 'application/octet-stream' })
    );

    return ok(converted);
  });
}
