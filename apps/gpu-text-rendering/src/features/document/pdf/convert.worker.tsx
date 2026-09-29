import { documentError, errorMessage } from '../../../shared/errors';
import { createWorkerRequests } from '../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../shared/worker/WorkerTasks';
import type { ConvertInput, ConvertReply } from '../documentWorkerProtocol';
import init, { convertPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// This worker's lifetime bounds the larger PDF/font WASM heap, independently of the GDOC decoder.
mountWorker(() => {
  const request = createWorkerRequests<ConvertInput, ConvertReply>(self);
  return (
    <WorkerTasks
      request={request}
      execute={async (bytes, { signal }) => {
        await init({ module_or_path: wasmUrl });
        if (signal.aborted) {
          return;
        }
        return convert(bytes);
      }}
      error={(cause) => documentError('decode', `PDF conversion failed: ${errorMessage(cause)}`)}
      transfer={(bytes) => [bytes]}
    />
  );
}, self);

function convert(bytes: ArrayBuffer) {
  const result = convertPdf(new Uint8Array(bytes));
  try {
    const output = result.takeBytes();
    if (output) {
      return { ok: true as const, value: output.buffer as ArrayBuffer };
    }
    const code = result.errorCode;
    return {
      ok: false as const,
      error: documentError(
        code === 'unsupported-pdf' || code === 'document-limit' ? code : 'invalid-data',
        result.errorMessage
      )
    };
  } finally {
    result.free();
  }
}
