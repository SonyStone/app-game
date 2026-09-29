import { err, ok, okAsync, ResultAsync } from 'neverthrow';
import { documentError, errorMessage } from '../../../shared/errors';
import { mountWorker } from '../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../shared/worker/WorkerTasks';
import type { OnDocumentProgress } from '../documentProgress';
import { cloneableDocumentError } from '../documentWorkerError';
import type { DecodeInput, DocumentReply } from '../documentWorkerProtocol';
import { documentFileLimitMessage, maxDocumentFileBytes } from '../limits';
import { decodeGdoc } from './decodeGdoc';
import { documentTransfers } from './documentTransfers';
import init from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// One document per worker: the main thread shuts it down to release the WASM heap.
// The main thread reports loadingDecoder before posting; a URL then reports its download while the decoder loads.
mountWorker(
  () => (
    <WorkerTasks<DecodeInput, DocumentReply>
      execute={(input, { signal, progress }) => {
        const bytes = typeof input === 'string' ? readUrl(input, signal, progress) : okAsync(input);
        return loadDecoder()
          .andThen(() => bytes)
          .andThen((value) => {
            signal.throwIfAborted();
            progress({ stage: 'decodingDocument' });
            return decodeGdoc(new Uint8Array(value));
          })
          .mapErr(cloneableDocumentError);
      }}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => documentTransfers({ ok: true, value })}
    />
  ),
  self
);

function loadDecoder() {
  return ResultAsync.fromPromise(init({ module_or_path: wasmUrl }), (cause) =>
    documentError('decode', `Unable to load document decoder: ${errorMessage(cause)}`)
  );
}

function readUrl(url: string, signal: AbortSignal, progress: OnDocumentProgress) {
  return ResultAsync.fromThrowable(
    () => fetch(url, { signal }),
    (cause) => documentError('load', errorMessage(cause))
  )().andThen((response) => {
    if (!response.ok) {
      return err(documentError('http', `Unable to load document (${response.status})`));
    }

    return readResponseBytes(response, progress);
  });
}

// Bound network input as well as WASM allocations, including chunked responses without Content-Length.
function readResponseBytes(response: Response, progress: OnDocumentProgress) {
  return ResultAsync.fromThrowable(
    async () => {
      if (Number(response.headers.get('content-length')) > maxDocumentFileBytes) {
        return err(documentError('document-limit', documentFileLimitMessage));
      }

      if (!response.body) {
        return err(documentError('invalid-data', 'The document response is empty'));
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;

      while (true) {
        const next = await reader.read();

        if (next.done) {
          break;
        }

        total += next.value.byteLength;

        if (total > maxDocumentFileBytes) {
          return err(documentError('document-limit', documentFileLimitMessage));
        }

        chunks.push(next.value);
        const length = Number(response.headers.get('content-length'));
        progress({
          stage: 'loadingDocument',
          completed: total,
          total: response.headers.has('content-encoding') || length <= 0 ? undefined : length
        });
      }

      reader.releaseLock();

      const bytes = new Uint8Array(total);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }

      return ok(bytes.buffer);
    },
    (cause) => documentError('load', errorMessage(cause))
  )().andThen((result) => result);
}
