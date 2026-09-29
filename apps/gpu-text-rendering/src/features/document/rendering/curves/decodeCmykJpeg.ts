import { err, ok } from 'neverthrow';
import init, { decodeCmykJpeg } from '../../format/wasm/gpu_document';
import wasmUrl from '../../format/wasm/gpu_document_bg.wasm?url';

/**
 * Preserves PDF component polarity before ICC conversion; browser JPEG decoders assume standalone-file polarity.
 * Resolves an error when decoding fails or yields other than `width`×`height` RGBA8 pixels. Always frees the WASM result.
 */
export async function decodePdfCmykJpeg(bytes: ArrayBuffer, width: number, height: number) {
  await init({ module_or_path: wasmUrl });
  const result = decodeCmykJpeg(new Uint8Array(bytes), width, height);
  let pixels: ReturnType<typeof result.takePixels>;
  let message: string;

  try {
    pixels = result.takePixels();
    message = result.errorMessage;
  } finally {
    result.free();
  }

  if (!pixels) {
    return err(message);
  }

  if (pixels.length !== width * height * 4) {
    return err('Decoded CMYK JPEG does not match its declared dimensions');
  }

  return ok({ width, height, pixels: pixels as Uint8Array<ArrayBuffer> });
}

/** Reads validated JPEG component counts without allocating a decoded image. */
export function jpegComponents(buffer: ArrayBuffer) {
  for (const segment of jpegSegments(new Uint8Array(buffer))) {
    if (segment.marker >= 0xc0 && segment.marker <= 0xc3 && segment.length >= 8) {
      return segment.bytes[segment.offset + 9];
    }
  }

  return undefined;
}

/**
 * Removes APP1 Exif segments before browser decoding. PDF ignores Exif orientation, but browsers apply it,
 * which would mirror or transpose DCT images. Returns the original buffer when there is nothing to strip.
 * Bytes from the first unwalkable segment (SOS, EOI or malformed data) onward are kept verbatim.
 */
export function stripJpegExif(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let end = 2;
  let stripped = false;

  for (const segment of jpegSegments(bytes)) {
    if (segment.marker === 0xe1 && isExif(bytes, segment.offset + 4, segment.offset + 2 + segment.length)) {
      stripped = true;
    } else {
      kept.push(bytes.subarray(segment.offset, segment.offset + 2 + segment.length));
    }

    end = segment.offset + 2 + segment.length;
  }

  if (!stripped) {
    return buffer;
  }

  kept.push(bytes.subarray(end));
  const result = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;

  for (const part of kept) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}

/**
 * Walks length-prefixed header segments after the two-byte SOI, stopping before SOS/EOI or malformed data.
 * `offset` points at the segment's 0xFF marker byte; `length` includes its two length bytes.
 */
function* jpegSegments(bytes: Uint8Array) {
  let offset = 2;

  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    const length = bytes[offset + 2]! * 256 + bytes[offset + 3]!;

    if (marker === 0xda || marker === 0xd9 || length < 2 || offset + 2 + length > bytes.length) {
      return;
    }

    yield { bytes, marker, offset, length };
    offset += 2 + length;
  }
}

function isExif(bytes: Uint8Array, begin: number, end: number) {
  // The identifier is "Exif\0" plus one pad byte, which some writers set to 0xFF.
  return end - begin >= 6 && String.fromCharCode(...bytes.subarray(begin, begin + 5)) === 'Exif\0';
}
