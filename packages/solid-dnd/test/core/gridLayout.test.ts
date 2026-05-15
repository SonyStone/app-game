import {
  type GridCell,
  type ResolvedGrid,
  cellRect,
  cellToIndex,
  gridRangeIndices,
  indexToCell,
  pointToCell,
  resolveGrid
} from 'src/core/gridLayout';
import type { GridConfig } from 'src/core/types';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: resolveGrid
// ============================================================================

describe('resolveGrid', () => {
  it('resolves a simple fixed grid', () => {
    const config: GridConfig = { columns: 3, gap: 8 };
    const grid = resolveGrid(config, 9, 320);

    expect(grid.columns).toBe(3);
    // columnWidth = (320 - 8*2) / 3 = 304/3 ≈ 101.33
    expect(grid.columnWidth).toBeCloseTo(101.33, 1);
    expect(grid.rowGap).toBe(8);
    expect(grid.colGap).toBe(8);
    expect(grid.rows).toBe(3);
  });

  it('resolves auto columns from container width + columnWidth', () => {
    const config: GridConfig = { columns: 'auto', columnWidth: 100, gap: 10 };
    // Available: (400 + 10) / (100 + 10) = 410/110 = 3.72 → 3 columns
    const grid = resolveGrid(config, 7, 400);

    expect(grid.columns).toBe(3);
    expect(grid.columnWidth).toBe(100);
    expect(grid.rows).toBe(3); // ceil(7/3) = 3
  });

  it('auto columns falls back to 1 when no columnWidth', () => {
    const config: GridConfig = { columns: 'auto', gap: 0 };
    const grid = resolveGrid(config, 5, 300);
    expect(grid.columns).toBe(1);
  });

  it('resolves separate row and column gaps', () => {
    const config: GridConfig = { columns: 4, gap: [12, 8] };
    const grid = resolveGrid(config, 8, 400);
    expect(grid.rowGap).toBe(12);
    expect(grid.colGap).toBe(8);
  });

  it('uses measured row height when rowHeight is auto', () => {
    const config: GridConfig = { columns: 3, gap: 0, rowHeight: 'auto' };
    const grid = resolveGrid(config, 6, 300, 80);
    expect(grid.rowHeight).toBe(80);
  });

  it('uses explicit rowHeight when provided', () => {
    const config: GridConfig = { columns: 3, gap: 0, rowHeight: 60 };
    const grid = resolveGrid(config, 6, 300);
    expect(grid.rowHeight).toBe(60);
  });

  it('clamps columns to at least 1', () => {
    const config: GridConfig = { columns: 0, gap: 0 };
    const grid = resolveGrid(config, 5, 200);
    expect(grid.columns).toBe(1);
  });

  it('computes rows correctly for partial last row', () => {
    const config: GridConfig = { columns: 4, gap: 0 };
    const grid = resolveGrid(config, 10, 400);
    expect(grid.rows).toBe(3); // ceil(10/4) = 3
  });

  it('single item → 1 row', () => {
    const config: GridConfig = { columns: 4, gap: 0 };
    const grid = resolveGrid(config, 1, 400);
    expect(grid.rows).toBe(1);
  });
});

// ============================================================================
// MARK: indexToCell / cellToIndex
// ============================================================================

describe('indexToCell', () => {
  it('first item → (0, 0)', () => {
    expect(indexToCell(0, 4)).toEqual({ row: 0, col: 0 });
  });

  it('last in first row', () => {
    expect(indexToCell(3, 4)).toEqual({ row: 0, col: 3 });
  });

  it('first in second row', () => {
    expect(indexToCell(4, 4)).toEqual({ row: 1, col: 0 });
  });

  it('arbitrary position', () => {
    expect(indexToCell(7, 3)).toEqual({ row: 2, col: 1 });
  });
});

describe('cellToIndex', () => {
  it('round-trips with indexToCell', () => {
    for (let i = 0; i < 12; i++) {
      const cell = indexToCell(i, 4);
      expect(cellToIndex(cell, 4)).toBe(i);
    }
  });

  it('specific cases', () => {
    expect(cellToIndex({ row: 2, col: 1 }, 3)).toBe(7);
    expect(cellToIndex({ row: 0, col: 0 }, 5)).toBe(0);
  });
});

// ============================================================================
// MARK: cellRect
// ============================================================================

describe('cellRect', () => {
  const grid: ResolvedGrid = {
    columns: 3,
    columnWidth: 100,
    rowHeight: 80,
    rowGap: 10,
    colGap: 8,
    rows: 3
  };

  it('first cell at origin', () => {
    const rect = cellRect({ row: 0, col: 0 }, grid);
    expect(rect).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it('second column', () => {
    const rect = cellRect({ row: 0, col: 1 }, grid);
    expect(rect.x).toBe(108); // 100 + 8
    expect(rect.y).toBe(0);
  });

  it('second row', () => {
    const rect = cellRect({ row: 1, col: 0 }, grid);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(90); // 80 + 10
  });

  it('second row, third column', () => {
    const rect = cellRect({ row: 1, col: 2 }, grid);
    expect(rect.x).toBe(216); // 2 * (100 + 8)
    expect(rect.y).toBe(90); // 1 * (80 + 10)
  });

  it('respects origin offset', () => {
    const rect = cellRect({ row: 0, col: 1 }, grid, { x: 20, y: 30 });
    expect(rect.x).toBe(128); // 20 + 108
    expect(rect.y).toBe(30);
  });
});

// ============================================================================
// MARK: pointToCell
// ============================================================================

describe('pointToCell', () => {
  const grid: ResolvedGrid = {
    columns: 3,
    columnWidth: 100,
    rowHeight: 80,
    rowGap: 10,
    colGap: 8,
    rows: 3
  };
  const origin = { x: 10, y: 10 };

  it('point in first cell → (0, 0)', () => {
    const cell = pointToCell({ x: 50, y: 40 }, grid, origin);
    expect(cell).toEqual({ row: 0, col: 0 });
  });

  it('point in second column → (0, 1)', () => {
    // Second column starts at x=10 + 108 = 118
    const cell = pointToCell({ x: 150, y: 40 }, grid, origin);
    expect(cell).toEqual({ row: 0, col: 1 });
  });

  it('point in second row → (1, 0)', () => {
    // Second row starts at y=10 + 90 = 100
    const cell = pointToCell({ x: 50, y: 120 }, grid, origin);
    expect(cell).toEqual({ row: 1, col: 0 });
  });

  it('clamps to top-left for negative coords', () => {
    const cell = pointToCell({ x: -100, y: -100 }, grid, origin);
    expect(cell).toEqual({ row: 0, col: 0 });
  });

  it('clamps to bottom-right for very large coords', () => {
    const cell = pointToCell({ x: 9999, y: 9999 }, grid, origin);
    expect(cell).toEqual({ row: 2, col: 2 }); // rows-1, columns-1
  });
});

// ============================================================================
// MARK: gridRangeIndices
// ============================================================================

describe('gridRangeIndices', () => {
  it('single cell selection', () => {
    const cell: GridCell = { row: 1, col: 2 };
    const indices = gridRangeIndices(cell, cell, 4, 12);
    expect(indices).toEqual([6]); // row 1, col 2 → index 6
  });

  it('horizontal range (same row)', () => {
    const a: GridCell = { row: 0, col: 1 };
    const b: GridCell = { row: 0, col: 3 };
    const indices = gridRangeIndices(a, b, 4, 12);
    expect(indices).toEqual([1, 2, 3]);
  });

  it('vertical range (same column)', () => {
    const a: GridCell = { row: 0, col: 0 };
    const b: GridCell = { row: 2, col: 0 };
    const indices = gridRangeIndices(a, b, 4, 12);
    expect(indices).toEqual([0, 4, 8]);
  });

  it('rectangular block', () => {
    const a: GridCell = { row: 0, col: 1 };
    const b: GridCell = { row: 2, col: 3 };
    const indices = gridRangeIndices(a, b, 4, 12);
    expect(indices).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
  });

  it('reversed corners produce same result', () => {
    const a: GridCell = { row: 2, col: 3 };
    const b: GridCell = { row: 0, col: 1 };
    const indices = gridRangeIndices(a, b, 4, 12);
    expect(indices).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
  });

  it('clips indices to itemCount', () => {
    const a: GridCell = { row: 2, col: 0 };
    const b: GridCell = { row: 2, col: 3 };
    // Only 10 items in 4-col grid → row 2 has items at 8, 9 only
    const indices = gridRangeIndices(a, b, 4, 10);
    expect(indices).toEqual([8, 9]);
  });

  it('full grid selection', () => {
    const a: GridCell = { row: 0, col: 0 };
    const b: GridCell = { row: 1, col: 2 };
    const indices = gridRangeIndices(a, b, 3, 6);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
