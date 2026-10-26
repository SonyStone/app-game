import { describe, expect, it } from 'vitest';
import { findPosts } from './front';
import { KOTH_MAP } from './map';
import { createNavGrid, sightClear } from './navigation';

describe('posts in front of the point', () => {
  it('stand one on each way the enemy comes by, out from the point toward its side, beside cover, watching the way', () => {
    const grid = createNavGrid(KOTH_MAP);

    for (const team of ['red', 'blue'] as const) {
      const posts = findPosts(grid, KOTH_MAP, team);
      const toward = team === 'red' ? 1 : -1;
      console.log(team, JSON.stringify(posts.map((post) => ({ lane: post.lane, at: [Math.round(post.at.x), Math.round(post.at.y)], watch: [Math.round(post.watch.x), Math.round(post.watch.y)] }))));

      expect(posts.map((post) => post.lane)).toEqual(['center', 'north', 'south']);

      for (const post of posts) {
        expect(post.at.x * toward).toBeGreaterThan(150);
        expect(Math.hypot(post.at.x, post.at.y)).toBeLessThan(560);
        expect(sightClear(grid, post.at, post.watch)).toBe(true);
      }
    }
  });
});
