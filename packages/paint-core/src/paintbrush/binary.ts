/** Collects exactly the declared number of bytes, cancelling on the first excess output chunk. */
export async function inflate(input: Uint8Array, length: number, format: 'deflate' | 'deflate-raw') {
  const stream = new Blob([new Uint8Array(input)]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const output = new Uint8Array(length);
  let offset = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (offset + value.length > length) {
      await reader.cancel();
      throw new Error('Expanded size exceeds its declaration');
    }
    output.set(value, offset);
    offset += value.length;
  }
  if (offset !== length) {
    throw new Error('Incorrect expanded size');
  }
  return output;
}

/** CRC-32 used by both PNG chunks and ZIP entries. */
export function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]!;
  }
  return ~crc >>> 0;
}

const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) {
    n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return n;
});

/** Concatenates binary chunks without spreading large arrays onto the call stack. */
export function join(parts: readonly Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}
