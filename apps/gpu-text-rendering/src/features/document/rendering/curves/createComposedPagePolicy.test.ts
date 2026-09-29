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
