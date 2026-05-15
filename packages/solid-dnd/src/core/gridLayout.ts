// ============================================================================
// Grid Layout — Pure math for CSS-grid-like layouts
// ============================================================================

import { clamp } from '@solid-primitives/utils';

import type { Rect } from './rect';
import type { GridConfig } from './types';

// ============================================================================
// MARK: Types
// ============================================================================

/**
 * A cell position in the grid (0-indexed row and column).
 */
export type GridCell = Readonly<{ row: number; col: number }>;

/**
 * Resolved grid dimensions — all values concrete (no 'auto').
 */
export type ResolvedGrid = {
  /** Number of columns. */
  columns: number;
  /** Width of each column in pixels. */
  columnWidth: number;
  /** Height of each row in pixels. */
  rowHeight: number;
  /** Gap between rows in pixels. */
  rowGap: number;
  /** Gap between columns in pixels. */
  colGap: number;
  /** Total number of rows (ceil(itemCount / columns)). */
  rows: number;
};

// ============================================================================
// MARK: resolveGrid
// ============================================================================

/**
 * Resolve a `GridConfig` + measurements into concrete grid dimensions.
 *
 * When `columns` is `'auto'`, it's computed from the container width and
 * column width. When `rowHeight` is `'auto'`, it must be provided via
 * `measuredRowHeight` (typically the tallest item in the first row).
 *
 * @param config     The grid configuration.
 * @param itemCount  Number of items in the grid.
 * @param containerWidth  Width of the container in pixels (needed for 'auto' columns).
 * @param measuredRowHeight  Measured row height (used when rowHeight is 'auto').
 */
export function resolveGrid(
  config: GridConfig,
  itemCount: number,
  containerWidth?: number,
  measuredRowHeight?: number
): ResolvedGrid {
  const [rowGap, colGap] = normalizeGap(config.gap);

  // Resolve columns
  let columns: number;
  if (config.columns === 'auto') {
    if (!config.columnWidth || !containerWidth) {
      columns = 1;
    } else {
      // Same logic as CSS grid auto-fill: how many columns fit?
      columns = Math.max(1, Math.floor((containerWidth + colGap) / (config.columnWidth + colGap)));
    }
  } else {
    columns = Math.max(1, config.columns);
  }

  // Resolve column width
  const columnWidth = config.columnWidth ?? (containerWidth ? (containerWidth - colGap * (columns - 1)) / columns : 0);

  // Resolve row height
  const rowHeight =
    config.rowHeight === 'auto' || config.rowHeight === undefined ? (measuredRowHeight ?? 0) : config.rowHeight;

  const rows = Math.max(1, Math.ceil(itemCount / columns));

  return { columns, columnWidth, rowHeight, rowGap, colGap, rows };
}

// ============================================================================
// MARK: indexToCell
// ============================================================================

/**
 * Convert a flat item index to a grid cell position.
 *
 * @example
 * ```ts
 * indexToCell(5, 4) // → { row: 1, col: 1 }  (4 columns)
 * indexToCell(0, 4) // → { row: 0, col: 0 }
 * ```
 */
export function indexToCell(index: number, columns: number): GridCell {
  return {
    row: Math.floor(index / columns),
    col: index % columns
  };
}

// ============================================================================
// MARK: cellToIndex
// ============================================================================

/**
 * Convert a grid cell position back to a flat item index.
 *
 * @example
 * ```ts
 * cellToIndex({ row: 1, col: 1 }, 4) // → 5
 * cellToIndex({ row: 0, col: 0 }, 4) // → 0
 * ```
 */
export function cellToIndex(cell: GridCell, columns: number): number {
  return cell.row * columns + cell.col;
}

// ============================================================================
// MARK: cellRect
// ============================================================================

/**
 * Compute the pixel rectangle of a grid cell, relative to the grid origin.
 *
 * @param cell      The grid cell position.
 * @param grid      Resolved grid dimensions.
 * @param origin    Top-left corner of the grid container (default: 0,0).
 *
 * @example
 * ```ts
 * const grid = resolveGrid({ columns: 3, gap: 8 }, 9, 320);
 * const rect = cellRect({ row: 1, col: 2 }, grid, { x: 10, y: 10 });
 * ```
 */
export function cellRect(cell: GridCell, grid: ResolvedGrid, origin: { x: number; y: number } = { x: 0, y: 0 }): Rect {
  return {
    x: origin.x + cell.col * (grid.columnWidth + grid.colGap),
    y: origin.y + cell.row * (grid.rowHeight + grid.rowGap),
    width: grid.columnWidth,
    height: grid.rowHeight
  };
}

// ============================================================================
// MARK: pointToCell
// ============================================================================

/**
 * Given a point in pixel space, find the nearest grid cell.
 *
 * Clamps to valid grid bounds (0..rows-1, 0..columns-1).
 *
 * @param point     The point in the same coordinate space as the grid.
 * @param grid      Resolved grid dimensions.
 * @param origin    Top-left corner of the grid container.
 */
export function pointToCell(
  point: { x: number; y: number },
  grid: ResolvedGrid,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): GridCell {
  const relX = point.x - origin.x;
  const relY = point.y - origin.y;

  const cellStepX = grid.columnWidth + grid.colGap;
  const cellStepY = grid.rowHeight + grid.rowGap;

  const col = cellStepX > 0 ? Math.floor(relX / cellStepX) : 0;
  const row = cellStepY > 0 ? Math.floor(relY / cellStepY) : 0;

  return {
    row: clamp(row, 0, grid.rows - 1),
    col: clamp(col, 0, grid.columns - 1)
  };
}

// ============================================================================
// MARK: gridRangeIndices
// ============================================================================

/**
 * Select a rectangular region in the grid and return the flat indices of
 * all cells within that rectangle.
 *
 * Used for Shift+click grid range selection: click cell A, shift+click cell B,
 * select the rectangular region spanning both cells.
 *
 * @param cellA     One corner of the rectangle.
 * @param cellB     Opposite corner of the rectangle.
 * @param columns   Number of columns in the grid.
 * @param itemCount Total items (to avoid returning indices beyond the list).
 *
 * @example
 * ```ts
 * // 4-column grid, click (0,1) then shift+click (2,3):
 * gridRangeIndices({ row: 0, col: 1 }, { row: 2, col: 3 }, 4, 12)
 * // → [1, 2, 3, 5, 6, 7, 9, 10, 11]
 * ```
 */
export function gridRangeIndices(cellA: GridCell, cellB: GridCell, columns: number, itemCount: number): number[] {
  const minRow = Math.min(cellA.row, cellB.row);
  const maxRow = Math.max(cellA.row, cellB.row);
  const minCol = Math.min(cellA.col, cellB.col);
  const maxCol = Math.max(cellA.col, cellB.col);

  const indices: number[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const idx = r * columns + c;
      if (idx < itemCount) {
        indices.push(idx);
      }
    }
  }
  return indices;
}

// ============================================================================
// MARK: Helpers
// ============================================================================

/**
 * Normalize the `gap` config into `[rowGap, colGap]`.
 * @internal
 */
function normalizeGap(gap: number | [number, number]): [number, number] {
  return Array.isArray(gap) ? gap : [gap, gap];
}
