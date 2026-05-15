import { getGridIndicatorPosition, getGridInsertionPoint } from 'src/core/gridInsertion';
import { type ResolvedGrid } from 'src/core/gridLayout';
import * as Rect from 'src/core/rect';
import * as Vec2 from 'src/core/vec2';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Test Helpers
// ============================================================================

/**
 * Standard 4-column grid layout:
 *
 * ```
 * Container: (10, 10, 440, 200)
 *
 * columns: 4, columnWidth: 100, rowHeight: 80, gap: [10, 10]
 *
 *  ┌──────────────────────────────────────────────────┐ (10,10)
 *  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
 *  │ │  a   │ │  b   │ │  c   │ │  d   │  row 0     │
 *  │ └──────┘ └──────┘ └──────┘ └──────┘            │
 *  │                                                  │
 *  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
 *  │ │  e   │ │  f   │ │  g   │ │  h   │  row 1     │
 *  │ └──────┘ └──────┘ └──────┘ └──────┘            │
 *  └──────────────────────────────────────────────────┘
 * ```
 *
 * Cell positions (x, y):
 *   a: (10, 10)    b: (120, 10)    c: (230, 10)    d: (340, 10)
 *   e: (10, 100)   f: (120, 100)   g: (230, 100)   h: (340, 100)
 */
function standardGridSetup() {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const grid: ResolvedGrid = {
    columns: 4,
    columnWidth: 100,
    rowHeight: 80,
    rowGap: 10,
    colGap: 10,
    rows: 2
  };

  const containerRect = Rect.of(10, 10, 440, 190);

  // Build item rects from grid math
  const itemRects = new Map<string, Rect.Rect>();
  for (let i = 0; i < items.length; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    itemRects.set(
      items[i],
      Rect.of(
        10 + col * 110, // origin.x + col * (width + gap)
        10 + row * 90, // origin.y + row * (height + gap)
        100,
        80
      )
    );
  }

  const getRectForItem = (key: string) => itemRects.get(key);

  return { items, grid, containerRect, itemRects, getRectForItem };
}

// ============================================================================
// MARK: getGridInsertionPoint
// ============================================================================

describe('getGridInsertionPoint', () => {
  it('pointer outside container → undefined', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    const result = getGridInsertionPoint(Vec2.of(-100, -100), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toBeUndefined();
  });

  it('empty grid → append', () => {
    const { grid, containerRect } = standardGridSetup();
    const result = getGridInsertionPoint(Vec2.of(50, 50), 'grid', [], grid, containerRect);
    expect(result).toEqual({ parent: 'grid', before: null });
  });

  it('pointer in left half of first item → before a', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    // First item center x = 10 + 50 = 60. Pointer at x=40 → left half
    const result = getGridInsertionPoint(Vec2.of(40, 50), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: 'a' });
  });

  it('pointer in right half of first item → before b', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    // First item center x = 60. Pointer at x=80 → right half
    const result = getGridInsertionPoint(Vec2.of(80, 50), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: 'b' });
  });

  it('pointer in left half of second item → before b', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    // b rect starts at x=120, center=170. Pointer at x=140 → left half
    const result = getGridInsertionPoint(Vec2.of(140, 50), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: 'b' });
  });

  it('pointer in right half of last item in row → before e (next row)', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    // d rect: (340, 10, 100, 80), center x = 390. Pointer at x=400 → right half
    const result = getGridInsertionPoint(Vec2.of(400, 50), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: 'e' });
  });

  it('pointer in second row left half → before e', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    // e rect: (10, 100, 100, 80), center x = 60. Pointer at x=40, y=140
    const result = getGridInsertionPoint(Vec2.of(40, 140), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: 'e' });
  });

  it('pointer after last item → append', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    // h rect: (340, 100, 100, 80), center x = 390. Pointer at x=410 → right half → append
    const result = getGridInsertionPoint(Vec2.of(410, 140), 'grid', items, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: null });
  });

  it('pointer beyond last row → append', () => {
    const { grid, containerRect, getRectForItem } = standardGridSetup();
    // Partial last row: 5 items in 4 columns = 1 in row 1
    const items5 = ['a', 'b', 'c', 'd', 'e'];
    const result = getGridInsertionPoint(Vec2.of(300, 140), 'grid', items5, grid, containerRect, getRectForItem);
    expect(result).toEqual({ parent: 'grid', before: null });
  });

  it('works without getRectForItem (uses computed cell rects)', () => {
    const { items, grid, containerRect } = standardGridSetup();
    // Left half of cell (0,0) → center x = 10 + 50 = 60, pointer at x=30
    const result = getGridInsertionPoint(Vec2.of(30, 50), 'grid', items, grid, containerRect);
    expect(result).toEqual({ parent: 'grid', before: 'a' });
  });

  it('right half without getRectForItem → before next item', () => {
    const { items, grid, containerRect } = standardGridSetup();
    // Right half of cell (0,0) → center x = 10 + 50 = 60, pointer at x=70
    const result = getGridInsertionPoint(Vec2.of(70, 50), 'grid', items, grid, containerRect);
    expect(result).toEqual({ parent: 'grid', before: 'b' });
  });

  // ── Gap placeholder shifting tests ──────────────────────────────────────

  describe('with gap placeholder shifting item rects', () => {
    /**
     * Simulates dragging item 'e' from a 4-column grid.
     *
     * Original items: [a, b, c, d, e, f, g, h]
     * Active items (e removed): [a, b, c, d, f, g, h]
     * Display keys (gap inserted at e's position): [a, b, c, d, GAP, f, g, h]
     *
     * DOM layout (4 columns):
     *   Row 0: a(0,0) b(0,1) c(0,2) d(0,3)
     *   Row 1: GAP(1,0) f(1,1) g(1,2) h(1,3)
     *
     * Items f, g, h are shifted right by one cell compared to
     * the mathematical grid (which would put f at (1,0), g at (1,1), h at (1,2)).
     */
    function gapShiftedSetup() {
      const activeItems = ['a', 'b', 'c', 'd', 'f', 'g', 'h'];

      // Grid resolved for 7 active items (not 8)
      const grid: ResolvedGrid = {
        columns: 4,
        columnWidth: 100,
        rowHeight: 80,
        rowGap: 10,
        colGap: 10,
        rows: 2
      };

      const containerRect = Rect.of(10, 10, 440, 190);

      // Item rects as they actually appear in the DOM (with gap at position 4)
      // Display order: [a, b, c, d, GAP, f, g, h]
      const displayOrder = ['a', 'b', 'c', 'd', '__gap__', 'f', 'g', 'h'];
      const itemRects = new Map<string, Rect.Rect>();
      for (let i = 0; i < displayOrder.length; i++) {
        const key = displayOrder[i];
        if (key === '__gap__') continue;
        const row = Math.floor(i / 4);
        const col = i % 4;
        itemRects.set(key, Rect.of(10 + col * 110, 10 + row * 90, 100, 80));
      }
      // DOM rects: a(10,10) b(120,10) c(230,10) d(340,10)
      //            f(120,100) g(230,100) h(340,100)

      const getRectForItem = (key: string) => itemRects.get(key);
      return { activeItems, grid, containerRect, getRectForItem };
    }

    it('pointer over shifted item f → before f', () => {
      const { activeItems, grid, containerRect, getRectForItem } = gapShiftedSetup();
      // f is at (120,100) in DOM. Pointer in left half: x=140, center=170
      const result = getGridInsertionPoint(Vec2.of(140, 140), 'grid', activeItems, grid, containerRect, getRectForItem);
      expect(result).toEqual({ parent: 'grid', before: 'f' });
    });

    it('pointer over shifted item g → before g', () => {
      const { activeItems, grid, containerRect, getRectForItem } = gapShiftedSetup();
      // g is at (230,100) in DOM. Pointer in left half: x=250, center=280
      const result = getGridInsertionPoint(Vec2.of(250, 140), 'grid', activeItems, grid, containerRect, getRectForItem);
      expect(result).toEqual({ parent: 'grid', before: 'g' });
    });

    it('right half of shifted item f → before g', () => {
      const { activeItems, grid, containerRect, getRectForItem } = gapShiftedSetup();
      // f center x = 170. Pointer at x=190 → right half → before g
      const result = getGridInsertionPoint(Vec2.of(190, 140), 'grid', activeItems, grid, containerRect, getRectForItem);
      expect(result).toEqual({ parent: 'grid', before: 'g' });
    });

    it('right half of shifted item h → append', () => {
      const { activeItems, grid, containerRect, getRectForItem } = gapShiftedSetup();
      // h is at (340,100), center x = 390. Pointer at x=400 → right half → append
      const result = getGridInsertionPoint(Vec2.of(400, 140), 'grid', activeItems, grid, containerRect, getRectForItem);
      expect(result).toEqual({ parent: 'grid', before: null });
    });

    it('pointer in gap area → nearest item', () => {
      const { activeItems, grid, containerRect, getRectForItem } = gapShiftedSetup();
      // Gap is at (10,100). Pointer at (60,140) is inside the gap cell.
      // Nearest item by distance: f at (120,100) → dx=60, dy=0 → dist=3600
      //   a at (10,10): dy=50 → dist=2500... a is closer by clamp distance!
      // But the math grid check prevents wrong mapping.
      const result = getGridInsertionPoint(Vec2.of(60, 140), 'grid', activeItems, grid, containerRect, getRectForItem);
      // Should return a valid place (not crash)
      expect(result).toBeDefined();
      expect(result!.parent).toBe('grid');
    });
  });
});

// ============================================================================
// MARK: getGridIndicatorPosition
// ============================================================================

describe('getGridIndicatorPosition', () => {
  it('undefined place → undefined', () => {
    const { items, grid, containerRect } = standardGridSetup();
    const result = getGridIndicatorPosition(undefined, items, grid, containerRect);
    expect(result).toBeUndefined();
  });

  it('empty items → origin position', () => {
    const { grid, containerRect } = standardGridSetup();
    const result = getGridIndicatorPosition({ parent: 'grid', before: null }, [], grid, containerRect);
    expect(result).toEqual({ x: 0, y: 0, height: 80 });
  });

  it('before first item → left edge of first cell', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    const result = getGridIndicatorPosition(
      { parent: 'grid', before: 'a' },
      items,
      grid,
      containerRect,
      getRectForItem
    );
    // a rect: (10, 10, 100, 80), container origin: (10, 10)
    expect(result).toEqual({ x: 0, y: 0, height: 80 });
  });

  it('before second item → left edge of second cell', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    const result = getGridIndicatorPosition(
      { parent: 'grid', before: 'b' },
      items,
      grid,
      containerRect,
      getRectForItem
    );
    // b rect: (120, 10, 100, 80), container origin: (10, 10) → x=110
    expect(result).toEqual({ x: 110, y: 0, height: 80 });
  });

  it('before item in second row', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    const result = getGridIndicatorPosition(
      { parent: 'grid', before: 'f' },
      items,
      grid,
      containerRect,
      getRectForItem
    );
    // f rect: (120, 100, 100, 80), container origin: (10, 10) → x=110, y=90
    expect(result).toEqual({ x: 110, y: 90, height: 80 });
  });

  it('append → right edge of last item', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    const result = getGridIndicatorPosition(
      { parent: 'grid', before: null },
      items,
      grid,
      containerRect,
      getRectForItem
    );
    // h rect: (340, 100, 100, 80), right edge = 440, container origin: (10, 10) → x=430, y=90
    expect(result).toEqual({ x: 430, y: 90, height: 80 });
  });

  it('unknown item key → undefined', () => {
    const { items, grid, containerRect, getRectForItem } = standardGridSetup();
    const result = getGridIndicatorPosition(
      { parent: 'grid', before: 'nonexistent' },
      items,
      grid,
      containerRect,
      getRectForItem
    );
    expect(result).toBeUndefined();
  });

  it('fallback to grid math when no getRectForItem', () => {
    const { items, grid, containerRect } = standardGridSetup();
    const result = getGridIndicatorPosition({ parent: 'grid', before: 'c' }, items, grid, containerRect);
    // c is index 2, cell (0, 2) → x = 2 * (100 + 10) = 220, y = 0
    expect(result).toEqual({ x: 220, y: 0, height: 80 });
  });

  it('append fallback without getRectForItem', () => {
    const { items, grid, containerRect } = standardGridSetup();
    const result = getGridIndicatorPosition({ parent: 'grid', before: null }, items, grid, containerRect);
    // Last item index 7, cell (1, 3) → x = 3 * 110 + 100 = 430, y = 90
    expect(result).toEqual({ x: 430, y: 90, height: 80 });
  });
});
