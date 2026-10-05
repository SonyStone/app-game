/**
 * Sizes of CLIP STUDIO PAINT's Brush Size palette, in px. The grid offers those within the brush's limits; 0.7 lies
 * below Paint's 1 px minimum.
 */
export const BRUSH_SIZE_PRESETS = [
  0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 17, 20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150, 170, 200, 250,
  300, 400, 500, 600, 700, 800, 1000, 1200, 1500, 1700, 2000
];

/** Placement of an open size grid in viewport pixels, with the presets it shows and the sizes it allows. */
export type SizeGrid = {
  presets: readonly number[];
  min: number;
  max: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Places the grid of `presets` within `[min, max]` left of `right`, with the row of the preset nearest `current`
 * level with `y`, kept `GRID_MARGIN` inside the viewport.
 */
export function placeSizeGrid(options: {
  presets: readonly number[];
  min: number;
  max: number;
  current: number;
  right: number;
  y: number;
  viewport: { width: number; height: number };
}): SizeGrid {
  const presets = options.presets.filter((size) => size >= options.min && size <= options.max);
  const width = GRID_COLUMNS * GRID_CELL_WIDTH + 2 * GRID_PADDING;
  const height = GRID_HEADER + Math.ceil(presets.length / GRID_COLUMNS) * GRID_CELL_HEIGHT + 2 * GRID_PADDING;
  const nearest = presets.reduce(
    (best, size, index) => (Math.abs(size - options.current) < Math.abs(presets[best]! - options.current) ? index : best),
    0
  );
  const row = Math.floor(nearest / GRID_COLUMNS);
  const left = options.right - width;
  const top = options.y - GRID_PADDING - GRID_HEADER - (row + 0.5) * GRID_CELL_HEIGHT;

  return {
    presets,
    min: options.min,
    max: options.max,
    left: clamp(left, GRID_MARGIN, options.viewport.width - width - GRID_MARGIN),
    top: clamp(top, GRID_MARGIN, options.viewport.height - height - GRID_MARGIN),
    width,
    height
  };
}

/**
 * The size under `(x, y)` in the grid, with the preset of its cell; `exact` when it is that preset. Rows read as
 * sliders: the middle {@link GRID_EXACT_SHARE} of a cell gives its preset exactly, and toward a neighbouring cell
 * the size moves on geometrically to halfway to that cell's preset, so adjacent cells meet at the same size. The
 * first and last cells move toward `min` and `max`. `row` and `x` place the thumb: `x` runs along the row from the
 * grid's first column and jumps to the cell's middle while the preset holds.
 */
export function sizeAt(grid: SizeGrid, x: number, y: number): SizePick | undefined {
  const column = Math.floor((x - grid.left - GRID_PADDING) / GRID_CELL_WIDTH);
  const row = Math.floor((y - grid.top - GRID_PADDING - GRID_HEADER) / GRID_CELL_HEIGHT);
  const index = row * GRID_COLUMNS + column;
  const preset = column >= 0 && column < GRID_COLUMNS && row >= 0 ? grid.presets[index] : undefined;

  if (preset === undefined) {
    return undefined;
  }

  // -1 at the cell's left edge, 1 at its right edge.
  const offset = (x - grid.left - GRID_PADDING - (column + 0.5) * GRID_CELL_WIDTH) / (GRID_CELL_WIDTH / 2);
  const toward =
    Math.abs(offset) <= GRID_EXACT_SHARE ? 0 : (Math.abs(offset) - GRID_EXACT_SHARE) / (1 - GRID_EXACT_SHARE);
  const neighbour = offset > 0 ? (grid.presets[index + 1] ?? grid.max) : (grid.presets[index - 1] ?? grid.min);

  if (toward === 0 || neighbour === preset) {
    return { size: preset, preset, exact: true, row, x: (column + 0.5) * GRID_CELL_WIDTH };
  }

  // Sizes between presets are whole pixels, as the Size slider gives them.
  const size = clamp(Math.round(preset * (neighbour / preset) ** (toward / 2)), grid.min, grid.max);
  return { size, preset, exact: size === preset, row, x: x - grid.left - GRID_PADDING };
}

/** What the pointer points at in the grid. */
export type SizePick = { size: number; preset: number; exact: boolean; row: number; x: number };

/** Whether `(x, y)` lies over the grid. */
export function insideSizeGrid(grid: SizeGrid, x: number, y: number): boolean {
  return x >= grid.left && x <= grid.left + grid.width && y >= grid.top && y <= grid.top + grid.height;
}

/** Columns of the grid, as in CLIP STUDIO PAINT's Brush Size palette. */
export const GRID_COLUMNS = 7;

/** Size of a grid cell, in CSS pixels. */
export const GRID_CELL_WIDTH = 40;
export const GRID_CELL_HEIGHT = 46;

/** Padding inside the grid, and its least distance from the viewport's edges, in CSS pixels. */
export const GRID_PADDING = 4;
export const GRID_MARGIN = 8;

/** Height of the grid's header showing the size, which the hand may hide at the control. */
export const GRID_HEADER = 22;

/** Share of a cell's width, around its middle, that gives the cell's preset exactly. */
export const GRID_EXACT_SHARE = 0.4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
