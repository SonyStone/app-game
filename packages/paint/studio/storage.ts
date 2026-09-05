import { z } from 'zod';
import { TILE_SIZE } from './brush';
import type { Camera } from './camera';
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_TILES, TILE_BYTES, type Layer } from './document';
import { packTile, unpackTile } from './tilePixels';

/** Versioned on-disk format. Tile pixels remain premultiplied; no lossy image conversion occurs. */
export type SavedDocument = ReturnType<typeof snapshotDocument>;

/** Copies metadata while sharing immutable committed tile snapshots. */
export function snapshotDocument(layers: Layer[], activeId: string, camera: Camera) {
  return {
    version: 2 as const,
    tileSize: TILE_SIZE,
    activeId,
    camera: { ...camera },
    layers: layers.map(({ tiles, ...layer }) => ({
      ...layer,
      tiles: [...tiles].map(([key, pixels]) => ({ key, pixels }))
    }))
  };
}

/** Validates imported/local data before replacing the current document. */
export function restoreDocument(value: unknown): { layers: Layer[]; activeId: string; camera: Camera } {
  const parsed = savedSchema.parse(value);
  if (
    new Set(parsed.layers.map((l) => l.id)).size !== parsed.layers.length ||
    !parsed.layers.some((l) => l.id === parsed.activeId)
  )
    throw new Error('Invalid layer identifiers.');
  let bytes = 0,
    count = 0;
  const layers = parsed.layers.map((layer) => {
    if (new Set(layer.tiles.map((t) => t.key)).size !== layer.tiles.length)
      throw new Error('Duplicate tile coordinates.');
    const tiles = new Map(
      layer.tiles.map((tile) => {
        if (parsed.version === 1 && tile.pixels.byteLength !== TILE_BYTES) throw new Error('Invalid tile length.');
        if (parsed.version !== 3 && !(tile.pixels instanceof Uint8Array))
          throw new Error('Unexpected external tile reference.');
        const pixels = tile.pixels instanceof Uint8Array ? packTile(unpackTile(tile.pixels)) : tile.pixels;
        bytes += pixels.byteLength;
        if (++count > MAX_DOCUMENT_TILES) throw new Error('Too many tiles in this document.');
        if (parsed.version !== 3 && bytes > MAX_DOCUMENT_BYTES)
          throw new Error('This document exceeds the 256 MiB import limit.');
        return [tile.key, pixels] as const;
      })
    );
    return { ...layer, tiles };
  });
  return { layers, activeId: parsed.activeId, camera: parsed.camera };
}

/** Encodes a portable JSON document. Large tile arrays are stored as base64, not JSON numbers. */
export function encodeDocument(document: SavedDocument): string {
  return JSON.stringify({
    ...document,
    layers: document.layers.map((layer) => ({
      ...layer,
      tiles: layer.tiles.map((tile) => {
        if (!(tile.pixels instanceof Uint8Array)) throw new Error('Materialize tile references before exporting.');
        return { key: tile.key, pixels: toBase64(tile.pixels) };
      })
    }))
  });
}

/** Decodes an external file and rejects malformed pixels and unsupported versions. */
export function decodeDocument(text: string): ReturnType<typeof restoreDocument> {
  if (text.length > MAX_DOCUMENT_BYTES * 1.5) throw new Error('The selected file is too large.');
  const value: unknown = JSON.parse(text, (key, value: unknown) => {
    if (key !== 'pixels' || typeof value !== 'string') return value;
    if (!value.length || value.length > Math.ceil(TILE_BYTES / 3) * 4) throw new Error('Invalid tile encoding.');
    const raw = atob(value);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  });
  if (typeof value === 'object' && value && 'version' in value && value.version === 3)
    throw new Error('Internal checkpoint format is not a portable drawing.');
  return restoreDocument(value);
}

/** Stores a complete checkpoint in one IndexedDB transaction. A failed write keeps the last checkpoint. */
export async function saveCheckpoint(document: SavedDocument, databaseName = 'paint-studio'): Promise<void> {
  const db = await openDatabase(databaseName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(document, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Autosave failed.'));
    });
  } finally {
    db.close();
  }
}

/** Loads the last committed document. Missing storage yields a new document; corrupt data is surfaced. */
export async function loadCheckpoint(
  databaseName = 'paint-studio'
): Promise<ReturnType<typeof restoreDocument> | undefined> {
  const db = await openDatabase(databaseName);
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value === undefined ? undefined : restoreDocument(value);
  } finally {
    db.close();
  }
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents');
      if (!request.result.objectStoreNames.contains('tiles')) request.result.createObjectStore('tiles');
      if (!request.result.objectStoreNames.contains('overviews')) request.result.createObjectStore('overviews');
      if (!request.result.objectStoreNames.contains('overviewIndex')) request.result.createObjectStore('overviewIndex');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function toBase64(pixels: Uint8Array): string {
  let text = '';
  for (let i = 0; i < pixels.length; i += 8192) text += String.fromCharCode(...pixels.subarray(i, i + 8192));
  return btoa(text);
}
const finite = z.number().finite();
const unit = finite.min(0).max(1);
const savedSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  tileSize: z.literal(TILE_SIZE),
  activeId: z.string(),
  camera: z.object({ x: finite, y: finite, zoom: finite.min(0.05).max(32), angle: finite, mirrored: z.boolean() }),
  layers: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().max(200),
        visible: z.boolean(),
        opacity: unit,
        blend: z.enum(['normal', 'multiply', 'screen', 'overlay', 'linear']),
        tiles: z
          .array(
            z.object({
              key: z.string().regex(/^-?\d{1,9},-?\d{1,9}$/),
              pixels: z.union([
                z.instanceof(Uint8Array),
                z.object({ storageId: z.string().uuid(), byteLength: z.number().int().min(8).max(TILE_BYTES) })
              ])
            })
          )
          .max(MAX_DOCUMENT_TILES)
      })
    )
    .min(1)
    .max(128)
});
