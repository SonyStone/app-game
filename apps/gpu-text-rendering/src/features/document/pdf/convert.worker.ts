import { ResultAsync } from 'neverthrow';
import { documentError, errorMessage } from '../../../shared/errors';
import init, { convertPdf } from './wasm/gpu_document';
import wasmUrl from './wasm/gpu_document_bg.wasm?url';

// Kept separate from the small GDOC decoder: font/PDF code loads only on PDF import.
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  void ResultAsync.fromThrowable(
    async () => {
      await init({ module_or_path: wasmUrl });
      const result = convertPdf(new Uint8Array(event.data));
      const bytes = result.takeBytes();
      const code = result.errorCode;
      const message = result.errorMessage;

      result.free();

      if (bytes) {
        const buffer = bytes.buffer as ArrayBuffer;
        self.postMessage({ ok: true, value: buffer }, { transfer: [buffer] });
        return;
      }

      self.postMessage({
        ok: false,
        error: documentError(code === 'unsupported-pdf' || code === 'document-limit' ? code : 'invalid-data', message)
      });
    },
    (cause) => documentError('decode', `PDF conversion failed: ${errorMessage(cause)}`)
  )().then((result) => {
    if (result.isErr()) {
      self.postMessage({ ok: false, error: result.error });
    }
  });
};
