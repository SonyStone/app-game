import { lookupSize, tileAddress, tileHash, type Tile } from './virtualTiles';

/** A detail tile resident in the image atlas; `used` is the last update clock whose working set wanted it. */
export type ResidentTile = { tile: Tile; slot: number; used: number };

/**
 * Claims an atlas slot for a newly decoded tile: a free slot first, otherwise the least recently used resident
 * tile outside the `wanted` working set, which is removed from `resident` (ties evict the oldest insertion).
 * Returns `undefined`, claiming nothing, when every resident tile is still wanted.
 */
export function claimAtlasSlot(
  free: number[],
  resident: Map<string, ResidentTile>,
  wanted: ReadonlyMap<string, unknown>
): number | undefined {
  const slot = free.pop();

  if (slot !== undefined) {
    return slot;
  }

  let oldest: [string, ResidentTile] | undefined;

  for (const entry of resident) {
    if (!wanted.has(entry[0]) && (!oldest || entry[1].used < oldest[1].used)) {
      oldest = entry;
    }
  }

  if (!oldest) {
    return undefined;
  }

  resident.delete(oldest[0]);
  return oldest[1].slot;
}

/**
 * Encodes resident tiles into the shader's open-addressed lookup table: per entry `image + 1` (zero marks an
 * empty entry), the packed tile address, and the slot's atlas column and row. Collisions probe linearly.
 */
export function encodeTileLookup(resident: Iterable<ResidentTile>, columns: number) {
  const entries = new Uint32Array(lookupSize * 4);

  for (const { tile, slot } of resident) {
    const address = tileAddress(tile);
    let hash = tileHash(tile.image, address);

    while (entries[hash * 4]) {
      hash = (hash + 1) & (lookupSize - 1);
    }

    entries.set([tile.image + 1, address, slot % columns, Math.floor(slot / columns)], hash * 4);
  }

  return entries;
}
