import { describe, expect, it } from 'vitest';
import { computeDisplayKeys, computeTreeDisplayKeys, GAP_KEY } from '../../src/core/displayList';

// ============================================================================
// MARK: computeDisplayKeys
// ============================================================================

describe('computeDisplayKeys', () => {
  const keys = ['a', 'b', 'c', 'd'];

  it('returns all items when nothing is dragged and no place', () => {
    const result = computeDisplayKeys(keys, new Set(), undefined, 'list');
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes dragged items when no place', () => {
    const result = computeDisplayKeys(keys, new Set(['b']), undefined, 'list');
    // Dragged items are removed from the display list
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('removes dragged items and inserts gap before a specific key', () => {
    const result = computeDisplayKeys(keys, new Set(['b']), { parent: 'list', before: 'c' }, 'list');
    // 'b' removed from list, gap inserted before 'c'
    expect(result).toEqual(['a', GAP_KEY, 'c', 'd']);
  });

  it('appends gap when before is null', () => {
    const result = computeDisplayKeys(keys, new Set(['b']), { parent: 'list', before: null }, 'list');
    expect(result).toEqual(['a', 'c', 'd', GAP_KEY]);
  });

  it('inserts gap before first item', () => {
    const result = computeDisplayKeys(keys, new Set(['c']), { parent: 'list', before: 'a' }, 'list');
    expect(result).toEqual([GAP_KEY, 'a', 'b', 'd']);
  });

  it('ignores place when parent does not match containerKey', () => {
    const result = computeDisplayKeys(keys, new Set(['b']), { parent: 'other-container', before: 'c' }, 'list');
    // No gap inserted, dragged items still removed
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('handles multiple dragged keys', () => {
    const result = computeDisplayKeys(keys, new Set(['a', 'c']), { parent: 'list', before: 'd' }, 'list');
    // Both 'a' and 'c' removed, gap before 'd'
    expect(result).toEqual(['b', GAP_KEY, 'd']);
  });

  it('handles empty list with append place', () => {
    const result = computeDisplayKeys([], new Set<string>(), { parent: 'list', before: null }, 'list');
    expect(result).toEqual([GAP_KEY]);
  });

  it('handles all items dragged with append place', () => {
    const result = computeDisplayKeys(keys, new Set(['a', 'b', 'c', 'd']), { parent: 'list', before: null }, 'list');
    // All items removed, only gap remains
    expect(result).toEqual([GAP_KEY]);
  });

  it('inserts gap before a dragged key if place.before references it', () => {
    const result = computeDisplayKeys(['a', 'b', 'c'], new Set(['b']), { parent: 'list', before: 'b' }, 'list');
    // Gap inserted at 'b' position, 'b' removed
    expect(result).toEqual(['a', GAP_KEY, 'c']);
  });

  it('preserves original order without dragged items', () => {
    const result = computeDisplayKeys(
      ['x', 'y', 'z', 'w'],
      new Set(['y', 'w']),
      { parent: 'list', before: 'z' },
      'list'
    );
    // 'y' and 'w' removed, gap before 'z'
    expect(result).toEqual(['x', GAP_KEY, 'z']);
  });

  it('only inserts one gap', () => {
    const result = computeDisplayKeys(['a', 'b'], new Set<string>(), { parent: 'list', before: 'a' }, 'list');
    expect(result).toEqual([GAP_KEY, 'a', 'b']);
    expect(result.filter((k) => k === GAP_KEY)).toHaveLength(1);
  });
});

// ============================================================================
// MARK: computeTreeDisplayKeys
// ============================================================================

describe('computeTreeDisplayKeys', () => {
  const tree = {
    root: ['groupA', 'groupB'] as string[],
    groupA: ['x', 'y'] as string[],
    groupB: ['z'] as string[]
  };

  it('returns all items with no drag state', () => {
    const result = computeTreeDisplayKeys(tree, new Set(), undefined);
    expect(result['root']).toEqual(['groupA', 'groupB']);
    expect(result['groupA']).toEqual(['x', 'y']);
    expect(result['groupB']).toEqual(['z']);
  });

  it('removes dragged item from its container', () => {
    const result = computeTreeDisplayKeys(tree, new Set(['y']), undefined);
    // 'y' removed from groupA
    expect(result['groupA']).toEqual(['x']);
    expect(result['groupB']).toEqual(['z']);
  });

  it('removes dragged item and inserts gap in target container', () => {
    const result = computeTreeDisplayKeys(tree, new Set(['y']), { parent: 'groupB', before: 'z' });
    // 'y' removed from groupA
    expect(result['groupA']).toEqual(['x']);
    // Gap inserted in groupB before 'z'
    expect(result['groupB']).toEqual([GAP_KEY, 'z']);
    expect(result['root']).toEqual(['groupA', 'groupB']);
  });

  it('inserts gap at append position', () => {
    const result = computeTreeDisplayKeys(tree, new Set(['x']), { parent: 'groupB', before: null });
    expect(result['groupA']).toEqual(['y']);
    expect(result['groupB']).toEqual(['z', GAP_KEY]);
  });

  it('moves group between root-level positions', () => {
    const result = computeTreeDisplayKeys(tree, new Set(['groupA']), { parent: 'root', before: null });
    // groupA removed from root, gap appended
    expect(result['root']).toEqual(['groupB', GAP_KEY]);
    // groupA's children unchanged (they aren't dragged)
    expect(result['groupA']).toEqual(['x', 'y']);
  });
});
