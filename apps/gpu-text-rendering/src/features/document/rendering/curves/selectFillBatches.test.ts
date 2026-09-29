import { describe, expect, it } from 'vitest';
import { selectFillBatches, type CurveBatch } from './selectFillBatches';

describe('selectFillBatches', () => {
  it('chooses cached, analytic and simple fills by scale and keeps clipped batches on the general shader', () => {
    const batches = [
      batch(0, 2, { cacheScale: 1 }),
      batch(2, 1, { simple: false }),
      batch(3, 4, { cacheScale: 16, minimumScale: 8 }),
      batch(7, 1, { cacheScale: 16, minimumScale: 2 })
    ];

    expect(selectFillBatches(batches, 2, 4)).toEqual([
      { kind: 'cached', first: 0, count: 2 },
      { kind: 'curve', first: 2, count: 1 },
      { kind: 'analytic', first: 3, count: 4 },
      { kind: 'simple', first: 7, count: 1 }
    ]);
  });

  it('merges adjacent batches that select the same shader', () => {
    const batches = [batch(4, 1, { cacheScale: 1 }), batch(5, 3, { cacheScale: 2 }), batch(8, 2)];

    expect(selectFillBatches(batches, 2, Infinity)).toEqual([
      { kind: 'cached', first: 4, count: 4 },
      { kind: 'simple', first: 8, count: 2 }
    ]);
  });

  it('collapses more than two pipeline changes of ordinary fills into one simple draw', () => {
    const batches = [batch(10, 1, { cacheScale: 1 }), batch(11, 2), batch(13, 1, { cacheScale: 1 }), batch(14, 5)];

    expect(selectFillBatches(batches, 2, Infinity)).toEqual([{ kind: 'simple', first: 10, count: 9 }]);
  });

  it('keeps exactly two changes, or any change around a clipped batch, as separate ordered draws', () => {
    const two = [batch(0, 1, { cacheScale: 1 }), batch(1, 1), batch(2, 1, { cacheScale: 1 })];
    const clipped = [
      batch(0, 1, { cacheScale: 1 }),
      batch(1, 1),
      batch(2, 1, { simple: false }),
      batch(3, 1, { cacheScale: 1 })
    ];

    expect(selectFillBatches(two, 2, Infinity).map(({ kind }) => kind)).toEqual(['cached', 'simple', 'cached']);
    expect(selectFillBatches(clipped, 2, Infinity).map(({ kind }) => kind)).toEqual([
      'cached',
      'simple',
      'curve',
      'cached'
    ]);
  });

  it('returns no draws for an empty run', () => {
    expect(selectFillBatches([], 1, 1)).toEqual([]);
  });
});

function batch(first: number, count: number, overrides: Partial<CurveBatch> = {}): CurveBatch {
  return { first, count, simple: true, cacheScale: Infinity, minimumScale: 1, ...overrides };
}
