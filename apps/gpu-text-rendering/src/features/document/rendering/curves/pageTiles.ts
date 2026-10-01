import type { TextDocument } from '../../document';
import type { SceneFrame } from '../createFrame';

/**
 * A page-local tile. Level zero covers the complete page; each level doubles the page's texel resolution. The first
 * `split` levels of a layout keep one tile per page (x and y zero); deeper levels split into quadrants, so halving x
 * and y always yields the parent.
 */
export type PageTile = { page: number; level: number; x: number; y: number };

/** Stable identity independent of camera position and rotation. */
export function pageTileKey(tile: PageTile) {
  return `${tile.page}:${tile.level}:${tile.x}:${tile.y}`;
}

/** The tile one level coarser that contains `tile`; `tile` must not be level zero. */
export function parentTile(tile: PageTile): PageTile {
  return { page: tile.page, level: tile.level - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) };
}

/** World rectangle, with y measured upward and texture v measured downward; `split` as in {@link PageTile}. */
export function pageTileRect(document: TextDocument, tile: PageTile, split = 0) {
  const page = document.pages[tile.page]!;
  const divisions = tileDivisions(tile.level, split);
  const width = page.width / document.pages[0]!.width / divisions;
  const height = page.height / document.pages[0]!.height / divisions;

  return { x: -page.x + tile.x * width, y: 1 - page.y - tile.y * height, width, height };
}

/**
 * Selects only screen-intersecting tiles, at least 1.25 texels per physical pixel along either page axis. Level zero
 * holds `tileSize` texels along the page's longer side; `split` as in {@link PageTile}.
 */
export function visiblePageTiles(
  document: TextDocument,
  page: number,
  frame: SceneFrame,
  tileSize = 256,
  minimumLevel = 0,
  split = 0
) {
  const rect = pageTileRect(document, { page, level: 0, x: 0, y: 0 });
  const [a, b, c, d] = frame.rotation;
  const pixelsX = (Math.hypot(a! * frame.width, b! * frame.height) * frame.mul[0] * rect.width) / 2;
  const pixelsY = (Math.hypot(c! * frame.width, d! * frame.height) * frame.mul[1] * rect.height) / 2;
  const aspect = document.pages[page]!.width / document.pages[page]!.height;
  const width = Math.max(1, Math.round(tileSize * Math.min(1, aspect)));
  const height = Math.max(1, Math.round(tileSize / Math.max(1, aspect)));
  const level = Math.max(
    minimumLevel,
    Math.min(16, Math.ceil(Math.log2(1.25 * Math.max(pixelsX / width, pixelsY / height))))
  );
  const count = tileDivisions(level, split);
  const determinant = a! * d! - b! * c!;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const [sx, sy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ]) {
    const x = ((d! * sx! - c! * sy!) / determinant - frame.add[0]) / frame.mul[0];
    const y = ((a! * sy! - b! * sx!) / determinant - frame.add[1]) / frame.mul[1];
    minX = Math.min(minX, (x - rect.x) / rect.width);
    maxX = Math.max(maxX, (x - rect.x) / rect.width);
    minY = Math.min(minY, (rect.y - y) / rect.height);
    maxY = Math.max(maxY, (rect.y - y) / rect.height);
  }

  const tiles: PageTile[] = [];

  for (let y = Math.max(0, Math.floor(minY * count)); y < Math.min(count, Math.ceil(maxY * count)); y++) {
    for (let x = Math.max(0, Math.floor(minX * count)); x < Math.min(count, Math.ceil(maxX * count)); x++) {
      tiles.push({ page, level, x, y });
    }
  }

  return tiles;
}

/**
 * Renders a tile with a two-pixel gutter; neighboring tiles sample the same PDF coordinates at their edges. Tiles of
 * the first `split` levels hold the whole page at `tileSize`·2^level texels; deeper tiles hold `tileSize`·2^split.
 */
export function pageTileFrame(document: TextDocument, tile: PageTile, tileSize = 256, split = 0): SceneFrame {
  const rect = pageTileRect(document, tile, split);
  const size = tileSize * 2 ** Math.min(tile.level, split);
  const page = document.pages[tile.page]!;
  const aspect = page.width / page.height;
  const width = Math.max(1, Math.round(size * Math.min(1, aspect))) + 4;
  const height = Math.max(1, Math.round(size / Math.max(1, aspect))) + 4;
  const mul: [number, number] = [(2 * (width - 4)) / (width * rect.width), (2 * (height - 4)) / (height * rect.height)];

  return {
    width,
    height,
    mul,
    add: [-(rect.x + rect.width / 2) * mul[0], -(rect.y - rect.height / 2) * mul[1]],
    rotation: [1, 0, 0, 1],
    visible: [{ index: tile.page, page }],
    vectorOnly: false,
    grids: false,
    moving: false
  };
}

/** Tiles per page side at `level` when the first `split` levels keep the whole page in one tile. */
function tileDivisions(level: number, split: number) {
  return 2 ** Math.max(0, level - split);
}
