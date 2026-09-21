import { err, ok, type Result } from 'neverthrow';
import { documentError, type DocumentError } from '../../shared/errors';

/** Strips the fixed header used by bundled assets; malformed containers return a document error. */
export function unpackBmp(buf: ArrayBuffer): Result<UnpackedBMP, DocumentError> {
  if (buf.byteLength < 54) {
    return err(documentError('invalid-data', 'Incomplete BMP container header'));
  }

  const header = new DataView(buf);

  return ok({ buf: buf.slice(54), width: header.getUint16(18, true), height: header.getUint16(22, true) });
}

/** Payload and atlas dimensions stored in the demo's BMP containers. This is not a general BMP decoder. */
export type UnpackedBMP = {
  buf: ArrayBuffer;
  width: number;
  height: number;
};
