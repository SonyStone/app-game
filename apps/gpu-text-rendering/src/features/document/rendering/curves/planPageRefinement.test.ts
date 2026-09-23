import { expect, it } from 'vitest';
import { pageTileKey } from './pageTiles';
import { planPageRefinement } from './planPageRefinement';

const children = [0, 1, 2, 3].map((i) => ({ page: 2, level: 3, x: i % 2, y: Math.floor(i / 2) }));
const parent = { page: 2, level: 2, x: 0, y: 0 };

it('covers missing surroundings once before spending four jobs on finer regions', () => {
  const jobs = planPageRefinement(children, () => false, true);
  expect(jobs).toEqual([{ tile: parent, source: pageTileKey(children[0]!) }]);
  expect(planPageRefinement(children, (key) => key === pageTileKey(parent), true).map((job) => job.tile)).toEqual(
    children
  );
});

it('does not delay zoom-in with intermediate levels, or replace already resident fine tiles', () => {
  expect(planPageRefinement(children, () => false, false).map((job) => job.tile)).toEqual(children);
  expect(planPageRefinement(children, () => true, true).map((job) => job.tile)).toEqual(children);
});
