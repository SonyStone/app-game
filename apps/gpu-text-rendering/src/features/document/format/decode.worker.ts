import { err, ok, ResultAsync } from 'neverthrow';
import { documentError, errorMessage } from '../../../shared/errors';
import { documentFileLimitMessage, maxDocumentFileBytes } from '../limits';
import { decodeGdoc } from './decodeGdoc';
import { documentTransfers } from './documentTransfers';
import type { DecodeReply } from './types';
import init from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// One request per Worker: terminating it also releases its expanded WASM heap.
self.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
  void read(event.data).then((reply) => {
    self.postMessage(reply, { transfer: documentTransfers(reply) });
  });
};

async function read(source: string | ArrayBuffer): Promise<DecodeReply> {
  self.postMessage({ progress: { stage: 'loadingDecoder' } });
  const loading = typeof source === 'string' ? readUrl(source) : Promise.resolve(ok(source));
  const initialized = await ResultAsync.fromThrowable(
    () => init({ module_or_path: wasmUrl }),
    (cause) => documentError('decode', `Unable to load document decoder: ${errorMessage(cause)}`)
  )();

  if (initialized.isErr()) {
    return { ok: false, error: initialized.error };
  }

  const bytes = await loading;

  if (bytes.isErr()) {
    return { ok: false, error: bytes.error };
  }

  self.postMessage({ progress: { stage: 'decodingDocument' } });
  const result = decodeGdoc(new Uint8Array(bytes.value));

  if (result.isErr()) {
    // The displayable message and stable code are transferable even for a non-cloneable external cause.
    const { kind, code, message } = result.error;

    return { ok: false, error: { kind, code, message } };
  }

  return { ok: true, value: result.value };
}

function readUrl(url: string) {
  return ResultAsync.fromThrowable(
    () => fetch(url),
    (cause) => documentError('load', errorMessage(cause))
  )().andThen((response) => {
    if (!response.ok) {
      return err(documentError('http', `Unable to load document (${response.status})`));
    }

    return readResponseBytes(response);
  });
}

// Bound network input as well as WASM allocations, including chunked responses without Content-Length.
function readResponseBytes(response: Response) {
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
        self.postMessage({
          progress: {
            stage: 'loadingDocument',
            completed: total,
            total: response.headers.has('content-encoding') || length <= 0 ? undefined : length
          }
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
