import { applyGridRange, applyRange, applySet, applyToggle, getSelectionMode } from 'src/core/selectionModes';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: getSelectionMode
// ============================================================================

describe('getSelectionMode', () => {
  it('plain click → set', () => {
    expect(getSelectionMode({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe('set');
  });

  it('ctrl+click → toggle', () => {
    expect(getSelectionMode({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe('toggle');
  });

  it('meta+click (⌘) → toggle', () => {
    expect(getSelectionMode({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe('toggle');
  });

  it('shift+click → range', () => {
    expect(getSelectionMode({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe('range');
  });

  it('shift takes precedence over ctrl', () => {
    expect(getSelectionMode({ ctrlKey: true, metaKey: false, shiftKey: true })).toBe('range');
  });

  it('shift takes precedence over meta', () => {
    expect(getSelectionMode({ ctrlKey: false, metaKey: true, shiftKey: true })).toBe('range');
  });

  it('ctrl+meta → toggle', () => {
    expect(getSelectionMode({ ctrlKey: true, metaKey: true, shiftKey: false })).toBe('toggle');
  });
});

// ============================================================================
// MARK: applySet
// ============================================================================

describe('applySet', () => {
  it('returns array with single key', () => {
    expect(applySet('a')).toEqual(['a']);
  });

  it('works with numeric keys', () => {
    expect(applySet(42)).toEqual([42]);
  });
});

// ============================================================================
// MARK: applyToggle
// ============================================================================

describe('applyToggle', () => {
  it('adds key when not selected', () => {
    expect(applyToggle(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('removes key when already selected', () => {
    expect(applyToggle(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('adds to empty selection', () => {
    expect(applyToggle([], 'x')).toEqual(['x']);
  });

  it('removes last item → empty', () => {
    expect(applyToggle(['x'], 'x')).toEqual([]);
  });

  it('removes first item', () => {
    expect(applyToggle(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
  });

  it('removes last item in list', () => {
    expect(applyToggle(['a', 'b', 'c'], 'c')).toEqual(['a', 'b']);
  });

  it('preserves order of existing selection', () => {
    const result = applyToggle(['c', 'a'], 'b');
    expect(result).toEqual(['c', 'a', 'b']);
  });
});

// ============================================================================
// MARK: applyRange
// ============================================================================

describe('applyRange', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('forward range: a → c', () => {
    expect(applyRange(items, 'a', 'c')).toEqual(['a', 'b', 'c']);
  });

  it('backward range: d → b', () => {
    expect(applyRange(items, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('same key: a → a (single item)', () => {
    expect(applyRange(items, 'a', 'a')).toEqual(['a']);
  });

  it('full range: a → e', () => {
    expect(applyRange(items, 'a', 'e')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('anchor not in items → fallback to [key]', () => {
    expect(applyRange(items, 'z', 'c')).toEqual(['c']);
  });

  it('key not in items → fallback to [key]', () => {
    expect(applyRange(items, 'a', 'z')).toEqual(['z']);
  });

  it('both not in items → fallback to [key]', () => {
    expect(applyRange(items, 'x', 'z')).toEqual(['z']);
  });

  it('works with numeric keys', () => {
    expect(applyRange([1, 2, 3, 4, 5], 2, 4)).toEqual([2, 3, 4]);
  });

  it('empty items → fallback to [key]', () => {
    expect(applyRange([], 'a', 'b')).toEqual(['b']);
  });

  it('result follows items order regardless of direction', () => {
    // Even though anchor=e and key=b, result is [b,c,d,e] not [e,d,c,b]
    expect(applyRange(items, 'e', 'b')).toEqual(['b', 'c', 'd', 'e']);
  });
});

// ============================================================================
// MARK: applyGridRange
// ============================================================================

describe('applyGridRange', () => {
  // 4-column grid: a b c d / e f g h / i j k l
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

  it('single cell → selects just that item', () => {
    expect(applyGridRange(items, 'f', 'f', 4)).toEqual(['f']);
  });

  it('horizontal range in same row', () => {
    expect(applyGridRange(items, 'b', 'd', 4)).toEqual(['b', 'c', 'd']);
  });

  it('vertical range in same column', () => {
    // col 0: a(0,0), e(1,0), i(2,0)
    expect(applyGridRange(items, 'a', 'i', 4)).toEqual(['a', 'e', 'i']);
  });

  it('2x2 block', () => {
    // (0,1)=b to (1,2)=g → rows 0-1, cols 1-2
    expect(applyGridRange(items, 'b', 'g', 4)).toEqual(['b', 'c', 'f', 'g']);
  });

  it('full 3x3 block', () => {
    // (0,1)=b to (2,3)=l → rows 0-2, cols 1-3
    expect(applyGridRange(items, 'b', 'l', 4)).toEqual(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l']);
  });

  it('reversed corners produce same result', () => {
    expect(applyGridRange(items, 'l', 'b', 4)).toEqual(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l']);
  });

  it('clips to item count on partial last row', () => {
    const items10 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    // (2,0)=i to (2,3) → only i,j exist (indices 8,9)
    expect(applyGridRange(items10, 'i', 'd', 4)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  });

  it('anchor not in items → fallback to [key]', () => {
    expect(applyGridRange(items, 'z', 'c', 4)).toEqual(['c']);
  });

  it('key not in items → fallback to [key]', () => {
    expect(applyGridRange(items, 'a', 'z', 4)).toEqual(['z']);
  });
});
