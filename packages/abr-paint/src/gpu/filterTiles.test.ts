import { expect, it } from 'vitest';
import { filterTiles } from './filterTiles';

it('keeps every original halo available until its last reader, including sparse negative tiles', () => {
  const keys = ['0,0', '-1,0', '0,-1', '2,1', '1,1', '-1,-1', '10,10', '0,0'];
  const unread = new Set(keys),
    pending = new Set<string>(),
    written = new Set<string>();
  for (const { key, release } of filterTiles(keys)) {
    const [x, y] = key.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) expect(written.has(`${x! + dx},${y! + dy}`)).toBe(false);
    unread.delete(key);
    pending.add(key);
    for (const output of release) {
      expect(pending.delete(output)).toBe(true);
      expect(unread.has(output)).toBe(false);
      written.add(output);
    }
  }
  expect(pending.size).toBe(0);
  expect(written).toEqual(new Set(keys));
});

it('holds a row frontier instead of the whole large-brush footprint', () => {
  const width = 32;
  const keys = Array.from({ length: width * width }, (_, i) => `${i % width},${Math.floor(i / width)}`);
  let count = 0,
    peak = 0;
  for (const { release } of filterTiles(keys.reverse())) {
    count++;
    peak = Math.max(peak, count);
    count -= release.length;
  }
  expect(count).toBe(0);
  expect(peak).toBeLessThanOrEqual(width * 2 + 3);
});
