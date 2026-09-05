import { TILE_SIZE } from './brush';

/** Losslessly stores runs of empty RGBA pixels. Dense tiles keep their original bytes.
 * Packed tiles are shorter than TILE_BYTES; GPU uploads always use unpackTile().
 */
export function packTile(pixels: Uint8Array): Uint8Array {
  if (pixels.byteLength !== TILE_BYTES) return pixels;
  const source = new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const output = new Uint8Array(TILE_BYTES);
  const target = new DataView(output.buffer);
  target.setUint32(0, MAGIC, true);
  let read = 0,
    write = 4;
  while (read < TILE_BYTES) {
    const start = read;
    const empty = source.getUint32(read, true) === 0;
    do {
      read += 4;
    } while (read < TILE_BYTES && (source.getUint32(read, true) === 0) === empty);
    const length = read - start;
    const needed = 4 + (empty ? 0 : length);
    if (write + needed >= TILE_BYTES) return pixels;
    target.setUint32(write, (length / 4) | (empty ? 0x80000000 : 0), true);
    write += 4;
    if (!empty) {
      output.set(pixels.subarray(start, read), write);
      write += length;
    }
  }
  return output.slice(0, write);
}

/** Expands a tile to exact RGBA8 bytes. Rejects malformed packets before any out-of-bounds write. */
export function unpackTile(pixels: Uint8Array): Uint8Array<ArrayBuffer> {
  if (pixels.byteLength === TILE_BYTES) return pixels as Uint8Array<ArrayBuffer>;
  if (pixels.byteLength < 8 || pixels.byteLength > TILE_BYTES || pixels.byteLength % 4)
    throw new Error('Invalid packed tile length.');
  const source = new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  if (source.getUint32(0, true) !== MAGIC) throw new Error('Invalid packed tile header.');
  const output = new Uint8Array(TILE_BYTES);
  let read = 4,
    write = 0;
  while (read < pixels.byteLength) {
    const packet = source.getUint32(read, true);
    read += 4;
    const length = (packet & 0x7fffffff) * 4;
    if (!length || write + length > TILE_BYTES) throw new Error('Invalid packed tile run.');
    if (!(packet & 0x80000000)) {
      if (read + length > pixels.byteLength) throw new Error('Truncated packed tile.');
      output.set(pixels.subarray(read, read + length), write);
      read += length;
    }
    write += length;
  }
  if (write !== TILE_BYTES) throw new Error('Incomplete packed tile.');
  return output;
}

/** Uncompressed bytes per 256×256 premultiplied RGBA8 tile. */
export const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;
const MAGIC = 0x31544c50;
