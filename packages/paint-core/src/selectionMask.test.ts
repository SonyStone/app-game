import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from './brush';
import {
  areaCoverage,
  combineSelections,
  coverageAt,
  emptySelection,
  featherSelection,
  hitsSelection,
  invertSelection,
  isSelected,
  polygonSelection,
  selectionBounds,
  summarizeSelection,
  tileCoverage,
  translateSelection,
  wholeSelection,
  type SelectionMask
} from './selectionMask';

describe('selection masks', () => {
  it('selects the pixels whose centers lie inside a polygon, by the even-odd rule', () => {
    const square = rectangle(10, 20, 30, 40);
    expect(coverageAt(square, 10, 20)).toBe(255);
    expect(coverageAt(square, 29, 39)).toBe(255);
    expect(coverageAt(square, 30, 20)).toBe(0);
    expect(coverageAt(square, 9, 25)).toBe(0);
    expect(selectionBounds(square)).toEqual({ left: 10, top: 20, right: 30, bottom: 40 });

    // A bow tie crosses itself; its center is in both halves.
    const tie = polygonSelection([
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 20, y: 0 },
      { x: 0, y: 20 }
    ]);
    expect(coverageAt(tie, 2, 10)).toBe(255);
    expect(coverageAt(tie, 10, 2)).toBe(0);
    expect(() => polygonSelection([{ x: 0, y: 0 }])).toThrow();
  });

  it('adds, subtracts and intersects shapes, and keeps no tiles that select nothing', () => {
    const a = rectangle(0, 0, 100, 100),
      b = rectangle(50, 0, 400, 100);
    const added = combineSelections(a, b, 'add');
    expect(selectionBounds(added)).toEqual({ left: 0, top: 0, right: 400, bottom: 100 });
    expect(added.tiles.size).toBe(2);

    const subtracted = combineSelections(a, b, 'subtract');
    expect(selectionBounds(subtracted)).toEqual({ left: 0, top: 0, right: 50, bottom: 100 });
    expect(subtracted.tiles.size).toBe(1);

    const intersected = combineSelections(a, b, 'intersect');
    expect(selectionBounds(intersected)).toEqual({ left: 50, top: 0, right: 100, bottom: 100 });

    expect(combineSelections(a, a, 'subtract')).toEqual(emptySelection);
    expect(combineSelections(a, b, 'replace')).toBe(b);
  });

  it('inverts across the endless canvas, and Select All less a shape is that shape inverted', () => {
    const square = rectangle(0, 0, 10, 10);
    const inverted = invertSelection(square);
    expect(coverageAt(inverted, 5, 5)).toBe(0);
    expect(coverageAt(inverted, 5000, -9000)).toBe(255);
    expect(selectionBounds(inverted)).toBeUndefined();
    expect(isSelected(inverted)).toBe(true);
    expect(combineSelections(wholeSelection, square, 'subtract')).toEqual(inverted);
    expect(invertSelection(inverted)).toEqual(square);
    expect(tileCoverage(inverted, 3, 3)).toEqual({ kind: 'inside' });
    expect(tileCoverage(inverted, 0, 0).kind).toBe('partial');
  });

  it('moves by whole pixels across tile edges and by whole tiles', () => {
    const square = rectangle(250, 250, 260, 260);
    const moved = translateSelection(square, { x: -251.4, y: 6.6 });
    expect(selectionBounds(moved)).toEqual({ left: -1, top: 257, right: 9, bottom: 267 });
    expect(coverageAt(moved, -1, 257)).toBe(255);
    const byTiles = translateSelection(square, { x: TILE_SIZE, y: -2 * TILE_SIZE });
    expect(selectionBounds(byTiles)).toEqual({ left: 506, top: -262, right: 516, bottom: -252 });
  });

  it('feathers edges into soft coverage, symmetric about the outline, inside and out', () => {
    const square = rectangle(0, 0, 200, 200);
    const soft = featherSelection(square, 16);
    expect(coverageAt(soft, 100, 100)).toBe(255);
    expect(coverageAt(soft, -40, 100)).toBe(0);
    const inner = coverageAt(soft, 0, 100),
      outer = coverageAt(soft, -1, 100);
    expect(inner).toBeGreaterThan(110);
    expect(inner).toBeLessThan(160);
    expect(inner + outer).toBeGreaterThan(245);
    expect(inner + outer).toBeLessThan(265);
    // Coverage falls monotonically across the edge.
    const across = Array.from({ length: 30 }, (_, index) => coverageAt(soft, index - 15, 100));
    expect(across.every((value, index) => index === 0 || value >= across[index - 1]!)).toBe(true);

    const hole = featherSelection(invertSelection(square), 16);
    expect(coverageAt(hole, 100, 100)).toBe(0);
    expect(coverageAt(hole, 900, 900)).toBe(255);
    expect(coverageAt(hole, 0, 100) + inner).toBeGreaterThan(250);
  });

  it('reads the coverage of an area and summarizes the selection for hit testing', () => {
    const square = rectangle(4, 4, 8, 8);
    const area = areaCoverage(square, { left: 2, top: 4, width: 4, height: 1 });
    expect([...area]).toEqual([0, 0, 255, 255]);

    const summary = summarizeSelection(square);
    expect(summary).toMatchObject({
      selected: true,
      inverted: false,
      bounds: { left: 4, top: 4, right: 8, bottom: 8 }
    });
    expect(hitsSelection(summary, { x: 5, y: 5 })).toBe(true);
    expect(hitsSelection(summary, { x: 9, y: 5 })).toBe(false);
    expect(hitsSelection(summary, { x: 9000, y: 5 })).toBe(false);

    const hole = summarizeSelection(invertSelection(square));
    expect(hole.bounds).toBeUndefined();
    expect(hitsSelection(hole, { x: 5, y: 5 })).toBe(false);
    expect(hitsSelection(hole, { x: 9000, y: 5 })).toBe(true);
    expect(summarizeSelection(emptySelection)).toEqual({ selected: false, inverted: false });
    expect(hitsSelection(summarizeSelection(wholeSelection), { x: 1, y: 1 })).toBe(true);

    // A large selection is summarized in coarser cells.
    const large = summarizeSelection(rectangle(0, 0, 4096, 4096));
    expect(large.hits!.columns * large.hits!.rows).toBeLessThanOrEqual(1 << 16);
    expect(hitsSelection(large, { x: 4000, y: 10 })).toBe(true);
  });
});

function rectangle(left: number, top: number, right: number, bottom: number): SelectionMask {
  return polygonSelection([
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ]);
}
