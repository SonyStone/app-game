import { expect, it } from 'vitest';
import { createDocument, TILE_BYTES } from './document';
import { createRegionHistory } from './regionHistory';
import { areaSelection, expandSelection, polygonSelection, strokeSelection, coverageAt } from './selectionMask';
import { unpackTile, type TileData } from './tilePixels';

const read = async (pixels: TileData) => unpackTile(pixels);

it('finds the steps that changed pixels inside a region, comparing pixels exactly, newest first', async () => {
  const document = createDocument();
  const layer = document.active.id;
  // Step 1 paints (10, 10); step 2 paints (200, 200) in the same tile; step 3 paints (10, 10) again.
  paint(document, layer, '0,0', [[10, 10, red]]);
  paint(document, layer, '0,0', [[200, 200, red]]);
  paint(document, layer, '0,0', [[10, 10, blue]]);
  const history = createRegionHistory(read);
  const corner = square(0, 0, 50);

  // Step 2 rewrote the whole tile, yet left the corner's pixels as they were, so it does not touch it.
  expect(await history.touching(document.undoSteps(), layer, corner)).toEqual([0, 2]);
  expect(await history.touching(document.undoSteps(), layer, square(190, 190, 20))).toEqual([1]);
  expect(await history.touching(document.undoSteps(), layer, square(100, 100, 20))).toEqual([]);

  // Only the tiles named are compared.
  expect(await history.touches(document.undoSteps()[0]!, layer, corner, new Set(['1,0']))).toBe(false);
});

it('skips steps of other layers and steps that changed no pixels, such as layer properties', async () => {
  const document = createDocument();
  const first = document.active.id;
  paint(document, first, '0,0', [[5, 5, red]]);
  document.changeLayer({ type: 'add' });
  const second = document.active.id;
  paint(document, second, '0,0', [[5, 5, blue]]);
  document.changeLayer({ type: 'update', id: first, patch: { blend: 'multiply', opacity: 0.5 } });
  // A step that writes the same pixels again changes nothing.
  const same = document.layers.find(({ id }) => id === first)!.tiles.get('0,0')!;
  document.commit([{ layerId: first, key: '0,0', before: same, after: unpackTile(same).slice() }]);

  const history = createRegionHistory(read);
  const region = square(0, 0, 10);
  expect(document.undoSteps().map(({ id }) => id)).toEqual([5, 4, 3, 2, 1]);
  expect(await history.touching(document.undoSteps(), first, region)).toEqual([4]);
  expect(await history.touching(document.undoSteps(), second, region)).toEqual([2]);
});

it('treats a layer that did not exist before a step as transparent there', async () => {
  const document = createDocument();
  paint(document, document.active.id, '0,0', [[3, 3, red]]);
  document.changeLayer({ type: 'duplicate', id: document.active.id });
  const copy = document.active;
  paint(document, copy.id, '0,0', [[4, 4, blue]]);

  const history = createRegionHistory(read);
  const region = square(0, 0, 8);
  // The duplicate step brought the copied pixels into the new layer.
  expect(await history.touching(document.undoSteps(), copy.id, region)).toEqual([0, 1]);
  const past = await history.past(document.undoSteps(), document.active, [{ region, depth: 1 }]);
  expect(past.has('0,0')).toBe(true);
  expect(past.get('0,0')).toBeUndefined();
});

it('returns parts to the state before a step in proportion to their coverage, the deepest part deciding overlaps', async () => {
  const document = createDocument();
  const layer = document.active.id;
  paint(document, layer, '0,0', [
    [1, 1, red],
    [2, 1, red],
    [3, 1, red]
  ]);
  paint(document, layer, '0,0', [
    [1, 1, blue],
    [2, 1, blue],
    [3, 1, blue]
  ]);
  paint(document, layer, '0,0', [[3, 1, green]]);
  const history = createRegionHistory(read);
  const steps = document.undoSteps();

  // Half coverage at (1, 1) moves blue halfway back to red; (2, 1) goes fully back; (3, 1) is outside the region.
  const soft = areaSelection({ left: 1, top: 1, width: 2, height: 1 }, Uint8Array.of(128, 255));
  const past = await history.past(steps, document.active, [{ region: soft, depth: 1 }]);
  const pixels = past.get('0,0')!;
  expect(pixel(pixels, 1, 1)).toEqual([128, 0, 127, 255]);
  expect(pixel(pixels, 2, 1)).toEqual(red);
  expect(pixel(pixels, 3, 1)).toEqual(green);

  // Overlapping parts: (3, 1) is in both; the part returning before step 1 (the deepest) wins there.
  const parts = [
    { region: square(1, 1, 3, 1), depth: 0 },
    { region: square(3, 1, 1, 1), depth: 2 }
  ];
  const overlapped = (await history.past(steps, document.active, parts)).get('0,0')!;
  expect(pixel(overlapped, 1, 1)).toEqual(blue);
  expect(pixel(overlapped, 3, 1)).toEqual([0, 0, 0, 0]);

  // Parts that change nothing return no tiles.
  expect((await history.past(steps, document.active, [{ region: square(50, 50, 4), depth: 2 }])).size).toBe(0);
});

it('finds a step under a point and the pixels it changed, and grows regions by whole pixels', async () => {
  const document = createDocument();
  const layer = document.active.id;
  paint(document, layer, '0,0', [[255, 10, red]]);
  paint(document, layer, '1,0', [[256, 10, blue]]);
  const history = createRegionHistory(read);
  const [newest, oldest] = document.undoSteps();

  expect(await history.changedAt(newest!, layer, { x: 256.5, y: 10.2 })).toBe(true);
  expect(await history.changedAt(newest!, layer, { x: 255.5, y: 10.2 })).toBe(false);
  expect(await history.changedAt(oldest!, layer, { x: 255.5, y: 10.2 })).toBe(true);

  // Grown by a pixel, the change reaches across the tile edge, diagonals included.
  const changed = expandSelection(await history.changedRegion(newest!, layer), 1);
  expect([...changed.tiles.keys()].sort()).toEqual(['0,0', '1,0']);
  expect(coverageAt(changed, 255, 9)).toBe(255);
  expect(coverageAt(changed, 257, 11)).toBe(255);
  expect(coverageAt(changed, 258, 10)).toBe(0);
});

it('covers a soft round brush along points, full inside its hardness and fading to its radius', () => {
  const stroke = strokeSelection(
    [
      { x: 10, y: 10, radius: 4 },
      { x: 40, y: 10, radius: 8 }
    ],
    0.5
  );
  expect(coverageAt(stroke, 10, 10)).toBe(255);
  expect(coverageAt(stroke, 25, 10)).toBe(255);
  expect(coverageAt(stroke, 40, 16)).toBeGreaterThan(0);
  expect(coverageAt(stroke, 40, 16)).toBeLessThan(255);
  expect(coverageAt(stroke, 40, 19)).toBe(0);
  expect(coverageAt(stroke, 10, 14)).toBe(0);

  // A single point is one dab; a hard brush keeps full coverage up to the last pixel inside its radius.
  const hard = strokeSelection([{ x: 0, y: 0, radius: 10 }], 1);
  expect(coverageAt(hard, 0, 0)).toBe(255);
  expect(coverageAt(hard, 9, 0)).toBeGreaterThan(0);
  expect(coverageAt(hard, 10, 0)).toBe(0);
  expect(() => strokeSelection([], 1)).toThrow();
});

const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const blue = [0, 0, 255, 255];

/** Commits a step that sets pixels of a tile, keeping its other pixels. */
function paint(
  document: ReturnType<typeof createDocument>,
  layerId: string,
  key: string,
  pixels: [x: number, y: number, rgba: number[]][]
) {
  const before = document.layers.find(({ id }) => id === layerId)!.tiles.get(key);
  const after = before ? unpackTile(before).slice() : new Uint8Array(TILE_BYTES);
  for (const [x, y, rgba] of pixels) {
    after.set(rgba, ((y % 256) * 256 + (x % 256)) * 4);
  }

  document.commit([{ layerId, key, before, after }]);
}

/** A fully covered rectangle, `height` defaulting to `width`. */
function square(left: number, top: number, width: number, height = width) {
  return polygonSelection([
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height }
  ]);
}

function pixel(tile: Uint8Array, x: number, y: number) {
  return [...tile.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
}
