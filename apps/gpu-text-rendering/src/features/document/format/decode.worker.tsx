import { err, ok, ResultAsync, type Result } from 'neverthrow';
import { documentError, errorMessage, type DocumentError } from '../../../shared/errors';
import { createWorkerRequests } from '../../../shared/worker/createWorkerRequests';
import { mountWorker } from '../../../shared/worker/mountWorker';
import { WorkerTasks } from '../../../shared/worker/WorkerTasks';
import type { OnDocumentProgress } from '../documentProgress';
import type { DecodeInput, DocumentReply } from '../documentWorkerProtocol';
import { documentFileLimitMessage, maxDocumentFileBytes } from '../limits';
import { decodeGdoc } from './decodeGdoc';
import { documentTransfers } from './documentTransfers';
import type { DecodeReply } from './types';
import init from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// One document per worker: the main thread terminates it to release the WASM heap.
mountWorker(() => {
  const request = createWorkerRequests<DecodeInput, DocumentReply>(self);
  return (
    <WorkerTasks
      request={request}
      execute={async (input, { signal, progress }) => {
        progress({ stage: 'loadingDecoder' });
        const loading = typeof input === 'string' ? readUrl(input, signal, progress) : Promise.resolve(ok(input));
        try {
          await init({ module_or_path: wasmUrl });
        } catch (cause) {
          return {
            ok: false as const,
            error: documentError('decode', `Unable to load document decoder: ${errorMessage(cause)}`)
          };
        }
        if (signal.aborted) return;
        return read(loading, progress);
      }}
      error={(cause) => documentError('decode', errorMessage(cause))}
      transfer={(value) => documentTransfers({ ok: true, value })}
    />
  );
});

async function read(
  loading: PromiseLike<Result<ArrayBuffer, DocumentError>>,
  progress: OnDocumentProgress
): Promise<DecodeReply> {
  const bytes = await loading;

  if (bytes.isErr()) {
    return { ok: false, error: bytes.error };
  }

  progress({ stage: 'decodingDocument' });
  const result = decodeGdoc(new Uint8Array(bytes.value));

  if (result.isErr()) {
    // The displayable message and stable code are transferable even for a non-cloneable external cause.
    const { kind, code, message } = result.error;

    return { ok: false, error: { kind, code, message } };
  }

  return { ok: true, value: result.value };
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
