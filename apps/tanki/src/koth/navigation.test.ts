import { describe, expect, it } from 'vitest';
import { canDrive, cellCenter, createNavGrid, findPath, isOpenAt, pathLength, searchNearest, sightClear } from './navigation';

describe('findPath', () => {
  const grid = createNavGrid({
    halfWidth: 400,
    halfHeight: 300,
    // A wall across the middle with a gap at the bottom.
    walls: [{ x: 0, y: -60, halfWidth: 14, halfHeight: 240 }]
  });

  it('drives around a wall through its gap, keeping the hull clear', () => {
    const path = findPath(grid, { x: -200, y: -100 }, { x: 200, y: -100 })!;

    expect(path).toBeDefined();
    expect(path[0]).toEqual({ x: -200, y: -100 });
    expect(path.at(-1)).toEqual({ x: 200, y: -100 });
    // The way round goes below the wall's end at y = 180.
    expect(Math.max(...path.map((point) => point.y))).toBeGreaterThan(180 + grid.clearance - 1);
    expect(pathLength(path)).toBeGreaterThan(600);

    for (let index = 1; index < path.length; index++) {
      expect(canDrive(grid, path[index - 1], path[index])).toBe(true);
    }
  });

  it('straightens a path in open ground to a single segment', () => {
    expect(findPath(grid, { x: -300, y: -200 }, { x: -100, y: 100 })).toEqual([
      { x: -300, y: -200 },
      { x: -100, y: 100 }
    ]);
  });

  it('gives up on a goal walled in on every side', () => {
    const boxed = createNavGrid({
      halfWidth: 400,
      halfHeight: 300,
      walls: [
        { x: 200, y: -100, halfWidth: 100, halfHeight: 10 },
        { x: 200, y: 100, halfWidth: 100, halfHeight: 10 },
        { x: 100, y: 0, halfWidth: 10, halfHeight: 100 },
        { x: 300, y: 0, halfWidth: 10, halfHeight: 100 }
      ]
    });

    expect(isOpenAt(boxed, { x: 200, y: 0 })).toBe(true);
    expect(findPath(boxed, { x: -200, y: 0 }, { x: 200, y: 0 })).toBeUndefined();
  });

  it('gives up on a goal deep inside a wall', () => {
    const solid = createNavGrid({ halfWidth: 400, halfHeight: 300, walls: [{ x: 0, y: 0, halfWidth: 150, halfHeight: 150 }] });

    expect(findPath(solid, { x: -300, y: 0 }, { x: 0, y: 0 })).toBeUndefined();
  });

  it('detours around cells that cost more', () => {
    const open = createNavGrid({ halfWidth: 400, halfHeight: 300 });
    const danger = (cell: number) => {
      const row = Math.floor(cell / open.cols);
      return row >= 10 && row <= 20 ? 20 : 0;
    };
    const path = findPath(open, { x: -300, y: -50 }, { x: 300, y: -50 }, { cost: danger })!;

    expect(Math.min(...path.map((point) => point.y))).toBeLessThan(-100);
  });
});

describe('sight and search', () => {
  const grid = createNavGrid({ halfWidth: 400, halfHeight: 300, walls: [{ x: 0, y: 0, halfWidth: 20, halfHeight: 100 }] });

  it('sees past a wall but not through it', () => {
    expect(sightClear(grid, { x: -200, y: 0 }, { x: 200, y: 0 })).toBe(false);
    expect(sightClear(grid, { x: -200, y: 200 }, { x: 200, y: 200 })).toBe(true);
  });

  it('finds the nearest cell hidden behind the wall', () => {
    const enemy = { x: -300, y: 0 };
    const start = { x: 100, y: -200 };
    const cell = searchNearest(grid, start, 1000, (candidate) => !sightClear(grid, enemy, cellCenter(grid, candidate)))!;
    const hidden = cellCenter(grid, cell);

    expect(sightClear(grid, enemy, start)).toBe(true);
    expect(sightClear(grid, enemy, hidden)).toBe(false);
    // The shadow's edge passes about 50 px below the start.
    expect(Math.hypot(hidden.x - start.x, hidden.y - start.y)).toBeLessThan(80);
  });
});
