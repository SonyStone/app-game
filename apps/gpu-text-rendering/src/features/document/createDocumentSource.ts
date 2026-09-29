import { createAbortable } from '@solid-primitives/async';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { err, ok } from 'neverthrow';
import { createMemo, createSignal, latest, merge } from 'solid-js';
import type { ResultValue, ViewerError } from '../../shared/errors';
import { runWorkerRequest, type RunProtocolRequest } from '../../shared/worker/runWorkerRequest';
import demoUrl from './assets/demo.gdoc?url';
import type { TextDocument } from './document';
import type { DocumentProgress } from './documentProgress';
import { documentWorkerError } from './documentWorkerError';
import type { DecodeInput, DocumentReply, ImportInput } from './documentWorkerProtocol';
import DecodeWorker from './format/decode.worker?worker';
import { layoutPages } from './layoutPages';
import ImportWorker from './pdf/import.worker?worker';
import { readDocumentFile } from './readDocumentFile';

/**
 * Loads a file or the bundled demo when undefined. Accepts a value or reactive accessor.
 * Replacement and owner disposal cancel reads/workers. Requires a Solid owner.
 * Read methods through the returned object to follow selection changes; captured methods keep their selection.
 */
export function createDocumentSource(input: MaybeAccessor<File | undefined>) {
  const source = createMemo(() => {
    const file = access(input);
    const [getSignal, abort] = createAbortable();
    const signal = getSignal();
    // External failures (renderer, export) and cancellation; decoding failures are derived from the document.
    const [failure, setFailure] = createSignal<ViewerError | undefined>(undefined, { ownedWrite: true });
    const [progress, setProgress] = createSignal<DocumentProgress | undefined>(undefined, { ownedWrite: true });

    const decoded = createMemo(async () => {
      // Resume outside memo evaluation before publishing worker progress.
      const input = await (file
        ? readDocumentFile(file, signal, report)
        : ok({ format: 'gdoc' as const, bytes: demoUrl }));
      if (input.isErr()) {
        return err(input.error);
      }
      const { format, bytes } = input.value;
      report({ stage: 'loadingDecoder' });
      const options = { signal, transfer: bytes instanceof ArrayBuffer ? [bytes] : [], onProgress: report };
      const importDocument: RunProtocolRequest<ImportInput, DocumentReply> = runWorkerRequest;
      const decodeDocument: RunProtocolRequest<DecodeInput, DocumentReply> = runWorkerRequest;
      const result = await (format === 'pdf'
        ? importDocument(() => new ImportWorker(), bytes, options)
        : decodeDocument(() => new DecodeWorker(), bytes, options));
      return result.mapErr(documentWorkerError).map((data) => ({ data, format }));
    });

    const document = createMemo(() => {
      if (failure()) {
        return undefined;
      }
      return decoded()?.andThen(({ data, format }) =>
        layoutPages(data.pages, layoutAspect).map((pages) => {
          const document: TextDocument = { ...data, pages };
          return { data: document, format, file, signal, fail };
        })
      );
    });
    const ready = createMemo(() => document()?.isOk() ?? false, { loadingValue: false });
    const decodeFailure = createMemo<ViewerError | undefined>(
      () =>
        document()?.match(
          () => undefined,
          (error) => error
        ),
      { loadingValue: undefined }
    );

    return {
      /** Read beneath Loading while the selected file is loading. */
      document,
      /** Synchronous status, including when no Loading boundary is mounted. */
      ready,
      // Progress must remain live while the decoded document holds an async update.
      progress: () => latest(progress),
      /** False after cancellation; a cancelled selection shows no error. */
      active: () => failure()?.kind !== 'aborted',
      /** An external failure, else the decoding/layout failure; synchronous, like ready. */
      error: () => {
        const error = failure() ?? decodeFailure();
        return error?.kind === 'aborted' ? undefined : error;
      },
      /** Cancels this selection. Selecting again starts a fresh load. */
      cancel() {
        if (signal.aborted) {
          return;
        }
        setFailure({ kind: 'aborted', message: 'Operation cancelled' });
        abort();
      },
      /** Capture this handler so a late failure cannot affect a replacement selection. */
      fail
    };

    function report(value: DocumentProgress) {
      if (!signal.aborted) {
        setProgress(value);
      }
    }

    /** Records an external failure and cancels outstanding work. Ignored after cancellation; returns null for JSX. */
    function fail(error: ViewerError) {
      if (signal.aborted || error.kind === 'aborted') {
        return null;
      }
      setFailure(error);
      abort();
      return null;
    }
  });

  return merge(source);
}

/** Reactive loading state and prepared document, with no saving behavior. */
export type DocumentSource = ReturnType<typeof createDocumentSource>;

/**
 * Width/height ratio pages are laid out for. Layout is fixed per document, so it does not follow the viewport;
 * two leaves a landscape-leaning grid that suits typical desktop windows.
 */
const layoutAspect = 2;

/** Prepared GPU data together with its original file metadata and lifetime signal. */
export type PreparedDocument = ResultValue<NonNullable<ReturnType<DocumentSource['document']>>>;
