import { err, ok, ResultAsync, safeTry } from 'neverthrow';
import { checkAborted, documentError, errorMessage } from '../../shared/errors';
import { documentFileLimitMessage, maxDocumentFileBytes } from './limits';
import { convertPdf } from './pdf/convertPdf';
import { importPdf } from './pdf/importPdf';

/** Reads by signature; PDF import returns render data and exposes a cancellable, on-demand GDOC export. */
export async function readDocumentSource(
  file: File,
  signal?: AbortSignal,
  onConverted?: (exportDocument: ExportDocument) => void
) {
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

    const document = yield* await importPdf(bytes, signal);
    yield* checkAborted(signal);
    onConverted?.(() => exportGdoc(file, signal));
    return ok(document);
  });
}

/** Encodes only when requested; the File keeps source storage outside the JS/WASM heap until then. */
export type ExportDocument = () => ReturnType<typeof exportGdoc>;

function exportGdoc(file: File, signal?: AbortSignal) {
  return safeTry(async function* () {
    yield* checkAborted(signal);
    const bytes = yield* await ResultAsync.fromThrowable(
      () => file.arrayBuffer(),
      (cause) => documentError('load', errorMessage(cause))
    )();
    const encoded = yield* await convertPdf(bytes, signal);
    yield* checkAborted(signal);
    return ok(new File([encoded], file.name.replace(/\.[^.]+$/, '') + '.gdoc', { type: 'application/octet-stream' }));
  });
}
