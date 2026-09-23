import { err, ok, Result } from 'neverthrow';
import { documentError, errorMessage, type DocumentError } from '../../../shared/errors';
import type { DecodedDocument } from './types';
import { decodeDocument } from './wasm/gpu_document';

/** Requires initialized WASM. Expected format failures are values; traps are contained at this boundary. */
export function decodeGdoc(bytes: Uint8Array): Result<DecodedDocument, DocumentError> {
  return Result.fromThrowable(
    () => {
      const outcome = decodeDocument(bytes);
      const document = outcome.takeDocument();
      const code = outcome.errorCode;
      const message = outcome.errorMessage;

      outcome.free();

      if (!document) {
        return err(documentError(formatErrorCode(code), message));
      }

      const records = document.takePages();
      const dimensions = document.dimensions();
      const pages: DecodedDocument['pages'] = [];

      for (let i = 0; i < records.length; i += 4) {
        pages.push({
          width: records[i]!,
          height: records[i + 1]!,
          beginVertex: records[i + 2]! * 6,
          endVertex: (records[i + 2]! + records[i + 3]!) * 6,
          images: []
        });
      }

      const common = { pages, positions: { x: owned(document.takePositionsX()), y: owned(document.takePositionsY()) } };
      const value: DecodedDocument =
        document.profile === 2 || document.profile === 3
          ? {
              ...common,
              kind: 'curves',
              curves: owned(document.takeCurves()).buffer,
              instances: owned(document.takeInstances()).buffer,
              clips: owned(document.takeClips()).buffer,
              curveBins: owned(document.takeCurveBins()).buffer,
              blends: owned(document.takeBlends()).buffer,
              groups: owned(document.takeGroups()).buffer,
              maskTransfers: owned(document.takeMaskTransfers()).buffer,
              radialGradients: owned(document.takeRadialGradients()).buffer,
              rasterImages: {
                table: owned(document.takeImageTable()).buffer,
                pixels: owned(document.takeImagePixels()).buffer
              }
            }
          : {
              ...common,
              kind: 'glyphs',
              glyphVertices: owned(document.takeVertices()).buffer,
              atlas: { buf: owned(document.takeAtlas()).buffer, width: dimensions[0]!, height: dimensions[1]! },
              atlasVertices: {
                buf: owned(document.takeAtlasVertices()).buffer,
                width: dimensions[2]!,
                height: dimensions[3]!
              }
            };

      document.free();

      return ok(value);
    },
    (cause) => documentError('decode', errorMessage(cause), cause)
  )().andThen((result) => result);
}

// wasm-bindgen's Vec getters return .slice() copies, never views into WASM memory.
function owned(value: Float32Array): Float32Array<ArrayBuffer>;
function owned(value: Uint8Array): Uint8Array<ArrayBuffer>;
function owned(value: Float32Array | Uint8Array) {
  return value as Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>;
}

function formatErrorCode(code: string): DocumentError['code'] {
  switch (code) {
    case 'unsupported-format':
    case 'document-limit':
    case 'checksum':
    case 'decode':
      return code;
    default:
      return 'invalid-data';
  }
}
