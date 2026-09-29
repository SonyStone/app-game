import { err, ok, type Result } from 'neverthrow';
import { documentError, errorMessage, type DocumentError } from '../../../shared/errors';
import { mountWorker } from '../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../shared/worker/WorkerTasks';
import type { ConvertInput, ConvertReply } from '../documentWorkerProtocol';
import init, { convertPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// This worker's lifetime bounds the larger PDF/font WASM heap, independently of the GDOC decoder.
mountWorker(
  () => (
    <WorkerTasks<ConvertInput, ConvertReply>
      execute={async (bytes, { signal }) => {
        await init({ module_or_path: wasmUrl });
        signal.throwIfAborted();
        return convert(bytes);
      }}
      error={(cause) => documentError('decode', `PDF conversion failed: ${errorMessage(cause)}`)}
      transfer={(bytes) => [bytes]}
    />
  ),
  self
);

/** Encodes PDF bytes as GDOC, mapping the converter's error code; always frees the WASM result. */
function convert(bytes: ArrayBuffer): Result<ArrayBuffer, DocumentError> {
  const result = convertPdf(new Uint8Array(bytes));
  try {
    const output = result.takeBytes();
    if (output) {
      return ok(output.buffer as ArrayBuffer);
    }
    const code = result.errorCode;
    return err(
      documentError(
        code === 'unsupported-pdf' || code === 'document-limit' ? code : 'invalid-data',
        result.errorMessage
      )
    );
  } finally {
    result.free();
  }
}
