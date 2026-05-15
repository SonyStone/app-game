import { accepts, wouldCycle } from 'src/core/tagConstraints';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: accepts
// ============================================================================

describe('tagConstraints', () => {
  describe('accepts', () => {
    it('accepts everything when container has no accepts list', () => {
      expect(accepts(undefined, ['item'])).toBe(true);
      expect(accepts([], ['item'])).toBe(true);
    });

    it('accepts everything when container has no accepts and item has no tags', () => {
      expect(accepts(undefined, undefined)).toBe(true);
      expect(accepts(undefined, [])).toBe(true);
    });

    it('accepts when at least one tag matches', () => {
      expect(accepts(['item', 'folder'], ['item'])).toBe(true);
      expect(accepts(['item'], ['item', 'special'])).toBe(true);
    });

    it('rejects when no tag matches', () => {
      expect(accepts(['folder'], ['item'])).toBe(false);
      expect(accepts(['a', 'b'], ['c', 'd'])).toBe(false);
    });

    it('rejects when container has constraints but item has no tags', () => {
      expect(accepts(['item'], undefined)).toBe(false);
      expect(accepts(['item'], [])).toBe(false);
    });
  });

  // ============================================================================
  // MARK: wouldCycle
  // ============================================================================

  describe('wouldCycle', () => {
    // Tree:  root → A → B → C
    const parents = new Map<string, string>([
      ['C', 'B'],
      ['B', 'A'],
      ['A', 'root']
    ]);
    const getParent = (key: string) => parents.get(key);

    it('detects cycle: dragging A into its child B', () => {
      expect(wouldCycle('A', 'B', getParent)).toBe(true);
    });

    it('detects cycle: dragging A into its grandchild C', () => {
      expect(wouldCycle('A', 'C', getParent)).toBe(true);
    });

    it('no cycle: dragging C into A (C is a child of A, moving up is fine)', () => {
      expect(wouldCycle('C', 'A', getParent)).toBe(false);
    });

    it('no cycle: dragging B into root', () => {
      expect(wouldCycle('B', 'root', getParent)).toBe(false);
    });

    it('no cycle: unrelated keys', () => {
      expect(wouldCycle('X', 'A', getParent)).toBe(false);
    });

    it('no cycle: dragging into itself is a cycle', () => {
      // Moving a container into itself should be rejected
      expect(wouldCycle('A', 'A', getParent)).toBe(true);
    });
  });
});
