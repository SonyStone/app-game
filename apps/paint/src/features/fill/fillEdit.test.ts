import type { Layer } from '@app-game/paint-core/document';
import { expect, it } from 'vitest';
import { fillEdit, type FillCommand } from './fillEdit';
import { expandMask, floodMask } from './floodFill';

it('fills the connected area inside a closed outline, spanning tiles, and stays inside the area', () => {
  // A 300 px square outline across four tiles, with a 1 px gap in its top edge at x = 150 closed or open.
  const tiles = outline(0, 0, 300, 300);
  const area = { left: -100, top: -100, width: 600, height: 600 };
  const inside = floodMask(area, tiles, { x: 150, y: 150 }, 0);
  expect(at(inside, area, 150, 150)).toBe(1);
  expect(at(inside, area, 1, 1)).toBe(1);
  expect(at(inside, area, 0, 150)).toBe(0);
  expect(at(inside, area, 350, 150)).toBe(0);
  expect(count(inside)).toBe(298 * 298);

  // Outside fills everything around the outline, up to the edges of the area.
  const outside = floodMask(area, tiles, { x: -50, y: -50 }, 0);
  expect(count(outside)).toBe(600 * 600 - 300 * 300);
  // A seed outside the area fills nothing.
  expect(count(floodMask(area, tiles, { x: 900, y: 0 }, 0))).toBe(0);
});

it('treats colors within the tolerance as the same, and grows the filled area', () => {
  const tiles = outline(0, 0, 10, 10, [40, 40, 40, 40]);
  const area = { left: 0, top: 0, width: 20, height: 20 };
  // A translucent outline (alpha 40) holds a fill at tolerance 0 and lets it through at tolerance 40.
  expect(count(floodMask(area, tiles, { x: 5, y: 5 }, 0))).toBe(64);
  expect(count(floodMask(area, tiles, { x: 5, y: 5 }, 40))).toBe(400);

  const grown = expandMask(floodMask(area, tiles, { x: 5, y: 5 }, 0), 20, 20, 1);
  expect(count(grown)).toBe(100);
  expect(expandMask(grown, 20, 20, 0)).toBe(grown);
});

it('fills the active layer by the active layer or all visible layers, over its existing pixels', async () => {
  const lines: Layer = layer('lines', outline(0, 0, 20, 20));
  const paint: Layer = layer('paint', new Map());
  const read = async (pixels: unknown) => pixels as Uint8Array;
  const state = { get: () => undefined, set: () => {} };
  const floating = { show: () => {}, move: () => {}, clear: async () => {} };
  const fill = (command: Partial<FillCommand>) =>
    fillEdit.run(
      { layers: [paint, lines], active: paint, readTile: read, state, floating },
      { ...fillCommand(), ...command }
    );

  // Judged on the empty paint layer alone, the fill covers the whole view area.
  const layerFill = await fill({ source: 'layer' });
  expect(layerFill.changes.map(({ key }) => key)).toEqual(['0,0']);
  expect(count(alphaMask(layerFill.changes[0]!.after as Uint8Array))).toBe(40 * 40);

  // Judged on all layers, it stays inside the line art of the layer above, at half opacity.
  const allFill = await fill({ source: 'all', opacity: 0.5 });
  const pixels = allFill.changes[0]!.after as Uint8Array;
  expect(count(alphaMask(pixels))).toBe(18 * 18);
  expect([...pixels.subarray(index(5, 5), index(5, 5) + 4)]).toEqual([128, 0, 0, 128]);

  await expect(
    fillEdit.run(
      { layers: [paint], active: { ...paint, visible: false }, readTile: read, state, floating },
      fillCommand()
    )
  ).rejects.toThrow('Show the active layer');

  // A solid layer clipped to the line art shows only as the outline, so the fill still stops at it.
  const solid: Layer = {
    ...layer('solid', new Map([['0,0', new Uint8Array(256 * 256 * 4).fill(255)]])),
    clipping: true
  };
  const clippedFill = await fillEdit.run(
    { layers: [paint, lines, solid], active: paint, readTile: read, state, floating },
    { ...fillCommand(), source: 'all' }
  );
  expect(count(alphaMask(clippedFill.changes[0]!.after as Uint8Array))).toBe(18 * 18);

  // With alpha lock, only the layer's own pixels change color, keeping their alpha.
  const line = layer('line', outline(0, 0, 20, 20, [0, 0, 0, 128]));
  const locked = await fillEdit.run(
    { layers: [{ ...line, alphaLock: true }], active: { ...line, alphaLock: true }, readTile: read, state, floating },
    { ...fillCommand(), point: { x: 0, y: 0 }, tolerance: 0, source: 'layer' }
  );
  const recolored = locked.changes[0]!.after as Uint8Array;
  expect(count(alphaMask(recolored))).toBe(76);
  expect([...recolored.subarray(index(0, 0), index(0, 0) + 4)]).toEqual([128, 0, 0, 128]);

  // In a view wider than the fill limit, a closed shape still fills, but open paper is refused rather than cut off.
  const wide = { left: -5000, top: -5000, width: 10000, height: 10000 };
  expect((await fill({ area: wide })).changes).toHaveLength(1);
  await expect(fill({ area: wide, point: { x: -100, y: -100 } })).rejects.toThrow('too large to fill');
  expect(() => fillEdit.command({ ...fillCommand(), color: 'red' })).toThrow();
});

it('stays inside the lasso selection, also when it grows under edges, and fills nothing outside it', async () => {
  const paint: Layer = layer('paint', new Map());
  const run = (command: Partial<FillCommand>) =>
    fillEdit.run(
      {
        layers: [paint],
        active: paint,
        readTile: async (pixels) => pixels as Uint8Array,
        state: { get: () => undefined, set: () => {} },
        floating: { show: () => {}, move: () => {}, clear: async () => {} }
      },
      { ...fillCommand(), source: 'layer', expand: 4, ...command }
    );
  const points = [
    { x: 2, y: 2 },
    { x: 12, y: 2 },
    { x: 12, y: 8 },
    { x: 2, y: 8 }
  ];

  const inside = await run({ points, point: { x: 5, y: 5 } });
  expect(count(alphaMask(inside.changes[0]!.after as Uint8Array))).toBe(10 * 6);
  expect((await run({ points, point: { x: 30, y: 30 } })).changes).toEqual([]);
});

function fillCommand(): FillCommand {
  return {
    point: { x: 5.5, y: 5.2 },
    area: { left: 0, top: 0, width: 40, height: 40 },
    color: '#ff0000',
    opacity: 1,
    tolerance: 0,
    expand: 0,
    source: 'all'
  };
}

/** One-pixel square outline with corners (left, top) and (left + size - 1, top + size - 1), in RGBA tiles. */
function outline(left: number, top: number, width: number, height: number, rgba = [0, 0, 0, 255]) {
  const tiles = new Map<string, Uint8Array>();
  const set = (x: number, y: number) => {
    const key = `${Math.floor(x / 256)},${Math.floor(y / 256)}`;
    const tile = tiles.get(key) ?? new Uint8Array(256 * 256 * 4);
    tiles.set(key, tile);
    tile.set(rgba, (((y % 256) + 256) % 256) * 1024 + (((x % 256) + 256) % 256) * 4);
  };
  for (let i = 0; i < width; i++) {
    set(left + i, top);
    set(left + i, top + height - 1);
  }

  for (let i = 0; i < height; i++) {
    set(left, top + i);
    set(left + width - 1, top + i);
  }

  return tiles;
}

function layer(id: string, tiles: Map<string, Uint8Array>): Layer {
  return { id, name: id, visible: true, opacity: 1, blend: 'normal', tiles };
}

function at(mask: Uint8Array, area: { left: number; top: number; width: number }, x: number, y: number) {
  return mask[(y - area.top) * area.width + (x - area.left)];
}

function count(mask: Uint8Array) {
  return mask.reduce((sum, value) => sum + value, 0);
}

function alphaMask(tile: Uint8Array) {
  return Uint8Array.from({ length: 256 * 256 }, (_, pixel) => (tile[pixel * 4 + 3]! > 0 ? 1 : 0));
}

function index(x: number, y: number) {
  return (y * 256 + x) * 4;
}
