import { TILE_BYTES } from './tilePixels';

/**
 * Compresses a packed tile (`packTile`) for storage on disk with deflate, which shrinks a typical drawing several
 * times over: flat areas and soft gradients compress well, noise barely. Tiles that would not shrink by a tenth, and
 * small ones, are stored as they are, so `restoreTile` tells the two apart by a header. Runs in workers and on the main
 * thread alike.
 */
export async function compressTile(packed: Uint8Array): Promise<Uint8Array> {
  if (packed.byteLength < minCompressedBytes) {
    return packed;
  }

  const deflated = await transform(packed, new CompressionStream('deflate-raw'));
  if (deflated.byteLength + HEADER_BYTES > packed.byteLength * maxShare) {
    return packed;
  }

  const stored = new Uint8Array(HEADER_BYTES + deflated.byteLength);
  const header = new DataView(stored.buffer);
  header.setUint32(0, MAGIC, true);
  header.setUint32(4, packed.byteLength, true);
  stored.set(deflated, HEADER_BYTES);
  return stored;
}

/**
 * The packed tile stored by `compressTile`; tiles stored without compression, such as those written before it existed,
 * come back unchanged. Throws when a compressed tile is corrupt or does not inflate to its recorded length.
 */
export async function restoreTile(stored: Uint8Array): Promise<Uint8Array> {
  if (!isCompressedTile(stored)) {
    return stored;
  }

  const length = new DataView(stored.buffer, stored.byteOffset, stored.byteLength).getUint32(4, true);
  const packed = await transform(stored.subarray(HEADER_BYTES), new DecompressionStream('deflate-raw'));
  if (packed.byteLength !== length) {
    throw new Error('A compressed tile is damaged.');
  }

  return packed;
}

/**
 * Whether `stored` was compressed by `compressTile`. A full raw tile is never compressed, and packed tiles start with
 * their own header, so neither can be mistaken for one.
 */
export function isCompressedTile(stored: Uint8Array) {
  return (
    stored.byteLength > HEADER_BYTES &&
    stored.byteLength < TILE_BYTES &&
    new DataView(stored.buffer, stored.byteOffset, stored.byteLength).getUint32(0, true) === MAGIC
  );
}

/** Runs `bytes` through a compression or decompression stream. */
async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** "PZT1": a deflated tile, followed by its packed length. */
const MAGIC = 0x31545a50;
const HEADER_BYTES = 8;

/** Tiles smaller than this, such as empty or nearly empty packed tiles, are not worth compressing. */
const minCompressedBytes = 1024;

/** A compressed tile is kept only when it is at most this share of the packed one. */
const maxShare = 0.9;
