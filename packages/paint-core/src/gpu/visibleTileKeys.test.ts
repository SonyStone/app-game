import { describe, expect, it } from 'vitest';
import { visibleTileKeys } from './visibleTileKeys';

const pixels = new Uint8Array(0);
describe('bounded redraw tile selection', () => {
  it('matches exhaustive selection across sparse/dense redraws, negative coordinates and streamed layers', () => {
    const layer = { id: 'layer/one', tiles: new Map<string, Uint8Array>() };
    const active = new Map<string, unknown>();
    const tail = new Map<string, unknown>();
    for (let y = -20; y <= 20; y++) for (let x = -20; x <= 20; x++) {
      const key = `${x},${y}`;
      if ((x + y) % 3 === 0) layer.tiles.set(key, pixels);
      if ((x - y) % 4 === 0) active.set(`${layer.id}/${key}`, {});
      if ((x + y) % 7 === 0) tail.set(key, {});
    }
    for (const streamed of [false, true]) for (const includeActive of [false, true])
      for (const extent of [0, 10, 256, 512, 10000]) for (const origin of [-512, -256.5, 0, 17]) {
        const bounds = { minX: origin, minY: origin, maxX: origin + extent, maxY: origin + extent };
        const keys = new Set(streamed ? [] : layer.tiles.keys());
        if (includeActive) {
          for (const id of active.keys()) keys.add(id.slice(layer.id.length + 1));
          for (const key of tail.keys()) keys.add(key);
        }
        const expected = [...keys].filter(key => {
          const [x, y] = key.split(',').map(Number) as [number, number];
          return (x + 1) * 256 >= bounds.minX && x * 256 <= bounds.maxX &&
            (y + 1) * 256 >= bounds.minY && y * 256 <= bounds.maxY;
        });
        expect(visibleTileKeys(layer, includeActive ? active : undefined, includeActive ? tail : undefined,
          streamed, bounds).sort()).toEqual(expected.sort());
      }
  });
  it('does not enumerate a long active stroke for a small redraw', () => {
    const active = new Map(Array.from({ length: 5000 }, (_, i) => [`layer/${i},0`, {}] as const));
    active.keys = () => { throw new Error('Full stroke scan'); };
    expect(visibleTileKeys({ id: 'layer', tiles: new Map() }, active, undefined, true,
      { minX: 2561, maxX: 2570, minY: 1, maxY: 10 })).toEqual(['10,0']);
  });
});
