import { describe, expect, it } from 'vitest';
import {
  BRUSH_SIZE_PRESETS,
  GRID_CELL_HEIGHT,
  GRID_CELL_WIDTH,
  GRID_COLUMNS,
  GRID_HEADER,
  GRID_MARGIN,
  GRID_PADDING,
  insideSizeGrid,
  placeSizeGrid,
  sizeAt,
  type SizeGrid
} from './sizeGrid';

const viewport = { width: 1600, height: 1000 };

function place(max = 512, current = 24, y = 500) {
  return placeSizeGrid({ presets: BRUSH_SIZE_PRESETS, min: 1, max, current, right: 1200, y, viewport });
}

/** Viewport point at `share` across the cell of `preset` (0 left edge, 0.5 middle, 1 right edge), mid-height. */
function cellPoint(grid: SizeGrid, preset: number, share = 0.5) {
  const index = grid.presets.indexOf(preset);
  const column = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);
  return {
    x: grid.left + GRID_PADDING + (column + share) * GRID_CELL_WIDTH,
    y: grid.top + GRID_PADDING + GRID_HEADER + (row + 0.5) * GRID_CELL_HEIGHT
  };
}

describe('placeSizeGrid', () => {
  it('offers the presets within the brush limits, left of the anchor, with the nearest row level with the press', () => {
    const grid = place(512, 24, 500);
    expect(grid.presets[0]).toBe(1);
    expect(grid.presets.at(-1)).toBe(500);
    expect(grid.left + grid.width).toBe(1200);
    // 24 px is nearest to the 25 px preset, whose row is centred on the press.
    expect(cellPoint(grid, 25).y).toBe(500);
  });

  it('stays inside the viewport', () => {
    const grid = place(5000, 2000, 990);
    expect(grid.presets.at(-1)).toBe(2000);
    expect(grid.top + grid.height).toBe(viewport.height - GRID_MARGIN);
  });
});

describe('sizeAt', () => {
  const grid = place();

  it("gives a cell's preset exactly around its middle", () => {
    const { x, y } = cellPoint(grid, 30, 0.6);
    expect(sizeAt(grid, x, y)).toMatchObject({ size: 30, preset: 30, exact: true });
  });

  it('runs through the sizes between neighbouring presets, meeting halfway at the cell boundary', () => {
    const right80 = cellPoint(grid, 80, 0.999);
    const left100 = cellPoint(grid, 100, 0.001);
    // Halfway between 80 and 100 geometrically: √8000 ≈ 89.4.
    expect(sizeAt(grid, right80.x, right80.y)).toMatchObject({ size: 89, preset: 80, exact: false });
    expect(sizeAt(grid, left100.x, left100.y)).toMatchObject({ size: 89, preset: 100, exact: false });
    const quarter = cellPoint(grid, 400, 0.85);
    const size = sizeAt(grid, quarter.x, quarter.y)!.size;
    expect(size).toBeGreaterThan(400);
    expect(size).toBeLessThan(447);
  });

  it('moves the last cell toward the brush maximum and ignores points off the cells', () => {
    const last = cellPoint(grid, 500, 0.999);
    expect(sizeAt(grid, last.x, last.y)?.size).toBe(506);
    // The empty cell after 500 in the last row.
    const empty = { x: last.x + GRID_CELL_WIDTH / 2, y: last.y };
    expect(insideSizeGrid(grid, empty.x, empty.y)).toBe(true);
    expect(sizeAt(grid, empty.x, empty.y)).toBeUndefined();
    expect(sizeAt(grid, grid.left - 1, last.y)).toBeUndefined();
  });

  it('places the thumb on the middle of a holding cell and under the pointer between cells', () => {
    const middle = cellPoint(grid, 30, 0.45);
    expect(sizeAt(grid, middle.x, middle.y)?.x).toBe(cellPoint(grid, 30).x - grid.left - GRID_PADDING);
    const between = cellPoint(grid, 30, 0.95);
    expect(sizeAt(grid, between.x, between.y)?.x).toBeCloseTo(between.x - grid.left - GRID_PADDING);
  });
});
