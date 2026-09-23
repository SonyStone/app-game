import { Result } from 'neverthrow';
import { documentError, errorMessage } from '../../../shared/errors';
import { extractDocument } from './extractDocument';
import { decodeDocument } from './wasm/gpu_document';

/** Requires initialized WASM. Expected format failures and WASM traps stay inside the worker boundary. */
export function decodeGdoc(bytes: Uint8Array) {
  return Result.fromThrowable(
    () => extractDocument(decodeDocument(bytes)),
    (cause) => documentError('decode', errorMessage(cause), cause)
  )().andThen((result) => result);
}
