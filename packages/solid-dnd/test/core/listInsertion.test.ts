import { describe, expect, it } from 'vitest';
import { getLinearInsertionPoint } from '../../src/core/linearInsertion';
import type { Rect } from '../../src/core/rect';

// ============================================================================
// MARK: Helpers
// ============================================================================

/** Creates a rect at (x, y) with given width and height. */
function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, width: w, height: h };
}

/**
 * Builds a vertical stack of rects, each 100×40, starting at y=0.
 *
 * ```
 *   y=0    ┌─── key[0] ───┐  40px tall
 *   y=40   ┌─── key[1] ───┐
 *   y=80   ┌─── key[2] ───┐
 * ```
 */
function stackedRects(keys: string[]): Map<string, Rect> {
  const map = new Map<string, Rect>();
  keys.forEach((key, i) => {
    map.set(key, rect(0, i * 40, 100, 40));
  });
  return map;
}

// ============================================================================
// MARK: Tests
// ============================================================================

describe('getLinearInsertionPoint', () => {
  // ── Empty list ──────────────────────────────────────────────────────────

  it('returns append for empty key list', () => {
    const result = getLinearInsertionPoint([], 'container', { x: 50, y: 50 }, () => undefined);
    expect(result).toEqual({ parent: 'container', before: null });
  });

  // ── Single item ─────────────────────────────────────────────────────────

  it('returns before first item when pointer is above center', () => {
    const rects = stackedRects(['a']);
    const result = getLinearInsertionPoint(
      ['a'],
      'root',
      { x: 50, y: 10 }, // center of 'a' is at y=20
      (key) => rects.get(key)
    );
    expect(result).toEqual({ parent: 'root', before: 'a' });
  });

  it('returns before item when pointer is below center but above bottom edge of single item', () => {
    const rects = stackedRects(['a']);
    const result = getLinearInsertionPoint(
      ['a'],
      'root',
      { x: 50, y: 30 }, // center of 'a' is at y=20, bottom is at y=40
      (key) => rects.get(key)
    );
    expect(result).toEqual({ parent: 'root', before: 'a' });
  });

  it('returns append when pointer is below bottom edge of single item', () => {
    const rects = stackedRects(['a']);
    const result = getLinearInsertionPoint(
      ['a'],
      'root',
      { x: 50, y: 45 }, // bottom of 'a' is at y=40
      (key) => rects.get(key)
    );
    expect(result).toEqual({ parent: 'root', before: null });
  });

  // ── Multiple items ──────────────────────────────────────────────────────

  it('returns before first item when pointer is above its center', () => {
    // a: y=0..40  center=20
    // b: y=40..80 center=60
    // c: y=80..120 center=100
    const rects = stackedRects(['a', 'b', 'c']);
    const result = getLinearInsertionPoint(['a', 'b', 'c'], 'list', { x: 50, y: 5 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'a' });
  });

  it('returns before second item when pointer is past boundary between first and second', () => {
    const rects = stackedRects(['a', 'b', 'c']);
    // boundary between a and b = (a.bottom + b.top) / 2 = (40 + 40) / 2 = 40
    // y=50 is past the boundary (50 > 40) → before 'b'
    const result = getLinearInsertionPoint(['a', 'b', 'c'], 'list', { x: 50, y: 50 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'b' });
  });

  it('returns before third item when pointer is past boundary between second and third', () => {
    const rects = stackedRects(['a', 'b', 'c']);
    // boundary between b and c = (b.bottom + c.top) / 2 = (80 + 80) / 2 = 80
    // y=90 is past the boundary (90 > 80) → before 'c'
    const result = getLinearInsertionPoint(['a', 'b', 'c'], 'list', { x: 50, y: 90 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'c' });
  });

  it('returns before last item when pointer is below its center but above its bottom', () => {
    const rects = stackedRects(['a', 'b', 'c']);
    // c is at y=80..120, center=100, bottom=120. y=110 is above bottom.
    const result = getLinearInsertionPoint(['a', 'b', 'c'], 'list', { x: 50, y: 110 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'c' });
  });

  it('returns append when pointer is below bottom edge of last item', () => {
    const rects = stackedRects(['a', 'b', 'c']);
    // c bottom is at y=120
    const result = getLinearInsertionPoint(['a', 'b', 'c'], 'list', { x: 50, y: 125 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: null });
  });

  // ── Exact center ────────────────────────────────────────────────────────

  it('returns before item when pointer is exactly at center of single item', () => {
    const rects = stackedRects(['a']);
    // center of 'a' is exactly y=20. Bottom of 'a' is y=40. 20 < 40 → before 'a'.
    const result = getLinearInsertionPoint(['a'], 'root', { x: 50, y: 20 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'root', before: 'a' });
  });

  it('returns append when pointer is exactly at bottom edge of single item', () => {
    const rects = stackedRects(['a']);
    // bottom of 'a' is exactly y=40. position.y < boundary is false.
    const result = getLinearInsertionPoint(['a'], 'root', { x: 50, y: 40 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'root', before: null });
  });

  // ── Missing rects ──────────────────────────────────────────────────────

  it('skips items with missing rects', () => {
    // Only 'b' has a rect at y=40..80, center=60
    const rects = new Map<string, Rect>();
    rects.set('b', rect(0, 40, 100, 40));

    const result = getLinearInsertionPoint(
      ['a', 'b', 'c'],
      'list',
      { x: 50, y: 50 }, // above center of 'b' (60)
      (key) => rects.get(key)
    );
    expect(result).toEqual({ parent: 'list', before: 'b' });
  });

  it('returns append when all rects are missing', () => {
    const result = getLinearInsertionPoint(['a', 'b', 'c'], 'list', { x: 50, y: 50 }, () => undefined);
    expect(result).toEqual({ parent: 'list', before: null });
  });

  // ── Different container keys ───────────────────────────────────────────

  it('uses the provided parentKey in the result', () => {
    const rects = stackedRects(['item1']);
    const result = getLinearInsertionPoint(['item1'], 'my-group', { x: 50, y: 5 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'my-group', before: 'item1' });
  });

  // ── Variable-height items ──────────────────────────────────────────────

  it('handles variable-height items correctly', () => {
    const rects = new Map<string, Rect>();
    rects.set('tall', rect(0, 0, 100, 100)); // bottom = 100
    rects.set('short', rect(0, 100, 100, 20)); // top = 100, bottom = 120
    // boundary between 'tall' and 'short' = (100 + 100) / 2 = 100
    // y=60 < 100 → before 'tall'
    const result = getLinearInsertionPoint(['tall', 'short'], 'list', { x: 50, y: 60 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'tall' });
  });

  it('returns before second item when pointer is past midpoint of variable-height items', () => {
    const rects = new Map<string, Rect>();
    rects.set('tall', rect(0, 0, 100, 100)); // bottom = 100
    rects.set('short', rect(0, 100, 100, 20)); // top = 100, center = 110
    // boundary between 'tall' and 'short' = (100 + 100) / 2 = 100
    // y=105 > 100 but < 120 (short.bottom) → before 'short'
    const result = getLinearInsertionPoint(['tall', 'short'], 'list', { x: 50, y: 105 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'short' });
  });

  // ── X position doesn't matter ──────────────────────────────────────────

  it('ignores x position (only uses y for vertical lists)', () => {
    const rects = stackedRects(['a', 'b']);
    // x is way outside, but y=10 is above center of 'a'
    const result = getLinearInsertionPoint(['a', 'b'], 'list', { x: 999, y: 10 }, (key) => rects.get(key));
    expect(result).toEqual({ parent: 'list', before: 'a' });
  });
});
