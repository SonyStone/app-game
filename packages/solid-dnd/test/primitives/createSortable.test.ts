import { createRoot } from 'solid-js';
import * as Rect from 'src/core/rect';
import * as Vec2 from 'src/core/vec2';
import { createSortable, type Sortable, type SortableOptions } from 'src/primitives/createSortable';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Test Helpers
// ============================================================================

/**
 * Creates a sortable inside a reactive root and runs the test callback.
 * Disposes automatically when the callback finishes.
 */
function withSortable<K>(options: SortableOptions<K>, fn: (sortable: Sortable<K>) => void): void {
  createRoot((dispose) => {
    const sortable = createSortable(options);
    fn(sortable);
    dispose();
  });
}

/**
 * Standard test layout: 3 items (40px tall, 10px gaps) in a 200×150 container.
 *
 * ```
 * Container: (10, 10, 200, 150)
 *
 *   y=10  ┌─────────────────────┐ container top
 *   y=10  │ ┌─────────────────┐ │  Item A (10, 10, 200, 40) center=30
 *   y=50  │ └─────────────────┘ │
 *         │                     │  10px gap
 *   y=60  │ ┌─────────────────┐ │  Item B (10, 60, 200, 40) center=80
 *  y=100  │ └─────────────────┘ │
 *         │                     │  10px gap
 *  y=110  │ ┌─────────────────┐ │  Item C (10, 110, 200, 40) center=130
 *  y=150  │ └─────────────────┘ │
 *  y=160  └─────────────────────┘ container bottom
 * ```
 */
function standardSetup() {
  const rects = new Map<string, Rect.Rect>([
    ['a', Rect.of(10, 10, 200, 40)],
    ['b', Rect.of(10, 60, 200, 40)],
    ['c', Rect.of(10, 110, 200, 40)]
  ]);
  const containerRect = Rect.of(10, 10, 200, 150);

  const options: SortableOptions<string> = {
    containerKey: 'container',
    items: () => ['a', 'b', 'c'],
    getRect: (key) => rects.get(key),
    getContainerRect: () => containerRect,
    spacing: 10
  };

  return { options, rects, containerRect };
}

// ============================================================================
// MARK: Tests — Insertion Point Calculation (Vertical List)
// ============================================================================

describe('createSortable', () => {
  describe('vertical list — 3 items', () => {
    it('pointer above first item → before A', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // y=15 is above center of A (30)
        const place = s.getInsertionPoint(Vec2.of(100, 15));
        expect(place).toEqual({ parent: 'container', before: 'a' });
      });
    });

    it('pointer at top of A (above center) → before A', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 20));
        expect(place).toEqual({ parent: 'container', before: 'a' });
      });
    });

    it('pointer past boundary between A and B → before B', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Boundary between A and B = (50 + 60) / 2 = 55. y=56 is past it.
        const place = s.getInsertionPoint(Vec2.of(100, 56));
        expect(place).toEqual({ parent: 'container', before: 'b' });
      });
    });

    it('pointer in the gap between A and B → before B', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Gap is y=50..60, which is below center of A (30)
        const place = s.getInsertionPoint(Vec2.of(100, 55));
        expect(place).toEqual({ parent: 'container', before: 'b' });
      });
    });

    it('pointer in top half of B → before B', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // B is at y=60..100, center=80. y=70 is above center.
        const place = s.getInsertionPoint(Vec2.of(100, 70));
        expect(place).toEqual({ parent: 'container', before: 'b' });
      });
    });

    it('pointer past boundary between B and C → before C', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Boundary between B and C = (100 + 110) / 2 = 105. y=106 is past it.
        const place = s.getInsertionPoint(Vec2.of(100, 106));
        expect(place).toEqual({ parent: 'container', before: 'c' });
      });
    });

    it('pointer in top half of C → before C', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // C is at y=110..150, center=130. y=120 is above center.
        const place = s.getInsertionPoint(Vec2.of(100, 120));
        expect(place).toEqual({ parent: 'container', before: 'c' });
      });
    });

    it('pointer below bottom of C → append (before: null)', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // C bottom = 150. y=155 is below it.
        const place = s.getInsertionPoint(Vec2.of(100, 155));
        expect(place).toEqual({ parent: 'container', before: null });
      });
    });

    it('pointer at very bottom of container → append', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 159));
        expect(place).toEqual({ parent: 'container', before: null });
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('boundary behavior — pointer at midpoint between items', () => {
    it('pointer exactly at A-B boundary (y=55) → before B (not before A)', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Boundary = (A.bottom + B.top) / 2 = (50 + 60) / 2 = 55
        // position.y < boundary is false when equal → continues to next item
        const place = s.getInsertionPoint(Vec2.of(100, 55));
        expect(place).toEqual({ parent: 'container', before: 'b' });
      });
    });

    it('pointer exactly at B-C boundary (y=105) → before C', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 105));
        expect(place).toEqual({ parent: 'container', before: 'c' });
      });
    });

    it('pointer exactly at C bottom edge (y=150) → append', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 150));
        expect(place).toEqual({ parent: 'container', before: null });
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('container bounds checking', () => {
    it('pointer left of container → undefined', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Container starts at x=10
        const place = s.getInsertionPoint(Vec2.of(5, 50));
        expect(place).toBeUndefined();
      });
    });

    it('pointer right of container → undefined', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Container: x=10, width=200 → right edge = 210
        const place = s.getInsertionPoint(Vec2.of(215, 50));
        expect(place).toBeUndefined();
      });
    });

    it('pointer above container → undefined', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Container starts at y=10
        const place = s.getInsertionPoint(Vec2.of(100, 5));
        expect(place).toBeUndefined();
      });
    });

    it('pointer below container → undefined', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Container: y=10, height=150 → bottom = 160
        const place = s.getInsertionPoint(Vec2.of(100, 165));
        expect(place).toBeUndefined();
      });
    });

    it('pointer exactly at container edge → within bounds', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // Exact left edge: x=10, exact top: y=10
        const place = s.getInsertionPoint(Vec2.of(10, 10));
        expect(place).toBeDefined();
        expect(place!.parent).toBe('container');
      });
    });

    it('pointer at container right/bottom edge → within bounds', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        // x=210, y=160 (right at the edge)
        const place = s.getInsertionPoint(Vec2.of(210, 160));
        expect(place).toBeDefined();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('empty list', () => {
    it('returns append for any position inside container', () => {
      const containerRect = Rect.of(0, 0, 200, 100);
      withSortable(
        {
          containerKey: 'empty',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => containerRect
        },
        (s) => {
          const place = s.getInsertionPoint(Vec2.of(100, 50));
          expect(place).toEqual({ parent: 'empty', before: null });
        }
      );
    });

    it('returns undefined outside container', () => {
      const containerRect = Rect.of(0, 0, 200, 100);
      withSortable(
        {
          containerKey: 'empty',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => containerRect
        },
        (s) => {
          const place = s.getInsertionPoint(Vec2.of(300, 50));
          expect(place).toBeUndefined();
        }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('single item', () => {
    const singleSetup = () => {
      const rects = new Map<string, Rect.Rect>([['only', Rect.of(0, 0, 200, 60)]]);
      const containerRect = Rect.of(0, 0, 200, 80);
      const options: SortableOptions<string> = {
        containerKey: 'single',
        items: () => ['only'],
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      };
      return { options };
    };

    it('pointer above center → before the item', () => {
      const { options } = singleSetup();
      withSortable(options, (s) => {
        // Item center = 30. y=10 < 30.
        const place = s.getInsertionPoint(Vec2.of(100, 10));
        expect(place).toEqual({ parent: 'single', before: 'only' });
      });
    });

    it('pointer below bottom edge → append', () => {
      const { options } = singleSetup();
      withSortable(options, (s) => {
        // Item bottom = 60. y=65 > 60.
        const place = s.getInsertionPoint(Vec2.of(100, 65));
        expect(place).toEqual({ parent: 'single', before: null });
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('missing rects', () => {
    it('no container rect → undefined', () => {
      withSortable(
        {
          containerKey: 'ghost',
          items: () => ['a', 'b'],
          getRect: () => Rect.of(0, 0, 100, 40),
          getContainerRect: () => undefined
        },
        (s) => {
          const place = s.getInsertionPoint(Vec2.of(50, 20));
          expect(place).toBeUndefined();
        }
      );
    });

    it('item rect missing → skips that item gracefully', () => {
      const rects = new Map<string, Rect.Rect>([
        // 'a' is missing
        ['b', Rect.of(0, 60, 200, 40)],
        ['c', Rect.of(0, 110, 200, 40)]
      ]);
      const containerRect = Rect.of(0, 0, 200, 160);

      withSortable(
        {
          containerKey: 'partial',
          items: () => ['a', 'b', 'c'],
          getRect: (key) => rects.get(key),
          getContainerRect: () => containerRect
        },
        (s) => {
          // y=20: 'a' has no rect → skipped. B center=80, 20 < 80 → before B.
          const place = s.getInsertionPoint(Vec2.of(100, 20));
          expect(place).toEqual({ parent: 'partial', before: 'b' });
        }
      );
    });

    it('all item rects missing → append', () => {
      const containerRect = Rect.of(0, 0, 200, 160);

      withSortable(
        {
          containerKey: 'none',
          items: () => ['a', 'b', 'c'],
          getRect: () => undefined,
          getContainerRect: () => containerRect
        },
        (s) => {
          const place = s.getInsertionPoint(Vec2.of(100, 50));
          expect(place).toEqual({ parent: 'none', before: null });
        }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('insertionPoints accessor', () => {
    it('returns N+1 places for N items', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const points = s.insertionPoints();
        expect(points).toHaveLength(4); // 3 items + append
      });
    });

    it('each place has correct parent key', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const points = s.insertionPoints();
        for (const p of points) {
          expect(p.parent).toBe('container');
        }
      });
    });

    it('places are: before each item + append', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const points = s.insertionPoints();
        expect(points).toEqual([
          { parent: 'container', before: 'a' },
          { parent: 'container', before: 'b' },
          { parent: 'container', before: 'c' },
          { parent: 'container', before: null }
        ]);
      });
    });

    it('empty list → single append point', () => {
      const containerRect = Rect.of(0, 0, 200, 100);
      withSortable(
        {
          containerKey: 'empty',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => containerRect
        },
        (s) => {
          expect(s.insertionPoints()).toEqual([{ parent: 'empty', before: null }]);
        }
      );
    });

    it('single item → 2 points', () => {
      const containerRect = Rect.of(0, 0, 200, 80);
      withSortable(
        {
          containerKey: 'single',
          items: () => ['x'],
          getRect: () => Rect.of(0, 0, 200, 60),
          getContainerRect: () => containerRect
        },
        (s) => {
          expect(s.insertionPoints()).toEqual([
            { parent: 'single', before: 'x' },
            { parent: 'single', before: null }
          ]);
        }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('variable-height items', () => {
    it('correctly uses each item center regardless of height', () => {
      const rects = new Map<string, Rect.Rect>([
        ['small', Rect.of(0, 0, 200, 20)], // center = 10
        ['tall', Rect.of(0, 30, 200, 100)], // center = 80
        ['medium', Rect.of(0, 140, 200, 40)] // center = 160
      ]);
      const containerRect = Rect.of(0, 0, 200, 200);

      withSortable(
        {
          containerKey: 'var',
          items: () => ['small', 'tall', 'medium'],
          getRect: (key) => rects.get(key),
          getContainerRect: () => containerRect
        },
        (s) => {
          // y=5 < center of small (10) → before small
          expect(s.getInsertionPoint(Vec2.of(100, 5))).toEqual({
            parent: 'var',
            before: 'small'
          });

          // y=50: above center of tall (80) → before tall
          expect(s.getInsertionPoint(Vec2.of(100, 50))).toEqual({
            parent: 'var',
            before: 'tall'
          });

          // y=136: past boundary between tall and medium ((130+140)/2=135) → before medium
          expect(s.getInsertionPoint(Vec2.of(100, 136))).toEqual({
            parent: 'var',
            before: 'medium'
          });

          // y=180: below all centers → append
          expect(s.getInsertionPoint(Vec2.of(100, 180))).toEqual({
            parent: 'var',
            before: null
          });
        }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('non-string keys (number)', () => {
    it('works with numeric keys', () => {
      const rects = new Map<number, Rect.Rect>([
        [1, Rect.of(0, 0, 200, 40)],
        [2, Rect.of(0, 50, 200, 40)]
      ]);
      const containerRect = Rect.of(0, 0, 200, 100);

      withSortable(
        {
          containerKey: 0,
          items: () => [1, 2],
          getRect: (key) => rects.get(key),
          getContainerRect: () => containerRect
        },
        (s) => {
          const place = s.getInsertionPoint(Vec2.of(100, 10));
          expect(place).toEqual({ parent: 0, before: 1 });
        }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('getIndicatorOffset', () => {
    it('returns top of target item for "before" place', () => {
      const { options } = standardSetup();
      // Item B is at y=60, container at y=10 → offset = 50
      withSortable(options, (s) => {
        const offset = s.getIndicatorOffset({ parent: 'container', before: 'b' });
        expect(offset).toBe(50);
      });
    });

    it('returns top of first item for "before A"', () => {
      const { options } = standardSetup();
      // Item A is at y=10, container at y=10 → offset = 0
      withSortable(options, (s) => {
        const offset = s.getIndicatorOffset({ parent: 'container', before: 'a' });
        expect(offset).toBe(0);
      });
    });

    it('returns bottom of last item for "append"', () => {
      const { options } = standardSetup();
      // Item C: y=110 + height=40 = 150, container at y=10 → offset = 140
      withSortable(options, (s) => {
        const offset = s.getIndicatorOffset({ parent: 'container', before: null });
        expect(offset).toBe(140);
      });
    });

    it('returns undefined for undefined place', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        expect(s.getIndicatorOffset(undefined)).toBeUndefined();
      });
    });

    it('returns undefined when container rect is unavailable', () => {
      const { options } = standardSetup();
      const opts = { ...options, getContainerRect: () => undefined };
      withSortable(opts, (s) => {
        const offset = s.getIndicatorOffset({ parent: 'container', before: 'a' });
        expect(offset).toBeUndefined();
      });
    });

    it('returns undefined when target item rect is unavailable', () => {
      const { options } = standardSetup();
      withSortable(options, (s) => {
        const offset = s.getIndicatorOffset({ parent: 'container', before: 'nonexistent' as string });
        expect(offset).toBeUndefined();
      });
    });

    it('returns 0 for append on empty list', () => {
      const containerRect = Rect.of(10, 10, 200, 150);
      withSortable(
        {
          containerKey: 'container',
          items: () => [] as string[],
          getRect: () => undefined,
          getContainerRect: () => containerRect
        },
        (s) => {
          const offset = s.getIndicatorOffset({ parent: 'container', before: null });
          expect(offset).toBe(0);
        }
      );
    });
  });

  // ==========================================================================
  // MARK: draggedKeys — skip dragged items in insertion calculations
  // ==========================================================================

  describe('draggedKeys — skips dragged items', () => {
    it('excludes dragged item from insertion point', () => {
      const { options } = standardSetup();
      // Items: A (center=30), B (center=80), C (center=130).
      // Drag C. Pointer at y=100 is between B center (80) and C center (130).
      // Without filtering → before C. With filtering (C excluded) → append.
      const opts = { ...options, draggedKeys: () => ['c'] };
      withSortable(opts, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 100));
        expect(place).toEqual({ parent: 'container', before: null });
      });
    });

    it('prevents "before self" when dragging last item', () => {
      const { options } = standardSetup();
      // Drag C (last item). Pointer at y=125 is just below B center (80),
      // above where C center (130) was. With C excluded → append.
      const opts = { ...options, draggedKeys: () => ['c'] };
      withSortable(opts, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 125));
        expect(place).toEqual({ parent: 'container', before: null });
      });
    });

    it('dragging first item still allows insertion before second', () => {
      const { options } = standardSetup();
      // Drag A. Items become [B, C]. Pointer at y=60 is below A center (30)
      // but above B center (80) → before B.
      const opts = { ...options, draggedKeys: () => ['a'] };
      withSortable(opts, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 60));
        expect(place).toEqual({ parent: 'container', before: 'b' });
      });
    });

    it('indicator offset uses last non-dragged item for append', () => {
      const { options } = standardSetup();
      // Drag C (last). Append indicator should use B bottom (60+40=100).
      // Container top = 10, so offset = 100 - 10 = 90.
      const opts = { ...options, draggedKeys: () => ['c'] };
      withSortable(opts, (s) => {
        const offset = s.getIndicatorOffset({ parent: 'container', before: null });
        expect(offset).toBe(90);
      });
    });

    it('empty list after filtering all items → offset 0', () => {
      const containerRect = Rect.of(10, 10, 200, 50);
      const rects = new Map([['only', Rect.of(10, 10, 200, 40)]]);
      withSortable(
        {
          containerKey: 'container',
          items: () => ['only'],
          getRect: (key) => rects.get(key),
          getContainerRect: () => containerRect,
          draggedKeys: () => ['only']
        },
        (s) => {
          const offset = s.getIndicatorOffset({ parent: 'container', before: null });
          expect(offset).toBe(0);
        }
      );
    });

    it('multiple dragged keys are all excluded', () => {
      const { options } = standardSetup();
      // Drag A and B. Only C remains (center=130).
      const opts = { ...options, draggedKeys: () => ['a', 'b'] };
      withSortable(opts, (s) => {
        // Pointer above C center → before C
        const place = s.getInsertionPoint(Vec2.of(100, 120));
        expect(place).toEqual({ parent: 'container', before: 'c' });
        // Pointer below C bottom edge → append
        const place2 = s.getInsertionPoint(Vec2.of(100, 155));
        expect(place2).toEqual({ parent: 'container', before: null });
      });
    });

    it('no draggedKeys → normal behavior', () => {
      const { options } = standardSetup();
      // No draggedKeys option at all — same as before
      // Boundary B-C = (100 + 110) / 2 = 105. y=106 > 105 → before C
      withSortable(options, (s) => {
        const place = s.getInsertionPoint(Vec2.of(100, 106));
        expect(place).toEqual({ parent: 'container', before: 'c' });
      });
    });
  });
});
