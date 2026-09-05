import { decodeDocument, restoreDocument, type SavedDocument } from './storage';
import { packTile, unpackTile, type TileData } from './tilePixels';

/** Portable binary drawing: bounded metadata followed by losslessly packed tile payloads.
 * Each Blob snapshots one tile; no whole-document base64 string or raw pixel array is built.
 */
export async function writePaintFile(
  snapshot: SavedDocument,
  read: (data: TileData) => Promise<Uint8Array>
): Promise<Blob> {
  const metadata = {
    ...snapshot,
    version: 3,
    layers: snapshot.layers.map((layer) => ({
      ...layer,
      tiles: layer.tiles.map((tile) => ({
        key: tile.key,
        pixels: { storageId: PLACEHOLDER_ID, byteLength: tile.pixels.byteLength }
      }))
    }))
  };
  const header = new TextEncoder().encode(JSON.stringify(metadata));
  if (header.byteLength > MAX_HEADER) throw new Error('Drawing metadata is too large to export.');
  const prefix = new Uint8Array(12);
  prefix.set(MAGIC);
  new DataView(prefix.buffer).setUint32(8, header.byteLength, true);
  const parts: BlobPart[] = [prefix, header];
  for (const layer of snapshot.layers)
    for (const tile of layer.tiles) {
      const pixels = await read(tile.pixels);
      parts.push(new Blob([pixels as Uint8Array<ArrayBuffer>]));
    }
  return new Blob(parts, { type: 'application/x-paint' });
}

/** Imports one tile at a time, validating everything before the caller replaces the drawing.
 * The capture callback may page validated pixels to disk. Older JSON files remain readable.
 */
export async function readPaintFile(
  file: Blob,
  capture: (pixels: Uint8Array) => Promise<TileData> = async (pixels) => pixels
): Promise<ReturnType<typeof restoreDocument>> {
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!MAGIC.every((byte, index) => prefix[index] === byte)) {
    if (file.size > 384 * 1048576) throw new Error('The legacy JSON drawing is too large.');
    return decodeDocument(await file.text());
  }
  if (prefix.length !== 12) throw new Error('Truncated drawing header.');
  const length = new DataView(prefix.buffer).getUint32(8, true);
  if (length > MAX_HEADER || length + 12 > file.size) throw new Error('Invalid drawing header size.');
  const value: unknown = JSON.parse(await file.slice(12, 12 + length).text());
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 3)
    throw new Error('Unsupported binary drawing version.');
  const drawing = restoreDocument(value);
  let expected = 12 + length;
  for (const layer of drawing.layers) for (const pixels of layer.tiles.values()) expected += pixels.byteLength;
  if (expected !== file.size) throw new Error('Truncated or oversized drawing payload.');
  let offset = 12 + length;
  for (const layer of drawing.layers)
    for (const [key, ref] of layer.tiles) {
      const packed = new Uint8Array(await file.slice(offset, offset + ref.byteLength).arrayBuffer());
      offset += ref.byteLength;
      const pixels = packTile(unpackTile(packed));
      layer.tiles.set(key, await capture(pixels));
    }
  return drawing;
}

const MAGIC = new TextEncoder().encode('PAINT3\r\n');
const MAX_HEADER = 32 * 1048576;
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
