import { expect, it } from 'vitest';
import { disjointPages, pageFallback } from './pageFallback';
const page = (level: number, x: number, y: number, layerId = 'paint') => ({ page: { level, x, y, layerId } });

it('keeps all previously visible fine pages during a multi-level zoom-out', () => {
  const children = [page(0, -2, -2), page(0, -1, -2), page(0, -2, -1), page(0, -1, -1)];
  expect(pageFallback(page(4, -1, -1).page, [...children, page(0, 0, 0), page(0, -1, -1, 'other')])).toEqual(children);
});
it('uses the closest available ancestor while zooming in', () => {
  const closer = page(2, -1, -1);
  expect(pageFallback(page(0, -1, -1).page, [page(4, -1, -1), closer])).toEqual([closer]);
});
it('does not double alpha where newly ready overviews overlap retained children', () => {
  const parent = page(1, 0, 0),
    outside = page(0, 2, 0);
  expect(disjointPages([page(0, 0, 0), parent, page(0, 1, 1), outside])).toEqual([parent, outside]);
});
