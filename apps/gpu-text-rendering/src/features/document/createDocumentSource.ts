import { createAbortable } from '@solid-primitives/async';
import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { err, ok } from 'neverthrow';
import { createEffect, createMemo, createSignal, latest, merge, onCleanup } from 'solid-js';
import type { DocumentError, ResultValue, ViewerError } from '../../shared/errors';
import { runWorkerRequest } from '../../shared/worker/runWorkerRequest';
import demoUrl from './assets/demo.gdoc?url';
import type { TextDocument } from './document';
import type { DocumentProgress } from './documentProgress';
import { documentWorkerError } from './documentWorkerError';
import DecodeWorker from './format/decode.worker?worker';
import type { DecodedDocument } from './format/types';
import { layoutPages } from './layoutPages';
import ImportWorker from './pdf/import.worker?worker';
import { readDocumentFile } from './readDocumentFile';

/**
 * Loads a file or the bundled demo when undefined. Accepts a value or reactive accessor.
 * Replacement and owner disposal cancel reads/workers and release images. Requires a Solid owner.
 * Read methods through the returned object to follow selection changes; captured methods keep their selection.
 */
export function createDocumentSource(input: MaybeAccessor<File | undefined>) {
  const source = createMemo(() => {
    const file = access(input);
    const [getSignal, abort] = createAbortable();
    const signal = getSignal();
    const [failure, setFailure] = createSignal<ViewerError | undefined>(undefined, { ownedWrite: true });
    const [progress, setProgress] = createSignal<DocumentProgress | undefined>(undefined, { ownedWrite: true });

    const decoded = createMemo(async () => {
      // Resume outside memo evaluation before publishing worker progress.
      const input = await (file
        ? readDocumentFile(file, signal, report)
        : ok({ format: 'gdoc' as const, bytes: demoUrl }));
      if (input.isErr()) return err(input.error);
      const { format, bytes } = input.value;
      report({ stage: 'loadingDecoder' });
      const result = await runWorkerRequest<string | ArrayBuffer, DecodedDocument, DocumentError, DocumentProgress>(
        () => (format === 'pdf' ? new ImportWorker() : new DecodeWorker()),
        bytes,
        { signal, transfer: bytes instanceof ArrayBuffer ? [bytes] : [], onProgress: report }
      );
      return result.mapErr(documentWorkerError).map((data) => ({ data, format }));
    });

    const document = createMemo(() => {
      if (failure()) return undefined;
      return decoded()?.andThen(({ data, format }) =>
        layoutPages(data.pages, 2).map((pages) => {
          const document: TextDocument = { ...data, pages, imageVertices: new ArrayBuffer(0), images: new Map() };
          onCleanup(() => {
            document.images.forEach((image) => image.close());
            document.images.clear();
          });
          return { data: document, format, file, signal, fail };
        })
      );
    });
    const ready = createMemo(() => document()?.isOk() ?? false, { loadingValue: false });
    createEffect(document, (result) => {
      if (result?.isErr()) fail(result.error);
    });

    return {
      /** Read beneath Loading while the selected file is loading. */
      document,
      /** Synchronous status, including when no Loading boundary is mounted. */
      ready,
      // Progress must remain live while the decoded document holds an async update.
      progress: () => latest(progress),
      active: () => failure()?.kind !== 'aborted',
      error: () => {
        const error = failure();
        return error?.kind === 'aborted' ? undefined : error;
      },
      /** Cancels this selection. Selecting again starts a fresh load. */
      cancel() {
        if (signal.aborted) return;
        setFailure({ kind: 'aborted', message: 'Operation cancelled' });
        abort();
      },
      /** Capture this handler so a late failure cannot affect a replacement selection. */
      fail
    };

    function report(value: DocumentProgress) {
      if (!signal.aborted) setProgress(value);
    }

    function fail(error: ViewerError) {
      if (signal.aborted || error.kind === 'aborted') return null;
      setFailure(error);
      abort();
      return null;
    }
  });

  return merge(source);
}

/** Reactive loading state and prepared document, with no saving behavior. */
export type DocumentSource = ReturnType<typeof createDocumentSource>;

/** Prepared GPU data together with its original file metadata and lifetime signal. */
export type PreparedDocument = ResultValue<NonNullable<ReturnType<DocumentSource['document']>>>;
