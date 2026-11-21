import { z } from 'zod';
import { packMaskTile, unpackMaskTile } from './layerMask';
import { decodeDocument, restoreDocument, type SavedDocument } from './storage';
import { compressTile, restoreTile } from './tileCodec';
import { packTile, TILE_BYTES, unpackTile, type TileData } from './tilePixels';

/**
 * Portable binary drawing, version 5, 6 or 7: the drawing's tiles, each stored once however many layers share it and
 * compressed by `compressTile`, then the metadata with an index of the tiles, then a trailer locating the metadata.
 * The metadata of version 5 is a version 4 document (`SavedDocument`), that of version 6 a version 5 one, written for
 * a drawing with a layer clipped to a folder, and that of version 7 a version 6 one, written for a drawing with a
 * mask (see `SavedDocument`): its `layers` are the layer tree's nodes, raster layers listing their tiles by index and
 * folders listing none, and a node's `mask` listing its coverage tiles the same way. Version 4 files had the same
 * layout with a flat list of raster layers. Builds before version 7 refuse a version 7 file. Tiles are read one at a
 * time through `read`; each Blob part holds one tile, so no whole-document buffer is built.
 */
export async function writePaintFile(
  snapshot: SavedDocument,
  read: (data: TileData) => Promise<Uint8Array>
): Promise<Blob> {
  const version = snapshot.version === 6 ? 7 : snapshot.version === 5 ? 6 : 5;
  const magic = version === 7 ? MAGIC_V7 : version === 6 ? MAGIC_V6 : MAGIC_V5;
  const parts: BlobPart[] = [magic];
  const index: { offset: number; length: number; byteLength: number }[] = [];
  /** Index entries by tile version: a stored reference's id, or the packed pixels themselves. */
  const entries = new Map<unknown, number>();
  let offset = magic.byteLength;
  /** `saved` tiles as index entries, storing each version the first time it appears. */
  const indexTiles = async (saved: readonly { key: string; pixels: TileData }[]) => {
    const tiles = [];
    for (const tile of saved) {
      const identity = tile.pixels instanceof Uint8Array ? tile.pixels : tile.pixels.storageId;
      let entry = entries.get(identity);
      if (entry === undefined) {
        const packed = await read(tile.pixels);
        const stored = await compressTile(packed);
        entry = index.length;
        entries.set(identity, entry);
        index.push({ offset, length: stored.byteLength, byteLength: packed.byteLength });
        parts.push(new Blob([stored as Uint8Array<ArrayBuffer>]));
        offset += stored.byteLength;
      }

      tiles.push({ key: tile.key, tile: entry });
    }

    return tiles;
  };
  const layers = [];
  for (const layer of snapshot.layers) {
    const mask = layer.mask && { ...layer.mask, tiles: await indexTiles(layer.mask.tiles) };
    if (layer.kind === 'group') {
      layers.push(mask ? { ...layer, mask } : layer);
      continue;
    }

    const tiles = await indexTiles(layer.tiles);
    layers.push(mask ? { ...layer, tiles, mask } : { ...layer, tiles });
  }

  const header = new TextEncoder().encode(JSON.stringify({ ...snapshot, version, layers, tiles: index }));
  if (header.byteLength > MAX_HEADER) {
    throw new Error('Drawing metadata is too large to export.');
  }

  const trailer = new Uint8Array(TRAILER_BYTES);
  const view = new DataView(trailer.buffer);
  view.setBigUint64(0, BigInt(offset), true);
  view.setUint32(8, header.byteLength, true);
  trailer.set(TRAILER_MAGIC, 12);
  parts.push(header, trailer);
  return new Blob(parts, { type: 'application/x-paint' });
}

/**
 * Reads a drawing of any version, one tile at a time, validating everything before the caller replaces the drawing.
 * `capture` may page validated pixels to disk; a tile shared by several layers is captured once and shared again.
 * Older binary and JSON files remain readable.
 */
export async function readPaintFile(
  file: Blob,
  capture: (pixels: Uint8Array) => Promise<TileData> = async (pixels) => pixels
): Promise<ReturnType<typeof restoreDocument>> {
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const [version, magic] of [
    [4, MAGIC_V4],
    [5, MAGIC_V5],
    [6, MAGIC_V6],
    [7, MAGIC_V7]
  ] as const) {
    if (magic.every((byte, index) => prefix[index] === byte)) {
      return readIndexed(file, version, capture);
    }
  }

  if (!MAGIC_V3.every((byte, index) => prefix[index] === byte)) {
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
  const readRange = createRangeReader(file, file.size);
  let offset = 12 + length;
  for (const layer of drawing.layers)
    for (const [key, ref] of layer.tiles) {
      const packed = await readRange(offset, offset + ref.byteLength);
      offset += ref.byteLength;
      const pixels = packTile(unpackTile(packed));
      layer.tiles.set(key, await capture(pixels));
    }
  return drawing;
}

/**
 * Reads a version 4 to 7 drawing: the trailer, the metadata and its tile index, then each indexed tile once. Version
 * 4 metadata is a flat version 3 document, version 5 a version 4 one with folders, version 6 a version 5 one and
 * version 7 a version 6 one with masks. A tile is validated as the plane that lists it, pixels or coverage.
 */
async function readIndexed(file: Blob, version: 4 | 5 | 6 | 7, capture: (pixels: Uint8Array) => Promise<TileData>) {
  if (file.size < MAGIC_V4.byteLength + TRAILER_BYTES) throw new Error('Truncated drawing.');
  const trailer = new DataView(await file.slice(file.size - TRAILER_BYTES).arrayBuffer());
  const end = new Uint8Array(trailer.buffer, 12, 4);
  if (!TRAILER_MAGIC.every((byte, index) => end[index] === byte)) throw new Error('Truncated drawing.');
  const offset = Number(trailer.getBigUint64(0, true));
  const length = trailer.getUint32(8, true);
  if (length > MAX_HEADER || offset < MAGIC_V4.byteLength || offset + length + TRAILER_BYTES !== file.size)
    throw new Error('Invalid drawing header size.');
  const value: unknown = JSON.parse(await file.slice(offset, offset + length).text());
  const indexed = indexSchema.parse(value);
  if (indexed.version !== version) throw new Error('Unsupported binary drawing version.');
  for (const [entry, tile] of indexed.tiles.entries()) {
    const previous = indexed.tiles[entry - 1];
    if (
      tile.offset !== (previous ? previous.offset + previous.length : MAGIC_V4.byteLength) ||
      tile.offset + tile.length > offset
    )
      throw new Error('Truncated or oversized drawing payload.');
  }

  // Validated as a checkpoint whose tiles are references, then filled in from the index.
  const saved = (value as { layers: { id?: unknown; mask?: object }[] }).layers;
  const placeholders = (tiles: readonly { key: string; tile: number }[]) =>
    tiles.map(({ key, tile }) => ({
      key,
      pixels: { storageId: PLACEHOLDER_ID, byteLength: indexed.tiles[tile]!.byteLength }
    }));
  const drawing = restoreDocument({
    ...(value as object),
    version: version - 1,
    layers: indexed.layers.map((layer, index) => ({
      ...saved[index],
      ...(layer.tiles ? { tiles: placeholders(layer.tiles) } : {}),
      ...(layer.mask && saved[index]?.mask
        ? { mask: { ...saved[index].mask, tiles: placeholders(layer.mask.tiles) } }
        : {})
    }))
  });
  // Restoring puts the nodes in canonical order, so the index is matched by id, which it has checked are unique.
  const tilesOf = new Map(indexed.layers.map((layer, index) => [saved[index]!.id, layer]));
  const readRange = createRangeReader(file, offset);
  /** Captured versions by index entry, for pixels and for coverage apart. */
  const captured = { pixels: new Map<number, TileData>(), coverage: new Map<number, TileData>() };
  const load = async (tile: number, plane: keyof typeof captured) => {
    let pixels = captured[plane].get(tile);
    if (!pixels) {
      const { offset: start, length: size, byteLength } = indexed.tiles[tile]!;
      const packed = await restoreTile(await readRange(start, start + size));
      if (packed.byteLength !== byteLength) throw new Error('A tile of the drawing is damaged.');
      pixels = await capture(plane === 'pixels' ? packTile(unpackTile(packed)) : packMaskTile(unpackMaskTile(packed)));
      captured[plane].set(tile, pixels);
    }

    return pixels;
  };
  for (const node of drawing.nodes) {
    const listed = tilesOf.get(node.id)!;
    if (node.kind !== 'group') {
      for (const { key, tile } of listed.tiles ?? []) node.tiles.set(key, await load(tile, 'pixels'));
    }

    if (node.mask) {
      // Coverage tiles of only `outside` are left out by `restoreDocument`; those listed are read.
      const kept = new Set(node.mask.tiles.keys());
      node.mask.tiles.clear();
      for (const { key, tile } of listed.mask?.tiles ?? []) {
        if (kept.has(key)) node.mask.tiles.set(key, await load(tile, 'coverage'));
      }
    }
  }

  return drawing;
}

/**
 * Reads byte ranges of `file` below `limit` through one window of at least `RANGE_WINDOW_BYTES`, refilled from the
 * requested start whenever a range falls outside it. Every Blob read has a fixed cost, about 70 ms for a file chosen
 * on Android Chrome, so reading thousands of tiles one slice at a time took minutes; tiles are written in the order
 * they are read, so one window serves many of them. Returns a copy, so a kept tile does not retain the window.
 */
function createRangeReader(file: Blob, limit: number) {
  let windowStart = 0;
  let window = new Uint8Array(0);
  return async (start: number, end: number) => {
    if (start < windowStart || end > windowStart + window.byteLength) {
      windowStart = start;
      window = new Uint8Array(
        await file.slice(start, Math.min(limit, Math.max(end, start + RANGE_WINDOW_BYTES))).arrayBuffer()
      );
    }

    return window.slice(start - windowStart, end - windowStart);
  };
}

/** A plane's tiles in the index: each key and the index entry holding its pixels. */
const indexedTiles = z.array(z.object({ key: z.string(), tile: z.number().int().nonnegative() }));

/**
 * The version 4 to 7 tile index and the layers' references into it; the rest is validated by `restoreDocument`. A
 * folder has no `tiles`.
 */
const indexSchema = z
  .object({
    version: z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
    tiles: z.array(
      z.object({
        offset: z.number().int().nonnegative(),
        length: z.number().int().positive().max(TILE_BYTES),
        byteLength: z.number().int().min(8).max(TILE_BYTES)
      })
    ),
    layers: z.array(
      z.object({
        tiles: indexedTiles.optional(),
        mask: z.object({ tiles: indexedTiles }).optional()
      })
    )
  })
  .refine(
    ({ tiles, layers }) =>
      layers.every((layer) =>
        [...(layer.tiles ?? []), ...(layer.mask?.tiles ?? [])].every(({ tile }) => tile < tiles.length)
      ),
    {
      message: 'A layer refers to a missing tile.'
    }
  );

const MAGIC_V3 = new TextEncoder().encode('PAINT3\r\n');
const MAGIC_V4 = new TextEncoder().encode('PAINT4\r\n');
const MAGIC_V5 = new TextEncoder().encode('PAINT5\r\n');
const MAGIC_V6 = new TextEncoder().encode('PAINT6\r\n');
const MAGIC_V7 = new TextEncoder().encode('PAINT7\r\n');
/** The metadata's offset (64 bits), its length (32 bits), then this end marker. */
const TRAILER_MAGIC = new TextEncoder().encode('P4IX');
const TRAILER_BYTES = 16;
const MAX_HEADER = 32 * 1048576;
const RANGE_WINDOW_BYTES = 8 * 1048576;
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
