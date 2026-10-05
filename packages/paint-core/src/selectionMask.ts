import { TILE_SIZE } from './brush';
import type { Point } from './camera';

/**
 * A selection as a coverage mask over the endless canvas: `tiles` hold one byte per pixel of each tile, from 0, not
 * selected, to 255, fully selected, and every pixel outside them has the coverage `outside`. An inverted selection or
 * Select All has `outside` 255, so it reaches as far as the canvas does. Values between 0 and 255 are soft edges, as a
 * feather makes; brushes, fills and pixel edits apply in proportion to them.
 *
 * Masks are immutable values: operations return new masks and share the tiles they leave unchanged. No tile is
 * uniformly `outside`; such tiles are dropped.
 */
export type SelectionMask = {
  readonly outside: 0 | 255;
  /** Coverage of each tile by its key `"x,y"` in tile coordinates, `TILE_SIZE` × `TILE_SIZE` bytes row by row. */
  readonly tiles: ReadonlyMap<string, Uint8Array>;
};

/** Nothing selected. */
export const emptySelection: SelectionMask = { outside: 0, tiles: new Map() };

/** Everything selected, as Select All does. */
export const wholeSelection: SelectionMask = { outside: 255, tiles: new Map() };

/** How a new shape changes the selection: it replaces it, or is added, subtracted or intersected with it. */
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

/**
 * What a selection gesture shows before it applies: a closed `shape` being drawn and how it will combine with the
 * selection, or the selection dragged by `offset` document pixels; or no outline at all, while a transform box stands
 * in for it.
 */
export type SelectionPreview =
  | { kind: 'shape'; points: Point[]; mode: SelectionMode }
  | { kind: 'offset'; offset: Point }
  | { kind: 'hidden' };

/** Whether anything is selected. */
export function isSelected(mask: SelectionMask) {
  return mask.outside === 255 || mask.tiles.size > 0;
}

/**
 * The pixels whose centers lie inside the closed polygon `points`, in document pixels, by the even-odd rule, so
 * crossing and concave outlines select as a lasso does. Throws for fewer than three points or non-finite ones.
 */
export function polygonSelection(points: readonly Point[]): SelectionMask {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error('Draw a closed outline with at least three points.');
  }

  const left = Math.min(...points.map(({ x }) => x)),
    right = Math.max(...points.map(({ x }) => x)),
    top = Math.min(...points.map(({ y }) => y)),
    bottom = Math.max(...points.map(({ y }) => y));
  const tiles = new Map<string, Uint8Array>();
  for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor(bottom / TILE_SIZE); ty++) {
    const rows = Array.from({ length: TILE_SIZE }, (_, y) => crossings(points, ty * TILE_SIZE + y + 0.5));
    for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor(right / TILE_SIZE); tx++) {
      const tile = new Uint8Array(TILE_PIXELS);
      let covered = 0;
      for (let y = 0; y < TILE_SIZE; y++) {
        const row = rows[y]!;
        for (let index = 0; index + 1 < row.length; index += 2) {
          const start = Math.max(0, Math.ceil(row[index]! - tx * TILE_SIZE - 0.5));
          const end = Math.min(TILE_SIZE, Math.ceil(row[index + 1]! - tx * TILE_SIZE - 0.5));
          if (end > start) {
            tile.fill(255, y * TILE_SIZE + start, y * TILE_SIZE + end);
            covered += end - start;
          }
        }
      }

      if (covered) {
        tiles.set(`${tx},${ty}`, covered === TILE_PIXELS ? FULL : tile);
      }
    }
  }

  return { outside: 0, tiles };
}

/**
 * The pixels of `area` with their `coverage`, one byte per pixel row by row from 0 to 255, as a selection; nothing
 * outside the area is selected.
 */
export function areaSelection(
  area: { left: number; top: number; width: number; height: number },
  coverage: Uint8Array
): SelectionMask {
  const tiles = new Map<string, Uint8Array>();
  const right = area.left + area.width,
    bottom = area.top + area.height;
  for (let ty = Math.floor(area.top / TILE_SIZE); ty * TILE_SIZE < bottom; ty++) {
    for (let tx = Math.floor(area.left / TILE_SIZE); tx * TILE_SIZE < right; tx++) {
      const tile = new Uint8Array(TILE_PIXELS);
      const x0 = Math.max(area.left, tx * TILE_SIZE),
        x1 = Math.min(right, (tx + 1) * TILE_SIZE);
      for (let y = Math.max(area.top, ty * TILE_SIZE); y < Math.min(bottom, (ty + 1) * TILE_SIZE); y++) {
        const from = (y - area.top) * area.width + x0 - area.left;
        tile.set(coverage.subarray(from, from + x1 - x0), (y - ty * TILE_SIZE) * TILE_SIZE + x0 - tx * TILE_SIZE);
      }

      keep(tiles, `${tx},${ty}`, tile, 0);
    }
  }

  return { outside: 0, tiles };
}

/** `shape` combined into `base` by `mode`: per pixel, the shape's coverage, the larger, `base` less the shape, or the smaller. */
export function combineSelections(base: SelectionMask, shape: SelectionMask, mode: SelectionMode): SelectionMask {
  if (mode === 'replace') {
    return shape;
  }

  const combine =
    mode === 'add'
      ? (a: number, b: number) => Math.max(a, b)
      : mode === 'subtract'
        ? (a: number, b: number) => Math.min(a, 255 - b)
        : (a: number, b: number) => Math.min(a, b);
  const outside = combine(base.outside, shape.outside) as 0 | 255;
  const tiles = new Map<string, Uint8Array>();
  for (const key of new Set([...base.tiles.keys(), ...shape.tiles.keys()])) {
    const a = base.tiles.get(key) ?? uniform(base.outside),
      b = shape.tiles.get(key) ?? uniform(shape.outside);
    const tile = new Uint8Array(TILE_PIXELS);
    for (let index = 0; index < TILE_PIXELS; index++) {
      tile[index] = combine(a[index]!, b[index]!);
    }

    keep(tiles, key, tile, outside);
  }

  return { outside, tiles };
}

/** Selects what was not selected and the reverse; partly selected pixels take the remaining coverage. */
export function invertSelection(mask: SelectionMask): SelectionMask {
  const outside = (255 - mask.outside) as 0 | 255;
  const tiles = new Map<string, Uint8Array>();
  for (const [key, tile] of mask.tiles) {
    tiles.set(key, tile === FULL ? ZERO : tile === ZERO ? FULL : tile.map((value) => 255 - value));
  }

  return { outside, tiles };
}

/** The selection moved by `offset`, rounded to whole document pixels. */
export function translateSelection(mask: SelectionMask, offset: Point): SelectionMask {
  const dx = Math.round(offset.x),
    dy = Math.round(offset.y);
  if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy)) {
    throw new Error('The selection cannot move that far.');
  }

  if (dx % TILE_SIZE === 0 && dy % TILE_SIZE === 0) {
    const tiles = new Map<string, Uint8Array>();
    for (const [key, tile] of mask.tiles) {
      const [tx, ty] = tileOf(key);
      tiles.set(`${tx + dx / TILE_SIZE},${ty + dy / TILE_SIZE}`, tile);
    }

    return { outside: mask.outside, tiles };
  }

  const targets = new Set<string>();
  for (const key of mask.tiles.keys()) {
    const [tx, ty] = tileOf(key);
    for (const y of [
      Math.floor((ty * TILE_SIZE + dy) / TILE_SIZE),
      Math.floor(((ty + 1) * TILE_SIZE - 1 + dy) / TILE_SIZE)
    ]) {
      for (const x of [
        Math.floor((tx * TILE_SIZE + dx) / TILE_SIZE),
        Math.floor(((tx + 1) * TILE_SIZE - 1 + dx) / TILE_SIZE)
      ]) {
        targets.add(`${x},${y}`);
      }
    }
  }

  const tiles = new Map<string, Uint8Array>();
  for (const key of targets) {
    const [tx, ty] = tileOf(key);
    const tile = new Uint8Array(TILE_PIXELS);
    for (let y = 0; y < TILE_SIZE; y++) {
      readRow(mask, tx * TILE_SIZE - dx, ty * TILE_SIZE + y - dy, tile.subarray(y * TILE_SIZE, (y + 1) * TILE_SIZE));
    }

    keep(tiles, key, tile, mask.outside);
  }

  return { outside: mask.outside, tiles };
}

/**
 * The selection with edges softened by `radius` document pixels, as Photoshop's Feather: a Gaussian blur with a
 * standard deviation of half the radius, approximated by three box blurs. Throws when the edges span more than
 * {@link maxFeatherPixels} pixels.
 */
export function featherSelection(mask: SelectionMask, radius: number): SelectionMask {
  if (!(radius > 0) || !mask.tiles.size) {
    return mask;
  }

  const boxes = gaussianBoxes(radius / 2);
  const pad = Math.ceil(boxes.reduce((sum, box) => sum + box, 0));
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const key of mask.tiles.keys()) {
    const [tx, ty] = tileOf(key);
    left = Math.min(left, tx * TILE_SIZE - pad);
    top = Math.min(top, ty * TILE_SIZE - pad);
    right = Math.max(right, (tx + 1) * TILE_SIZE + pad);
    bottom = Math.max(bottom, (ty + 1) * TILE_SIZE + pad);
  }

  const width = right - left,
    height = bottom - top;
  if (width * height > maxFeatherPixels) {
    throw new Error('This selection is too large to feather. Select a smaller area.');
  }

  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    readRow(mask, left, top + y, pixels.subarray(y * width, (y + 1) * width));
  }

  const scratch = new Uint8Array(width * height);
  for (const box of boxes) {
    for (let y = 0; y < height; y++) {
      blurLine(pixels, scratch, y * width, width, 1, box, mask.outside);
    }

    for (let x = 0; x < width; x++) {
      blurLine(scratch, pixels, x, height, width, box, mask.outside);
    }
  }

  const tiles = new Map<string, Uint8Array>();
  for (let ty = Math.floor(top / TILE_SIZE); ty * TILE_SIZE < bottom; ty++) {
    for (let tx = Math.floor(left / TILE_SIZE); tx * TILE_SIZE < right; tx++) {
      const tile = new Uint8Array(TILE_PIXELS).fill(mask.outside);
      for (let y = Math.max(0, top - ty * TILE_SIZE); y < Math.min(TILE_SIZE, bottom - ty * TILE_SIZE); y++) {
        const from = Math.max(0, left - tx * TILE_SIZE),
          to = Math.min(TILE_SIZE, right - tx * TILE_SIZE);
        if (to > from) {
          const row = (ty * TILE_SIZE + y - top) * width + tx * TILE_SIZE - left;
          tile.set(pixels.subarray(row + from, row + to), y * TILE_SIZE + from);
        }
      }

      keep(tiles, `${tx},${ty}`, tile, mask.outside);
    }
  }

  return { outside: mask.outside, tiles };
}

/** Most pixels, about 32 million, that a feather blurs at once. */
export const maxFeatherPixels = 1 << 25;

/** Bounds of the selected pixels, right and bottom exclusive; `undefined` when nothing or everything around is selected. */
export function selectionBounds(mask: SelectionMask): Bounds | undefined {
  if (mask.outside === 255) {
    return undefined;
  }

  let bounds: Bounds | undefined;
  for (const [key, tile] of mask.tiles) {
    const [tx, ty] = tileOf(key);
    for (let y = 0; y < TILE_SIZE; y++) {
      const row = tile.subarray(y * TILE_SIZE, (y + 1) * TILE_SIZE);
      const first = row.findIndex((value) => value > 0);
      if (first < 0) {
        continue;
      }

      const last = row.findLastIndex((value) => value > 0);
      const x0 = tx * TILE_SIZE + first,
        x1 = tx * TILE_SIZE + last + 1,
        y0 = ty * TILE_SIZE + y;
      bounds = bounds
        ? {
            left: Math.min(bounds.left, x0),
            top: Math.min(bounds.top, y0),
            right: Math.max(bounds.right, x1),
            bottom: Math.max(bounds.bottom, y0 + 1)
          }
        : { left: x0, top: y0, right: x1, bottom: y0 + 1 };
    }
  }

  return bounds;
}

/** Whole document pixels, right and bottom exclusive. */
export type Bounds = { left: number; top: number; right: number; bottom: number };

/**
 * The coverage of the tile at tile coordinates (`tx`, `ty`): wholly unselected, wholly selected, or partly, with its
 * bytes.
 */
export function tileCoverage(
  mask: SelectionMask,
  tx: number,
  ty: number
): { kind: 'outside' | 'inside' } | { kind: 'partial'; coverage: Uint8Array } {
  const tile = mask.tiles.get(`${tx},${ty}`);
  if (!tile) {
    return { kind: mask.outside === 255 ? 'inside' : 'outside' };
  }

  if (tile === FULL || tile.every((value) => value === 255)) {
    return { kind: 'inside' };
  }

  return tile === ZERO || tile.every((value) => value === 0)
    ? { kind: 'outside' }
    : { kind: 'partial', coverage: tile };
}

/** The coverage, 0 to 255, of the document pixel (`x`, `y`). */
export function coverageAt(mask: SelectionMask, x: number, y: number) {
  const px = Math.floor(x),
    py = Math.floor(y);
  const tile = mask.tiles.get(`${Math.floor(px / TILE_SIZE)},${Math.floor(py / TILE_SIZE)}`);
  if (!tile) {
    return mask.outside;
  }

  return tile[(py - Math.floor(py / TILE_SIZE) * TILE_SIZE) * TILE_SIZE + px - Math.floor(px / TILE_SIZE) * TILE_SIZE]!;
}

/** The coverage of `area`'s pixels, row by row, for edits that work on a region. */
export function areaCoverage(mask: SelectionMask, area: { left: number; top: number; width: number; height: number }) {
  const coverage = new Uint8Array(area.width * area.height);
  for (let y = 0; y < area.height; y++) {
    readRow(mask, area.left, area.top + y, coverage.subarray(y * area.width, (y + 1) * area.width));
  }

  return coverage;
}

/**
 * What the editor needs to know of a selection without its pixels: whether anything is selected, whether it reaches
 * past its tiles (inverted), the bounds of its selected pixels when it has them, and a coarse map for hit testing:
 * `hits` covers the tiles in cells of `cell` × `cell` pixels, 1 where the cell's center is at least half selected.
 * Points outside the map are selected when `inverted`.
 */
export function summarizeSelection(mask: SelectionMask): SelectionSummary {
  if (!mask.tiles.size) {
    return { selected: mask.outside === 255, inverted: mask.outside === 255 };
  }

  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const key of mask.tiles.keys()) {
    const [tx, ty] = tileOf(key);
    left = Math.min(left, tx * TILE_SIZE);
    top = Math.min(top, ty * TILE_SIZE);
    right = Math.max(right, (tx + 1) * TILE_SIZE);
    bottom = Math.max(bottom, (ty + 1) * TILE_SIZE);
  }

  let cell = 1;
  while (((right - left) / cell) * ((bottom - top) / cell) > maxHitCells) {
    cell *= 2;
  }

  const columns = Math.ceil((right - left) / cell),
    rows = Math.ceil((bottom - top) / cell);
  const cells = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = left + column * cell + Math.floor(cell / 2),
        y = top + row * cell + Math.floor(cell / 2);
      cells[row * columns + column] = coverageAt(mask, x, y) >= 128 ? 1 : 0;
    }
  }

  const bounds = selectionBounds(mask);
  return {
    selected: true,
    inverted: mask.outside === 255,
    ...(bounds ? { bounds } : {}),
    hits: { left, top, cell, columns, rows, cells }
  };
}

/** See {@link summarizeSelection}. */
export type SelectionSummary = {
  selected: boolean;
  inverted: boolean;
  bounds?: Bounds;
  hits?: { left: number; top: number; cell: number; columns: number; rows: number; cells: Uint8Array };
};

/** An empty selection's summary. */
export const emptySummary: SelectionSummary = { selected: false, inverted: false };

/** Whether `point`, in document pixels, lies in the selection by its summary's hit map. */
export function hitsSelection(summary: SelectionSummary, point: Point) {
  const hits = summary.hits;
  if (!hits) {
    return summary.inverted;
  }

  const column = Math.floor((point.x - hits.left) / hits.cell),
    row = Math.floor((point.y - hits.top) / hits.cell);
  if (column < 0 || row < 0 || column >= hits.columns || row >= hits.rows) {
    return summary.inverted;
  }

  return hits.cells[row * hits.columns + column] === 1;
}

/** Cells of a summary's hit map at most, about 256 × 256. */
const maxHitCells = 1 << 16;

const TILE_PIXELS = TILE_SIZE * TILE_SIZE;
/** Shared uniform tiles; never written. */
const FULL = new Uint8Array(TILE_PIXELS).fill(255);
const ZERO = new Uint8Array(TILE_PIXELS);

function uniform(value: 0 | 255) {
  return value === 255 ? FULL : ZERO;
}

/** Adds `tile` unless it is uniformly `outside`, sharing the uniform tiles. */
function keep(tiles: Map<string, Uint8Array>, key: string, tile: Uint8Array, outside: number) {
  const first = tile[0]!;
  if (tile.every((value) => value === first)) {
    if (first === outside) {
      return;
    }

    if (first === 0 || first === 255) {
      tiles.set(key, uniform(first));
      return;
    }
  }

  tiles.set(key, tile);
}

function tileOf(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x!, y!];
}

/** Copies the coverage of document row `y` from column `x` into `target`. */
function readRow(mask: SelectionMask, x: number, y: number, target: Uint8Array) {
  const ty = Math.floor(y / TILE_SIZE),
    row = y - ty * TILE_SIZE;
  let filled = 0;
  while (filled < target.length) {
    const column = x + filled;
    const tx = Math.floor(column / TILE_SIZE),
      start = column - tx * TILE_SIZE;
    const length = Math.min(TILE_SIZE - start, target.length - filled);
    const tile = mask.tiles.get(`${tx},${ty}`);
    if (tile) {
      target.set(tile.subarray(row * TILE_SIZE + start, row * TILE_SIZE + start + length), filled);
    } else {
      target.fill(mask.outside, filled, filled + length);
    }

    filled += length;
  }
}

/** Sorted x coordinates where the polygon's edges cross the horizontal line at `y`. */
function crossings(points: readonly Point[], y: number) {
  const result: number[] = [];
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index]!,
      b = points[previous]!;
    if (a.y > y !== b.y > y) {
      result.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  }

  return result.sort((a, b) => a - b);
}

/** Half-widths of three box blurs that together approximate a Gaussian of `sigma` (Kovesi's construction). */
function gaussianBoxes(sigma: number): [number, number, number] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) {
    lower--;
  }

  const upper = lower + 2;
  const count = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  const sizes = [0, 1, 2].map((index) => (index < count ? lower : upper));
  return sizes.map((size) => Math.max(0, (size - 1) / 2)) as [number, number, number];
}

/**
 * A box blur of half-width `radius` along one line of `length` pixels, from `start` in steps of `step`, into `target`.
 * Pixels past the line's ends have the coverage `outside`.
 */
function blurLine(
  source: Uint8Array,
  target: Uint8Array,
  start: number,
  length: number,
  step: number,
  radius: number,
  outside: number
) {
  if (radius === 0) {
    for (let index = 0; index < length; index++) {
      target[start + index * step] = source[start + index * step]!;
    }

    return;
  }

  const at = (index: number) => (index < 0 || index >= length ? outside : source[start + index * step]!);
  const size = radius * 2 + 1;
  let sum = 0;
  for (let index = -radius; index <= radius; index++) {
    sum += at(index);
  }

  for (let index = 0; index < length; index++) {
    target[start + index * step] = Math.round(sum / size);
    sum += at(index + radius + 1) - at(index - radius);
  }
}
