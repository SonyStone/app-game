import { describe, expect, it } from 'vitest';
import { claimAtlasSlot, encodeTileLookup, type ResidentTile } from './atlasSlots';
import { lookupSize, tileAddress, tileHash, type Tile } from './virtualTiles';

describe('claimAtlasSlot', () => {
  it('uses free slots before evicting', () => {
    const resident = new Map([['a', entry(0, 0)]]);

    expect(claimAtlasSlot([3, 7], resident, new Map())).toBe(7);
    expect(resident.size).toBe(1);
  });

  it('evicts the least recently used unwanted tile, preferring the oldest insertion on ties', () => {
    const resident = new Map([
      ['wanted', entry(0, 1)],
      ['first', entry(1, 5)],
      ['second', entry(2, 5)],
      ['recent', entry(3, 9)]
    ]);

    expect(claimAtlasSlot([], resident, new Map([['wanted', undefined]]))).toBe(1);
    expect([...resident.keys()]).toEqual(['wanted', 'second', 'recent']);
  });

  it('claims nothing while every resident tile is wanted', () => {
    const resident = new Map([['a', entry(0, 0)]]);

    expect(claimAtlasSlot([], resident, resident)).toBeUndefined();
    expect(resident.size).toBe(1);
  });
});

describe('encodeTileLookup', () => {
  it('stores image, address and atlas cell, probing linearly past collisions', () => {
    const tile: Tile = { image: 4, level: 1, x: 2, y: 3 };
    const entries = encodeTileLookup(
      [
        { tile, slot: 33, used: 0 },
        { tile, slot: 5, used: 0 }
      ],
      31
    );
    const hash = tileHash(tile.image, tileAddress(tile));
    const next = (hash + 1) & (lookupSize - 1);

    expect(entries).toHaveLength(lookupSize * 4);
    expect([...entries.subarray(hash * 4, hash * 4 + 4)]).toEqual([5, tileAddress(tile), 2, 1]);
    expect([...entries.subarray(next * 4, next * 4 + 4)]).toEqual([5, tileAddress(tile), 5, 0]);
  });
});

function entry(slot: number, used: number): ResidentTile {
  return { tile: { image: 0, level: 0, x: slot, y: 0 }, slot, used };
}
