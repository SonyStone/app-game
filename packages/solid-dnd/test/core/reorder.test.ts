import { reorderItems } from 'src/core/reorder';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Helpers
// ============================================================================

type Item = { id: string; label: string };

const items: Item[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
  { id: 'e', label: 'E' }
];

const getKey = (i: Item) => i.id;
const ids = (arr: Item[]) => arr.map((i) => i.id);

// ============================================================================
// MARK: Tests
// ============================================================================

describe('reorderItems', () => {
  describe('single item', () => {
    it('moves item before another', () => {
      const result = reorderItems(items, ['c'], { parent: 'list', before: 'a' }, getKey);
      expect(ids(result)).toEqual(['c', 'a', 'b', 'd', 'e']);
    });

    it('moves item to append (before: null)', () => {
      const result = reorderItems(items, ['a'], { parent: 'list', before: null }, getKey);
      expect(ids(result)).toEqual(['b', 'c', 'd', 'e', 'a']);
    });

    it('moves item before its neighbor (swap-like)', () => {
      const result = reorderItems(items, ['b'], { parent: 'list', before: 'd' }, getKey);
      expect(ids(result)).toEqual(['a', 'c', 'b', 'd', 'e']);
    });

    it('noop when item is already in position', () => {
      // 'a' before 'b' is already the current order
      const result = reorderItems(items, ['a'], { parent: 'list', before: 'b' }, getKey);
      expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('returns original array when moved key is not found', () => {
      const result = reorderItems(items, ['z'], { parent: 'list', before: 'b' }, getKey);
      expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('appends when before key is not found', () => {
      const result = reorderItems(items, ['b'], { parent: 'list', before: 'z' }, getKey);
      expect(ids(result)).toEqual(['a', 'c', 'd', 'e', 'b']);
    });
  });

  describe('multiple items', () => {
    it('moves multiple items before a target', () => {
      const result = reorderItems(items, ['a', 'c'], { parent: 'list', before: 'e' }, getKey);
      expect(ids(result)).toEqual(['b', 'd', 'a', 'c', 'e']);
    });

    it('preserves relative order of moved items', () => {
      // Even though keys are ['c', 'a'], the items appear as a,c in original order
      const result = reorderItems(items, ['c', 'a'], { parent: 'list', before: 'e' }, getKey);
      expect(ids(result)).toEqual(['b', 'd', 'a', 'c', 'e']);
    });

    it('moves multiple items to append', () => {
      const result = reorderItems(items, ['a', 'b'], { parent: 'list', before: null }, getKey);
      expect(ids(result)).toEqual(['c', 'd', 'e', 'a', 'b']);
    });

    it('moves all items (noop-like)', () => {
      const result = reorderItems(items, ['a', 'b', 'c', 'd', 'e'], { parent: 'list', before: null }, getKey);
      expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('handles before key being one of the moved items', () => {
      // 'c' is being moved AND is the before target — 'c' gets removed from
      // the "without" array, so the before lookup falls back to append.
      const result = reorderItems(items, ['a', 'c'], { parent: 'list', before: 'c' }, getKey);
      expect(ids(result)).toEqual(['b', 'd', 'e', 'a', 'c']);
    });
  });

  describe('edge cases', () => {
    it('empty items array', () => {
      const result = reorderItems([], ['a'], { parent: 'list', before: null }, getKey);
      expect(result).toEqual([]);
    });

    it('empty moved keys', () => {
      const result = reorderItems(items, [], { parent: 'list', before: 'b' }, getKey);
      expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('works with numeric keys', () => {
      const numItems = [{ n: 1 }, { n: 2 }, { n: 3 }];
      const result = reorderItems(numItems, [3], { parent: 0, before: 1 }, (i) => i.n);
      expect(result.map((i) => i.n)).toEqual([3, 1, 2]);
    });
  });

  describe('Set API', () => {
    it('accepts a Set<K> for movedKeys', () => {
      const result = reorderItems(items, new Set(['c']), { parent: 'list', before: 'a' }, getKey);
      expect(ids(result)).toEqual(['c', 'a', 'b', 'd', 'e']);
    });

    it('accepts a Set<K> for multiple moved items', () => {
      const result = reorderItems(items, new Set(['a', 'c']), { parent: 'list', before: 'e' }, getKey);
      expect(ids(result)).toEqual(['b', 'd', 'a', 'c', 'e']);
    });

    it('accepts a Set<K> for append', () => {
      const result = reorderItems(items, new Set(['a', 'b']), { parent: 'list', before: null }, getKey);
      expect(ids(result)).toEqual(['c', 'd', 'e', 'a', 'b']);
    });

    it('returns original array when Set is empty', () => {
      const result = reorderItems(items, new Set<string>(), { parent: 'list', before: 'b' }, getKey);
      expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
  });
});
