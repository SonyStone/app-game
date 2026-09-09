import { TILE_SIZE } from './brush';

/** Losslessly stores runs of empty RGBA pixels. Dense tiles keep their original bytes.
 * Packed tiles are shorter than TILE_BYTES; GPU uploads always use unpackTile().
 */
export function packTile(pixels: Uint8Array): Uint8Array {
  if (pixels.byteLength !== TILE_BYTES) return pixels;
  const source = new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  // Record run lengths before allocating pixels. Readback often contains wholly
  // empty or dense tiles; neither needs a temporary 256 KiB encoding buffer.
  const runs: number[] = [];
  let read = 0,
    size = 4;
  while (read < TILE_BYTES && runs.length < 1024) {
    const start = read;
    const empty = source.getUint32(read, true) === 0;
    do {
      read += 4;
    } while (read < TILE_BYTES && (source.getUint32(read, true) === 0) === empty);
    const length = read - start;
    size += 4 + (empty ? 0 : length);
    if (size >= TILE_BYTES) return pixels;
    runs.push(empty ? -length : length);
  }
  // Stop collecting metadata for highly fragmented tiles. Encoding the rest
  // directly keeps their many tiny runs from growing an unbounded JS array.
  const output = new Uint8Array(read === TILE_BYTES ? size : TILE_BYTES);
  const target = new DataView(output.buffer);
  target.setUint32(0, MAGIC, true);
  read = 0;
  let write = 4;
  for (const run of runs) {
    const length = Math.abs(run);
    target.setUint32(write, (length / 4) | (run < 0 ? 0x80000000 : 0), true);
    write += 4;
    if (run > 0) {
      output.set(pixels.subarray(read, read + length), write);
      write += length;
    }
    read += length;
  }
  while (read < TILE_BYTES) {
    const start = read;
    const empty = source.getUint32(read, true) === 0;
    do {
      read += 4;
    } while (read < TILE_BYTES && (source.getUint32(read, true) === 0) === empty);
    const length = read - start;
    if (write + 4 + (empty ? 0 : length) >= TILE_BYTES) return pixels;
    target.setUint32(write, (length / 4) | (empty ? 0x80000000 : 0), true);
    write += 4;
    if (!empty) {
      output.set(pixels.subarray(start, read), write);
      write += length;
    }
  }
  return write === output.length ? output : output.slice(0, write);
}

/** Recognizes the complete all-zero packet without decoding it. Raw pixels and unloaded
 * references return false; false means unknown, not necessarily nonempty. Validates both words.
 */
export function isEmptyPackedTile(pixels: TileData | undefined): boolean {
  if (!(pixels instanceof Uint8Array) || pixels.byteLength !== 8) return false;
  const view = new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  return view.getUint32(0, true) === MAGIC && view.getUint32(4, true) === 0x80010000;
}

/** Expands a tile to exact RGBA8 bytes. Rejects malformed packets before any out-of-bounds write. */
export function unpackTile(pixels: TileData): Uint8Array<ArrayBuffer> {
  if (!(pixels instanceof Uint8Array)) throw new Error('Load this tile from storage before decoding it.');
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

/** Immutable packed pixels or an immutable version stored on disk. */
export type TileData = Uint8Array | TileReference;
/** Disk references never own a full pixel allocation; byteLength counts packed storage. */
export type TileReference = { storageId: string; byteLength: number };
