import { errorMessage } from '@app-game/solid-gpu/errors';
import { mountWorker, WorkerTasks } from '@app-game/solid-gpu/worker';
import { documentError } from '../../../shared/errors';
import { cloneableDocumentError } from '../documentWorkerError';
import type { DocumentReply, ImportInput } from '../documentWorkerProtocol';
import { documentTransfers } from '../format/documentTransfers';
import { extractDocument } from '../format/extractDocument';
import init, { importPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// One document per worker: the main thread shuts it down to release the PDF/font WASM heap.
// The main thread reports loadingDecoder before posting, so progress starts at page processing.
mountWorker(
  () => (
    <WorkerTasks<ImportInput, DocumentReply>
      execute={async (bytes, { signal, progress }) => {
        await init({ module_or_path: wasmUrl });
        signal.throwIfAborted();
        progress({ stage: 'processingPages' });
        return extractDocument(
          importPdf(new Uint8Array(bytes), (completed, total) => {
            progress({ stage: 'processingPages', completed, total });
          })
        ).mapErr(cloneableDocumentError);
      }}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => documentTransfers({ ok: true, value })}
    />
  ),
  self
);
