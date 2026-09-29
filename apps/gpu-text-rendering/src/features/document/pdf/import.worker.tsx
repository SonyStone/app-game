import { documentError, errorMessage } from '../../../shared/errors';
import { createWorkerRequests } from '../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../shared/worker/WorkerTasks';
import type { OnDocumentProgress } from '../documentProgress';
import { documentReply } from '../documentWorkerError';
import type { DocumentReply, ImportInput } from '../documentWorkerProtocol';
import { documentTransfers } from '../format/documentTransfers';
import { extractDocument } from '../format/extractDocument';
import init, { importPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// One document per worker: the main thread shuts it down to release the PDF/font WASM heap.
mountWorker(() => {
  const request = createWorkerRequests<ImportInput, DocumentReply>(self);
  return (
    <WorkerTasks
      request={request}
      execute={async (bytes, { signal, progress }) => {
        progress({ stage: 'loadingDecoder' });
        await init({ module_or_path: wasmUrl });
        if (signal.aborted) {
          return;
        }
        return read(bytes, progress);
      }}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => documentTransfers({ ok: true, value })}
    />
  );
}, self);

function read(bytes: ArrayBuffer, progress: OnDocumentProgress) {
  progress({ stage: 'processingPages' });
  return documentReply(
    extractDocument(
      importPdf(new Uint8Array(bytes), (completed, total) => {
        progress({ stage: 'processingPages', completed, total });
      })
    )
  );
}
