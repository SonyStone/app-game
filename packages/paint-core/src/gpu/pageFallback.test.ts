import { expect, it } from 'vitest';
import { pageCrop, pageFallback } from './pageFallback';
import { MAX_LEVEL } from '../virtualPages';
const page = (level: number, x: number, y: number, layerId = 'paint') => ({ page: { level, x, y, layerId } });

it('keeps previously visible fine pages during zoom-out without painting missing areas', () => {
  const children = [page(0, -2, -2), page(0, -1, -2), page(0, -2, -1), page(0, -1, -1)];
  expect(pageFallback(page(4, -1, -1).page, [...children, page(0, 0, 0), page(0, -1, -1, 'other')])).toEqual(
    children.map((source) => ({ source, region: source.page }))
  );
});
it('crops the closest ancestor to the target, including negative origins', () => {
  const closer = page(2, -1, -1),
    target = page(0, -1, -2).page;
  expect(pageFallback(target, [page(4, -1, -1), closer])).toEqual([{ source: closer, region: target }]);
  expect(pageCrop(closer.page, target)).toEqual({ x: 0.75, y: 0.5, scale: 0.25 });
});
it('shows ready details immediately and covers each translucent pixel exactly once', () => {
  const parent = page(3, -1, -1),
    child = page(0, -3, -3),
    other = page(1, -4, -4);
  const result = pageFallback(page(2, -1, -1).page, [parent, child, other]);
  expect(result.some((r) => r.source === child)).toBe(true);
  for (let y = -4; y < 0; y++)
    for (let x = -4; x < 0; x++) {
      const matches = result.filter(({ region }) => {
        const side = 2 ** region.level;
        return x >= region.x * side && x < (region.x + 1) * side && y >= region.y * side && y < (region.y + 1) * side;
      });
      expect(matches).toHaveLength(1);
      expect(matches[0]!.source).toBe(x === -3 && y === -3 ? child : parent);
      const crop = pageCrop(matches[0]!.source.page, matches[0]!.region);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.scale).toBeLessThanOrEqual(1);
    }
});
it('does not allow ancestor fallback to overwrite a neighboring exact page', () => {
  const ancestor = page(4, 0, 0),
    exact = page(0, 1, 0);
  const result = [page(0, 0, 0), exact].flatMap((target) => pageFallback(target.page, [ancestor, exact]));
  expect(result).toEqual([
    { source: ancestor, region: page(0, 0, 0).page },
    { source: exact, region: exact.page }
  ]);
});
it('bounds refinement geometry by resident pages and tree depth, not world area', () => {
  const resident = [page(MAX_LEVEL, 0, 0), ...Array.from({ length: 255 }, (_, i) => page(0, i * 16, (i * 73) % 4096))];
  const result = pageFallback(page(MAX_LEVEL - 1, 0, 0).page, resident);
  expect(result.length).toBeLessThanOrEqual(256 * (3 * MAX_LEVEL + 1));
  expect(result.reduce((area, { region }) => area + 4 ** region.level, 0)).toBe(4 ** (MAX_LEVEL - 1));
});
