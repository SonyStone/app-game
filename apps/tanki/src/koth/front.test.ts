import { describe, expect, it } from 'vitest';
import { findPosts, findShortcuts, isOpened } from './front';
import { KOTH_MAP } from './map';
import { cellCenter, createNavGrid, sightClear } from './navigation';

describe('posts in front of the point', () => {
  it('stand one on each way the enemy comes by, out from the point toward its side, beside cover, watching the way', () => {
    const grid = createNavGrid(KOTH_MAP);

    for (const team of ['red', 'blue'] as const) {
      const posts = findPosts(grid, KOTH_MAP, team);
      const toward = team === 'red' ? 1 : -1;

      expect(posts.map((post) => post.lane)).toEqual(['center', 'north', 'south']);

      for (const post of posts) {
        expect(post.at.x * toward).toBeGreaterThan(150);
        expect(Math.hypot(post.at.x, post.at.y)).toBeLessThan(560);
        expect(sightClear(grid, post.at, post.watch)).toBe(true);
      }
    }
  });
});

describe('shortcuts on a team’s own side', () => {
  it('include the wooden fence across the north alley beside the hall, a short way from the hall to the north street', () => {
    const grid = createNavGrid(KOTH_MAP);
    // Thin walls of wood or brick, as the team board allows breaking through.
    const thin = (KOTH_MAP.walls ?? []).filter((wall) => (wall.material === 'wood' || wall.material === 'brick') && Math.min(wall.halfWidth, wall.halfHeight) * 2 <= 40);
    const breakable = (cell: number) => {
      const at = cellCenter(grid, cell);
      return thin.some((wall) => Math.abs(at.x - wall.x) <= wall.halfWidth + grid.clearance + 2 && Math.abs(at.y - wall.y) <= wall.halfHeight + grid.clearance + 2);
    };

    for (const team of ['red', 'blue'] as const) {
      const shortcuts = findShortcuts(grid, KOTH_MAP, team, breakable);

      const fence = shortcuts.find((shortcut) => shortcut.lane === 'north');
      const side = team === 'red' ? -1 : 1;

      expect(fence?.wall.x).toBeCloseTo(610 * side, -1);
      expect(fence?.wall.y).toBeCloseTo(-210, -1);

      for (const shortcut of shortcuts) {
        expect(isOpened(grid, shortcut)).toBe(false);
      }
    }
  });
});
