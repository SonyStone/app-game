import { expect, it } from 'vitest';
import type { TextDocument } from '../../document';
import { createFrame } from '../createFrame';
import { pageTileFrame, pageTileRect, visiblePageTiles } from './pageTiles';

const document = { pages: [{ x: -2, y: 3, width: 200, height: 100, beginVertex: 0, endVertex: 6 }] } as TextDocument;

it('places adjacent tiles in world space and maps their interiors inside the sampling gutter', () => {
  const left = { page: 0, level: 2, x: 1, y: 2 };
  const right = { ...left, x: 2 };
  const a = pageTileRect(document, left);
  const b = pageTileRect(document, right);
  expect(a.x + a.width).toBe(b.x);
  const frame = pageTileFrame(document, left);
  const pixelX = (x: number) => ((x * frame.mul[0] + frame.add[0] + 1) * frame.width) / 2;
  const pixelY = (y: number) => ((1 - y * frame.mul[1] - frame.add[1]) * frame.height) / 2;
  expect(pixelX(a.x)).toBeCloseTo(2);
  expect(pixelX(a.x + a.width)).toBeCloseTo(frame.width - 2);
  expect(pixelY(a.y)).toBeCloseTo(2);
  expect(pixelY(a.y - a.height)).toBeCloseTo(frame.height - 2);
});

it('increases detail with physical pixel density and retains a bounded working set at extreme zoom', () => {
  const camera = { x: 2.5, y: -2.5, zoom: 0.5, rotation: 0 };
  const normal = visiblePageTiles(document, 0, createFrame(document, camera, 800, 600));
  const retina = visiblePageTiles(document, 0, createFrame(document, camera, 1600, 1200));
  expect(retina[0]!.level).toBe(normal[0]!.level + 1);
  const close = visiblePageTiles(document, 0, createFrame(document, { ...camera, zoom: 0.0001 }, 800, 600));
  expect(close.length).toBeGreaterThan(0);
  expect(close.length).toBeLessThan(100);
});

it('inverts rotation when selecting visible page regions', () => {
  const frame = createFrame(document, { x: 2.5, y: -2.5, zoom: 0.12, rotation: Math.PI / 2 }, 800, 600);
  const tiles = visiblePageTiles(document, 0, frame);
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.y).toBeGreaterThanOrEqual(0);
    expect(tile.x).toBeLessThan(2 ** tile.level);
    expect(tile.y).toBeLessThan(2 ** tile.level);
  }
});

it('can reserve the root for a smaller pinned preview without using it as sharp detail', () => {
  const frame = createFrame(document, { x: 2.5, y: -2.5, zoom: 2, rotation: 0 }, 800, 600);
  expect(visiblePageTiles(document, 0, frame, 512)[0]!.level).toBe(0);
  expect(visiblePageTiles(document, 0, frame, 512, 1)[0]!.level).toBe(1);
});

it('keeps one whole-page tile for the first split levels, then quadrants of the largest whole-page size', () => {
  const far = createFrame(document, { x: 2.5, y: -2.5, zoom: 4, rotation: 0 }, 800, 600);
  const near = createFrame(document, { x: 2.5, y: -2.5, zoom: 0.5, rotation: 0 }, 800, 600);

  expect(visiblePageTiles(document, 0, far, 64, 0, 3)).toEqual([{ page: 0, level: 1, x: 0, y: 0 }]);
  expect(visiblePageTiles(document, 0, near, 64, 0, 3).every(({ level }) => level > 3)).toBe(true);
  expect(pageTileRect(document, { page: 0, level: 3, x: 0, y: 0 }, 3).width).toBe(1);
  expect(pageTileFrame(document, { page: 0, level: 2, x: 0, y: 0 }, 64, 3).width).toBe(256 + 4);
  expect(pageTileRect(document, { page: 0, level: 4, x: 1, y: 0 }, 3).width).toBe(0.5);
  expect(pageTileFrame(document, { page: 0, level: 4, x: 1, y: 0 }, 64, 3).width).toBe(512 + 4);
});
