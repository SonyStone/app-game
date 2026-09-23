import { expect, it } from 'vitest';
import { pageTileKey, type PageTile } from './pageTiles';
import { selectPageTiles, type ResidentPageTile } from './selectPageTiles';

it('keeps sharper resident regions on zoom-out instead of returning to the page preview', () => {
  const base = resident(0, 0, 0);
  const detailed = resident(3, 2, 4);
  const requested = { page: 0, level: 2, x: 1, y: 2 };
  expect(select([requested], [base, detailed])).toEqual([base, detailed]);
});

it('never overlays obsolete image pixels after a source image upgrade', () => {
  const base = { ...resident(0, 0, 0), revision: 1 };
  const stale = resident(3, 2, 4);
  expect(select([{ page: 0, level: 2, x: 1, y: 2 }], [base, stale], 1)).toEqual([base]);
});

it('keeps parents during crossfade and excludes unrelated offscreen detail', () => {
  const base = resident(0, 0, 0);
  const detail = { ...resident(2, 1, 2), readyAt: 950 };
  const outside = resident(3, 7, 7);
  expect(select([detail.tile], [base, detail, outside])).toEqual([base, detail]);
  expect(select([detail.tile], [base, { ...detail, readyAt: 0 }, outside])).toEqual([{ ...detail, readyAt: 0 }]);
});

it('stops drawing oversized descendants once the requested physical-pixel LOD is ready', () => {
  const target = resident(2, 1, 2);
  const detail = resident(3, 2, 4);
  expect(select([target.tile], [target, detail])).toEqual([target]);
});

function resident(level: number, x: number, y: number): ResidentPageTile {
  return { tile: { page: 0, level, x, y }, revision: 0, readyAt: 0 };
}

function select(tiles: PageTile[], entries: ResidentPageTile[], revision = 0) {
  return selectPageTiles(
    new Map(tiles.map((tile) => [pageTileKey(tile), tile])),
    new Map(entries.map((entry) => [pageTileKey(entry.tile), entry])),
    new Map([[0, revision]]),
    1000,
    100
  );
}
