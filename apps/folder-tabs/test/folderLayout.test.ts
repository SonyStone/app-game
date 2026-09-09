import { describe, expect, it } from 'vitest';
import { fitFolderSlots, folderRows, reorderTab } from '../src/folderLayout';

describe('horizontal folder order', () => {
  it('returns escaped slots to the field while retaining ordered distinct positions', () => {
    for (const slots of [[-4, -3, -2, -1], [2, 3, 4, 5], [-2, 0.3, 0.7, 3]]) {
      const fitted = fitFolderSlots(slots);
      expect(fitted[0]).toBeGreaterThanOrEqual(0);
      expect(fitted.at(-1)).toBeLessThanOrEqual(1);
      fitted.slice(1).forEach((slot, index) => expect(slot).toBeGreaterThan(fitted[index]!));
    }
    expect(fitFolderSlots([0, 0.3, 0.7, 1])).toEqual([0, 0.3, 0.7, 1]);
    expect(fitFolderSlots([-1])).toEqual([0]);
    expect(fitFolderSlots([2])).toEqual([1]);
  });
  it('moves crossed neighbors into vacated slots without mutating the original list', () => {
    const order = ['a', 'b', 'c', 'd'];
    const slots = [0, 10, 20, 30];
    expect(reorderTab(order, 'b', 26, slots)).toEqual(['a', 'c', 'd', 'b']);
    expect(reorderTab(order, 'c', -20, slots)).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderTab(order, 'b', 10, slots)).toEqual(order);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps overlapping handles on separate rows across horizontal arrangements', () => {
    const depth = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (const width of [18, 30, 48]) {
      for (const order of [depth, [...depth].reverse(), ['c', 'a', 'h', 'b', 'f', 'd', 'g', 'e']]) {
        const left = (id: string) => order.indexOf(id) * 10;
        const rows = folderRows(depth, left, width);
        depth.forEach((id, index) => {
          for (const behind of depth.slice(0, index)) {
            expect(rows.get(id)!).toBeGreaterThan(rows.get(behind)!);
            if (Math.abs(left(id) - left(behind)) < width) {
              expect(rows.get(id)! - rows.get(behind)!).toBeGreaterThanOrEqual(6.2 - 1e-9);
            }
          }
        });
      }
    }
  });
});
