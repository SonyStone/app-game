import { calculateDeltas, measureElements, snapshotsEqual, type Rect } from 'src/primitives/flipUtils';
import { describe, expect, it, vi } from 'vitest';

// ============================================================================
// MARK: Helpers
// ============================================================================

/**
 * Creates a mock HTMLElement with a stubbed `getBoundingClientRect`.
 * Returns both the element and a function to update its rect.
 */
function mockElement(rect: { x: number; y: number; width: number; height: number }) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        x: rect.x,
        y: rect.y,
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        toJSON: () => ({})
      }) as DOMRect
  );
  return el;
}

// ============================================================================
// MARK: measureElements
// ============================================================================

describe('measureElements', () => {
  it('captures bounding rect for each element', () => {
    const elements = new Map<string, HTMLElement>([
      ['a', mockElement({ x: 0, y: 0, width: 100, height: 40 })],
      ['b', mockElement({ x: 0, y: 50, width: 100, height: 40 })],
      ['c', mockElement({ x: 0, y: 100, width: 100, height: 40 })]
    ]);

    const snapshots = measureElements(elements);

    expect(snapshots.size).toBe(3);
    expect(snapshots.get('a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(snapshots.get('b')).toEqual({ x: 0, y: 50, width: 100, height: 40 });
    expect(snapshots.get('c')).toEqual({ x: 0, y: 100, width: 100, height: 40 });
  });

  it('returns empty map for empty input', () => {
    const snapshots = measureElements(new Map());
    expect(snapshots.size).toBe(0);
  });

  it('calls getBoundingClientRect on each element', () => {
    const elA = mockElement({ x: 10, y: 20, width: 50, height: 30 });
    const elements = new Map<string, HTMLElement>([['a', elA]]);

    measureElements(elements);

    expect(elA.getBoundingClientRect).toHaveBeenCalledOnce();
  });

  it('skips detached elements (isConnected = false)', () => {
    const elA = mockElement({ x: 0, y: 0, width: 100, height: 40 });
    const elB = mockElement({ x: 0, y: 50, width: 100, height: 40 });

    // Detach element B from the DOM
    elB.remove();

    const elements = new Map<string, HTMLElement>([
      ['a', elA],
      ['b', elB]
    ]);

    const snapshots = measureElements(elements);

    expect(snapshots.size).toBe(1);
    expect(snapshots.has('a')).toBe(true);
    expect(snapshots.has('b')).toBe(false);
    expect(elB.getBoundingClientRect).not.toHaveBeenCalled();
  });
});

// ============================================================================
// MARK: calculateDeltas
// ============================================================================

describe('calculateDeltas', () => {
  it('element moved down → negative dy', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 0, y: 100, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: 0, dy: -100, scaleX: 1, scaleY: 1 });
  });

  it('element moved up → positive dy', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 100, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: 0, dy: 100, scaleX: 1, scaleY: 1 });
  });

  it('element moved right → negative dx', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 50, y: 0, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: -50, dy: 0, scaleX: 1, scaleY: 1 });
  });

  it('element moved diagonally → both dx and dy', () => {
    const first = new Map<string, Rect>([['a', { x: 10, y: 20, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 60, y: 120, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: -50, dy: -100, scaleX: 1, scaleY: 1 });
  });

  it('element did not move → excluded from result', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 50, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 0, y: 50, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.size).toBe(0);
  });

  it('new element (only in last) → excluded', () => {
    const first = new Map<string, Rect>();
    const last = new Map<string, Rect>([['new', { x: 0, y: 0, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.size).toBe(0);
    expect(deltas.has('new')).toBe(false);
  });

  it('removed element (only in first) → excluded', () => {
    const first = new Map<string, Rect>([['gone', { x: 0, y: 0, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>();

    const deltas = calculateDeltas(first, last);

    expect(deltas.size).toBe(0);
  });

  it('multiple elements — only moved ones included', () => {
    const first = new Map<string, Rect>([
      ['a', { x: 0, y: 0, width: 100, height: 40 }],
      ['b', { x: 0, y: 50, width: 100, height: 40 }],
      ['c', { x: 0, y: 100, width: 100, height: 40 }]
    ]);
    // Swap a and c — b stays in place
    const last = new Map<string, Rect>([
      ['c', { x: 0, y: 0, width: 100, height: 40 }],
      ['b', { x: 0, y: 50, width: 100, height: 40 }],
      ['a', { x: 0, y: 100, width: 100, height: 40 }]
    ]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.size).toBe(2);
    expect(deltas.has('b')).toBe(false); // didn't move
    expect(deltas.get('a')).toEqual({ dx: 0, dy: -100, scaleX: 1, scaleY: 1 }); // 0 → 100
    expect(deltas.get('c')).toEqual({ dx: 0, dy: 100, scaleX: 1, scaleY: 1 }); // 100 → 0
  });

  it('both snapshots empty → empty result', () => {
    const deltas = calculateDeltas(new Map(), new Map());
    expect(deltas.size).toBe(0);
  });

  it('typical 3-item reorder: move first to last', () => {
    // A, B, C → B, C, A (each item 40px tall with 10px gap)
    const first = new Map<string, Rect>([
      ['a', { x: 0, y: 0, width: 200, height: 40 }],
      ['b', { x: 0, y: 50, width: 200, height: 40 }],
      ['c', { x: 0, y: 100, width: 200, height: 40 }]
    ]);
    const last = new Map<string, Rect>([
      ['b', { x: 0, y: 0, width: 200, height: 40 }],
      ['c', { x: 0, y: 50, width: 200, height: 40 }],
      ['a', { x: 0, y: 100, width: 200, height: 40 }]
    ]);

    const deltas = calculateDeltas(first, last);

    // A moved from y=0 to y=100 → dy = 0 - 100 = -100
    expect(deltas.get('a')).toEqual({ dx: 0, dy: -100, scaleX: 1, scaleY: 1 });
    // B moved from y=50 to y=0 → dy = 50 - 0 = 50
    expect(deltas.get('b')).toEqual({ dx: 0, dy: 50, scaleX: 1, scaleY: 1 });
    // C moved from y=100 to y=50 → dy = 100 - 50 = 50
    expect(deltas.get('c')).toEqual({ dx: 0, dy: 50, scaleX: 1, scaleY: 1 });
  });

  it('element changed width → scaleX factor computed', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 0, width: 200, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: 0, dy: 0, scaleX: 2, scaleY: 1 });
  });

  it('element changed height → scaleY factor computed', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 80 }]]);
    const last = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: 0, dy: 0, scaleX: 1, scaleY: 2 });
  });

  it('element moved and changed size → all fields computed', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 0, width: 200, height: 60 }]]);
    const last = new Map<string, Rect>([['a', { x: 50, y: 100, width: 100, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: -50, dy: -100, scaleX: 2, scaleY: 1.5 });
  });

  it('element with zero last width → scaleX defaults to 1', () => {
    const first = new Map<string, Rect>([['a', { x: 0, y: 0, width: 100, height: 40 }]]);
    const last = new Map<string, Rect>([['a', { x: 0, y: 50, width: 0, height: 40 }]]);

    const deltas = calculateDeltas(first, last);

    expect(deltas.get('a')).toEqual({ dx: 0, dy: -50, scaleX: 1, scaleY: 1 });
  });
});

// ============================================================================
// MARK: snapshotsEqual
// ============================================================================

describe('snapshotsEqual', () => {
  it('returns true for two empty maps', () => {
    expect(snapshotsEqual(new Map(), new Map())).toBe(true);
  });

  it('returns true for identical snapshots', () => {
    const a = new Map<string, Rect>([
      ['x', { x: 0, y: 10, width: 100, height: 40 }],
      ['y', { x: 0, y: 60, width: 100, height: 40 }]
    ]);
    const b = new Map<string, Rect>([
      ['x', { x: 0, y: 10, width: 100, height: 40 }],
      ['y', { x: 0, y: 60, width: 100, height: 40 }]
    ]);
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns false when sizes differ', () => {
    const a = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 40 }]]);
    const b = new Map<string, Rect>([
      ['x', { x: 0, y: 0, width: 100, height: 40 }],
      ['y', { x: 0, y: 50, width: 100, height: 40 }]
    ]);
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when a key is missing from b', () => {
    const a = new Map<string, Rect>([
      ['x', { x: 0, y: 0, width: 100, height: 40 }],
      ['y', { x: 0, y: 50, width: 100, height: 40 }]
    ]);
    const b = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 40 }]]);
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when x differs', () => {
    const a = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 40 }]]);
    const b = new Map<string, Rect>([['x', { x: 5, y: 0, width: 100, height: 40 }]]);
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when y differs', () => {
    const a = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 40 }]]);
    const b = new Map<string, Rect>([['x', { x: 0, y: 1, width: 100, height: 40 }]]);
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when width differs', () => {
    const a = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 40 }]]);
    const b = new Map<string, Rect>([['x', { x: 0, y: 0, width: 200, height: 40 }]]);
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when height differs', () => {
    const a = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 40 }]]);
    const b = new Map<string, Rect>([['x', { x: 0, y: 0, width: 100, height: 50 }]]);
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});
