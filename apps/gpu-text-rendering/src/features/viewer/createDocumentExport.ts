import { makeEventListener } from '@solid-primitives/event-listener';
import { err, ok, ResultAsync, type Result } from 'neverthrow';
import { createMemo, createSignal, latest, onCleanup, type Accessor } from 'solid-js';
import { downloadFile } from '../../shared/downloadFile';
import { documentError, errorMessage, type AbortedError, type DocumentError } from '../../shared/errors';
import { readFileBytes } from '../../shared/readFileBytes';
import { runWorkerRequest } from '../../shared/worker/runWorkerRequest';
import type { PreparedDocument } from '../document/createDocumentSource';
import { documentWorkerError } from '../document/documentWorkerError';
import ConvertWorker from '../document/pdf/convert.worker?worker';

/**
 * Provides an on-demand save command for the prepared PDF returned by an accessor.
 * Undefined disables export. Read status beneath Loading when the accessor depends on async loading.
 * Owns conversion workers and cached downloads; changing, cancelling or failing the source releases them.
 */
export function createDocumentExport(document: Accessor<PreparedDocument | undefined>) {
  const output = createMemo(() => {
    const current = document();
    if (!current || current.format !== 'pdf' || !current.file || current.signal.aborted) {
      return undefined;
    }

    return createPdfExport(current.file, current.signal);
  });

  return {
    /** Whether the current document supports PDF-to-GDOC export and has not been aborted. */
    available: () => output()?.available() ?? false,
    /** Whether the current document is being read or converted for saving. */
    pending: () => output()?.pending() ?? false,
    /** Latest save failure for the current document. */
    error: () => output()?.error(),
    /** Hides the latest save failure without retrying. */
    dismissError: () => output()?.dismissError(),
    /** Saves the current PDF; unavailable or duplicate saves succeed without work. */
    save: () => output()?.save() ?? Promise.resolve(ok())
  };
}

/** Caches a converted download until its source is aborted or its reactive owner is disposed. */
function createPdfExport(file: File, signal: AbortSignal) {
  const [active, setActive] = createSignal(true, { ownedWrite: true });
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const controller = new AbortController();
  let download: { url: string; name: string } | undefined;

  const dispose = () => {
    if (controller.signal.aborted) {
      return;
    }

    setActive(false);
    controller.abort();
    if (download) {
      URL.revokeObjectURL(download.url);
    }
  };
  makeEventListener(signal, 'abort', dispose, { once: true });
  onCleanup(dispose);

  return {
    /** Aborting the fixed source signal disables export without needing a replacement document. */
    available: active,
    /** Whether a save is reading or converting the source document. */
    pending: () => active() && pending(),
    /** Latest save failure; cleared when a new save starts or the source is aborted. */
    error: () => (active() ? error() : undefined),
    /** Clears the latest save failure. */
    dismissError: () => setError(undefined),
    /** Converts and downloads, or reuses the cached URL. Returns typed failures; ignored calls succeed without work. */
    async save() {
      // `latest` sees a staged setPending(true) from a save started earlier in the same tick.
      if (controller.signal.aborted || latest(pending)) {
        return ok();
      }

      setPending(true);
      setError(undefined);
      const result = await ResultAsync.fromThrowable(
        async (): Promise<Result<void, DocumentError | AbortedError>> => {
          if (!download) {
            const bytes = await readFileBytes(file, { signal: controller.signal });
            if (controller.signal.aborted) {
              return ok();
            }

            const converted = (
              await runWorkerRequest<ArrayBuffer, ArrayBuffer, DocumentError>(() => new ConvertWorker(), bytes, {
                signal: controller.signal,
                transfer: [bytes]
              })
            ).mapErr(documentWorkerError);
            if (controller.signal.aborted) {
              return ok();
            }

            if (converted.isErr()) {
              return err(converted.error);
            }

            const exported = new File([converted.value], file.name.replace(/\.[^.]+$/, '') + '.gdoc', {
              type: 'application/octet-stream'
            });
            download = { url: URL.createObjectURL(exported), name: exported.name };
          }
          downloadFile(download.url, download.name);
          return ok();
        },
        (cause) => documentError('load', errorMessage(cause), cause)
      )().andThen((result) => result);
      if (!controller.signal.aborted) {
        setPending(false);
        if (result.isErr()) {
          setError(result.error.message);
        }
      }
      return controller.signal.aborted ? ok() : result;
    }
  };
}
