import { err, ok } from 'neverthrow';
import init, { decodeCmykJpeg } from '../../format/wasm/gpu_document';
import wasmUrl from '../../format/wasm/gpu_document_bg.wasm?url';

/** Preserves PDF component polarity before ICC conversion; browser JPEG decoders assume standalone-file polarity. */
export async function decodePdfCmykJpeg(bytes: ArrayBuffer, width: number, height: number) {
  await init({ module_or_path: wasmUrl });
  const result = decodeCmykJpeg(new Uint8Array(bytes), width, height);
  const pixels = result.takePixels();
  const message = result.errorMessage;
  result.free();

  if (!pixels) {
    return err(message);
  }

  return ok({ width, height, pixels: pixels as Uint8Array<ArrayBuffer> });
}

/** Reads validated JPEG component counts without allocating a decoded image. */
export function jpegComponents(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let offset = 2;

  while (offset + 4 <= bytes.length && bytes[offset] === 255) {
    const marker = bytes[offset + 1]!;
    const length = bytes[offset + 2]! * 256 + bytes[offset + 3]!;

    if (marker === 0xda || marker === 0xd9 || length < 2 || offset + 2 + length > bytes.length) {
      break;
    }

    if (marker >= 0xc0 && marker <= 0xc3 && length >= 8) {
      return bytes[offset + 9];
    }

    offset += 2 + length;
  }

  return undefined;
}
