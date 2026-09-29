import { documentError, errorMessage } from '../../../shared/errors';
import { createWorkerRequests } from '../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../shared/worker/WorkerTasks';
import type { OnDocumentProgress } from '../documentProgress';
import type { DocumentReply } from '../documentWorkerProtocol';
import { documentTransfers } from '../format/documentTransfers';
import { extractDocument } from '../format/extractDocument';
import type { DecodeReply } from '../format/types';
import init, { importPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

mountWorker(() => {
  const request = createWorkerRequests<ArrayBuffer, DocumentReply>(self);
  return (
    <WorkerTasks
      request={request}
      execute={async (bytes, { signal, progress }) => {
        progress({ stage: 'loadingDecoder' });
        await init({ module_or_path: wasmUrl });
        if (signal.aborted) return;
        return read(bytes, progress);
      }}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => documentTransfers({ ok: true, value })}
    />
  );
});

function read(bytes: ArrayBuffer, progress: OnDocumentProgress): DecodeReply {
  progress({ stage: 'processingPages' });
  const result = extractDocument(
    importPdf(new Uint8Array(bytes), (completed, total) => {
      progress({ stage: 'processingPages', completed, total });
    })
  );
  return result.isOk() ? { ok: true, value: result.value } : { ok: false, error: result.error };
}
