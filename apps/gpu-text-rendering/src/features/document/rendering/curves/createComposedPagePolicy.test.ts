import { describe, expect, it, vi } from 'vitest';
import type { SceneFrame } from '../createFrame';
import { createComposedPagePolicy } from './createComposedPagePolicy';

const document = { pages: Array.from({ length: 8 }, (_, index) => ({ height: index === 7 ? 2 : 1 })) };
const composition = { pages: new Set([0, 1, 5, 6, 7]), overview: new Set([5, 6, 7]) };

describe('createComposedPagePolicy', () => {
  it('composes required pages always and never composes pages without a prefix', () => {
    const { policy } = setup();
    const reading = frame([0, 2], 4);

    expect(policy.useComposedPage(0, reading)).toBe(true);
    expect(policy.useComposedPage(2, reading)).toBe(false);
    expect([...policy.composedPages(reading)]).toEqual([0]);
  });

  it('composes overview-only pages in a multi-page overview of small pages', () => {
    const { policy } = setup();

    // 1000 px viewport, scale 1: each unit-height page is 500 px tall.
    expect([...policy.composedPages(frame([0, 1, 2, 3, 5, 6], 1))]).toEqual([0, 1, 5, 6]);
    // The same pages magnified exceed 512 px, and four pages are not an overview.
    expect([...policy.composedPages(frame([0, 1, 2, 3, 5, 6], 2))]).toEqual([0, 1]);
    expect([...policy.composedPages(frame([0, 1, 5, 6], 1))]).toEqual([0, 1]);
    // Taller pages are measured by their own height.
    expect(policy.useComposedPage(7, frame([0, 1, 2, 3, 7], 1))).toBe(false);
  });

  it('enters optional pages only once their tiles cover the view', () => {
    const { policy } = setup();
    const drawn = new Set([6]);
    const covered = new Set<number>();

    policy.enterComposedPages(drawn, new Set([0, 5]), (page) => covered.has(page));
    expect([...drawn]).toEqual([0]);

    covered.add(5);
    policy.enterComposedPages(drawn, new Set([0, 5]), (page) => covered.has(page));
    expect([...drawn].sort()).toEqual([0, 5]);

    // Entered pages stay composed while refinement replaces their tiles.
    covered.clear();
    policy.enterComposedPages(drawn, new Set([0, 5]), (page) => covered.has(page));
    expect([...drawn].sort()).toEqual([0, 5]);
  });

  it('lets at most four uncovered optional pages wait for their tiles', () => {
    const pages = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
    const policy = createComposedPagePolicy(document, { pages, overview: pages }, { has: () => false, observe() {} });
    const drawn = new Set<number>();

    policy.enterComposedPages(drawn, pages, () => false);
    expect([...drawn]).toEqual([4, 5, 6, 7]);
  });

  it('offers whole-page overview tiles in a multi-page overview, with hysteresis for drawn pages', () => {
    const policy = createComposedPagePolicy(
      document,
      { ...composition, wholePages: new Set([0, 2, 3, 4]) },
      {
        has: () => false,
        observe() {}
      }
    );
    const pages = [0, 1, 2, 3, 4];

    // 500 px pages are within the threshold; page 1 has no whole-page tiles.
    expect([...policy.overviewTilePages(frame(pages, 1), new Set())]).toEqual([0, 2, 3, 4]);
    // 560 px pages exceed it unless already drawn from tiles.
    expect([...policy.overviewTilePages(frame(pages, 1.12), new Set())]).toEqual([]);
    expect([...policy.overviewTilePages(frame(pages, 1.12), new Set([2]))]).toEqual([2]);
    expect([...policy.overviewTilePages(frame(pages, 1.4), new Set([2]))]).toEqual([]);
    // Reading views and vector-only frames never use them.
    expect([...policy.overviewTilePages(frame([0, 2, 3, 4], 1), new Set())]).toEqual([]);
    expect([...policy.overviewTilePages({ ...frame(pages, 1), vectorOnly: true }, new Set())]).toEqual([]);
  });

  it('enters whole-page tiles once covered, or early once their fallback exists', () => {
    const { policy } = setup();
    const drawn = new Set([7]);
    const options = { covered: (page: number) => page === 0, based: (page: number) => page !== 3, early: false };

    policy.enterWholePages(drawn, new Set([0, 2, 3]), options);
    expect([...drawn]).toEqual([0]);

    policy.enterWholePages(drawn, new Set([0, 2, 3]), { ...options, early: true });
    expect([...drawn].sort()).toEqual([0, 2]);
  });

  it('keeps budget-retained overview pages composed at any scale', () => {
    const { policy, budget } = setup();
    budget.has.mockImplementation((page) => page === 6);

    expect([...policy.composedPages(frame([5, 6], 4))]).toEqual([6]);
  });

  it('observes only bypassed overview pages and never samples vector-only frames', () => {
    const { policy, budget } = setup();
    const reading = frame([0, 2, 5, 6], 4);

    policy.observeDirectCost(reading, policy.composedPages(reading));
    policy.observeDirectCost({ ...reading, vectorOnly: true }, new Set());

    expect(budget.observe).toHaveBeenCalledExactlyOnceWith([5, 6]);
  });
});

function setup() {
  const budget = { has: vi.fn<(page: number) => boolean>(() => false), observe: vi.fn<(pages: number[]) => void>() };
  return { budget, policy: createComposedPagePolicy(document, composition, budget) };
}

function frame(visible: number[], scale: number) {
  return {
    width: 1000,
    height: 1000,
    mul: [scale, scale],
    add: [0, 0],
    rotation: [1, 0, 0, 1],
    visible: visible.map((index) => ({ index, page: {} })),
    vectorOnly: false,
    grids: false
  } as unknown as SceneFrame;
}
