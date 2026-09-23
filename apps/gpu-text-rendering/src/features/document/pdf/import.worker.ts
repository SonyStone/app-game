import { documentError, errorMessage } from '../../../shared/errors';
import { documentTransfers } from '../format/documentTransfers';
import { extractDocument } from '../format/extractDocument';
import type { DecodeReply } from '../format/types';
import init, { importPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  void read(event.data).then((reply) => self.postMessage(reply, { transfer: documentTransfers(reply) }));
};

async function read(bytes: ArrayBuffer): Promise<DecodeReply> {
  try {
    self.postMessage({ progress: { stage: 'loadingDecoder' } });
    await init({ module_or_path: wasmUrl });
    self.postMessage({ progress: { stage: 'processingPages' } });
    const result = extractDocument(
      importPdf(new Uint8Array(bytes), (completed, total) => {
        self.postMessage({ progress: { stage: 'processingPages', completed, total } });
      })
    );
    return result.isOk() ? { ok: true, value: result.value } : { ok: false, error: result.error };
  } catch (cause) {
    return { ok: false, error: documentError('decode', errorMessage(cause)) };
  }
}
