import { createRoot } from 'solid-js';
import * as Rect from 'src/core/rect';
import * as Vec2 from 'src/core/vec2';
import {
  createNestable,
  type Nestable,
  type NestableContainer,
  type NestableOptions
} from 'src/primitives/createNestable';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Test Helpers
// ============================================================================

function withNestable<K>(options: NestableOptions<K>, fn: (nestable: Nestable<K>) => void): void {
  createRoot((dispose) => {
    const nestable = createNestable(options);
    fn(nestable);
    dispose();
  });
}

/**
 * Standard nested layout: root container with two groups, each containing items.
 *
 * ```
 * Root (0, 0, 400, 500)
 * ├── Group A (10, 10, 380, 200)   accepts: ['item']
 * │   ├── item-1 (20, 20, 360, 40)   center=40
 * │   ├── item-2 (20, 70, 360, 40)   center=90
 * │   └── item-3 (20, 120, 360, 40)  center=140
 * └── Group B (10, 230, 380, 200)   accepts: ['item']
 *     ├── item-4 (20, 240, 360, 40)  center=260
 *     └── item-5 (20, 290, 360, 40)  center=310
 * ```
 */
function nestedSetup() {
  const rects = new Map<string, Rect.Rect>([
    ['groupA', Rect.of(10, 10, 380, 200)],
    ['item-1', Rect.of(20, 20, 360, 40)],
    ['item-2', Rect.of(20, 70, 360, 40)],
    ['item-3', Rect.of(20, 120, 360, 40)],
    ['groupB', Rect.of(10, 230, 380, 200)],
    ['item-4', Rect.of(20, 240, 360, 40)],
    ['item-5', Rect.of(20, 290, 360, 40)]
  ]);

  const containerRects = new Map<string, Rect.Rect>([
    ['root', Rect.of(0, 0, 400, 500)],
    ['groupA', Rect.of(10, 10, 380, 200)],
    ['groupB', Rect.of(10, 230, 380, 200)]
  ]);

  const parents = new Map<string, string>([
    ['groupA', 'root'],
    ['groupB', 'root'],
    ['item-1', 'groupA'],
    ['item-2', 'groupA'],
    ['item-3', 'groupA'],
    ['item-4', 'groupB'],
    ['item-5', 'groupB']
  ]);

  const containers: NestableContainer<string>[] = [
    {
      key: 'root',
      items: () => ['groupA', 'groupB'],
      getRect: (key) => rects.get(key),
      getContainerRect: () => containerRects.get('root')!
    },
    {
      key: 'groupA',
      items: () => ['item-1', 'item-2', 'item-3'],
      acceptTags: ['item'],
      getRect: (key) => rects.get(key),
      getContainerRect: () => containerRects.get('groupA')!
    },
    {
      key: 'groupB',
      items: () => ['item-4', 'item-5'],
      acceptTags: ['item'],
      getRect: (key) => rects.get(key),
      getContainerRect: () => containerRects.get('groupB')!
    }
  ];

  return { rects, containerRects, parents, containers };
}

// ============================================================================
// MARK: getInsertionPoint — basic nesting
// ============================================================================

describe('createNestable', () => {
  describe('getInsertionPoint — container selection', () => {
    it('selects the deepest container when pointer is in nested area', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        // Pointer inside Group A, above item-1 center (y=40)
        const place = nestable.getInsertionPoint(Vec2.of(100, 30));
        expect(place).toEqual({ parent: 'groupA', before: 'item-1' });
      });
    });

    it('selects deepest container for Group B', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        // Pointer inside Group B, past boundary between item-4 and item-5
        // Boundary = (item-4.bottom + item-5.top) / 2 = (280 + 290) / 2 = 285
        const place = nestable.getInsertionPoint(Vec2.of(100, 286));
        expect(place).toEqual({ parent: 'groupB', before: 'item-5' });
      });
    });

    it('falls back to root when pointer is outside all nested containers', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        // Pointer between Group A and Group B (y=220), inside root but not in any group
        const place = nestable.getInsertionPoint(Vec2.of(100, 220));
        // Root container: groupA center ≈ y=110, groupB center ≈ y=330
        // y=220 > 110 but < 330 → before groupB
        expect(place).toEqual({ parent: 'root', before: 'groupB' });
      });
    });

    it('returns undefined when pointer is outside all containers', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        const place = nestable.getInsertionPoint(Vec2.of(999, 999));
        expect(place).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // MARK: getInsertionPoint — insertion within container
  // ============================================================================

  describe('getInsertionPoint — insertion within container', () => {
    it('inserts before first item when pointer is above its center', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        const place = nestable.getInsertionPoint(Vec2.of(100, 25));
        expect(place).toEqual({ parent: 'groupA', before: 'item-1' });
      });
    });

    it('inserts between items when pointer is between their centers', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        // Between item-1 and item-2: boundary = (60 + 70) / 2 = 65. y=66 past it.
        const place = nestable.getInsertionPoint(Vec2.of(100, 66));
        expect(place).toEqual({ parent: 'groupA', before: 'item-2' });
      });
    });

    it('appends when pointer is below all items', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        // Below item-3 (center=140), still inside groupA rect (y < 210)
        const place = nestable.getInsertionPoint(Vec2.of(100, 180));
        expect(place).toEqual({ parent: 'groupA', before: null });
      });
    });

    it('appends to empty container', () => {
      const containerRects = new Map([['empty', Rect.of(0, 0, 200, 100)]]);
      const containers: NestableContainer<string>[] = [
        {
          key: 'empty',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => containerRects.get('empty')!
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        const place = nestable.getInsertionPoint(Vec2.of(50, 50));
        expect(place).toEqual({ parent: 'empty', before: null });
      });
    });
  });

  // ============================================================================
  // MARK: Tag constraints
  // ============================================================================

  describe('tag constraints', () => {
    it('skips containers that reject the drag tags', () => {
      const containers: NestableContainer<string>[] = [
        {
          key: 'root',
          items: () => ['a'],
          getRect: () => Rect.of(10, 10, 180, 40),
          getContainerRect: () => Rect.of(0, 0, 200, 200)
        },
        {
          key: 'folders-only',
          items: () => [],
          acceptTags: ['folder'],
          getRect: () => undefined,
          getContainerRect: () => Rect.of(10, 60, 180, 100)
        }
      ];

      withNestable({ containers: () => containers, dragTags: () => ['item'] }, (nestable) => {
        // Pointer is inside both root and folders-only. But folders-only rejects 'item' tag.
        const place = nestable.getInsertionPoint(Vec2.of(100, 80));
        // Should fall back to root
        expect(place?.parent).toBe('root');
      });
    });

    it('accepts when no drag tags and container has no constraints', () => {
      const containers: NestableContainer<string>[] = [
        {
          key: 'open',
          items: () => [],
          // no acceptTags = accepts everything
          getRect: () => undefined,
          getContainerRect: () => Rect.of(0, 0, 200, 200)
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        const place = nestable.getInsertionPoint(Vec2.of(100, 100));
        expect(place).toEqual({ parent: 'open', before: null });
      });
    });
  });

  // ============================================================================
  // MARK: Cycle prevention
  // ============================================================================

  describe('cycle prevention', () => {
    it('rejects dropping a parent into its own child', () => {
      const { containers, parents } = nestedSetup();
      withNestable(
        {
          containers: () => containers,
          draggedKeys: () => ['groupA'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          // Pointer inside Group A (which we're dragging). Should not drop into itself.
          const place = nestable.getInsertionPoint(Vec2.of(100, 80));
          // groupA is rejected due to cycle. Root is the fallback.
          expect(place?.parent).toBe('root');
        }
      );
    });

    it('allows dropping into a sibling container', () => {
      const { containers, parents } = nestedSetup();
      withNestable(
        {
          containers: () => containers,
          dragTags: () => ['item'],
          draggedKeys: () => ['item-1'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          // item-1 is in groupA. Dropping into groupB should be fine.
          const place = nestable.getInsertionPoint(Vec2.of(100, 270));
          expect(place?.parent).toBe('groupB');
        }
      );
    });

    it('allows dropping when no getParent is provided (no cycle check)', () => {
      const { containers } = nestedSetup();
      withNestable(
        {
          containers: () => containers,
          draggedKeys: () => ['groupA']
          // no getParent → no cycle check
        },
        (nestable) => {
          // Without getParent, cycle check is skipped
          const place = nestable.getInsertionPoint(Vec2.of(100, 80));
          expect(place).toBeDefined();
        }
      );
    });
  });

  // ============================================================================
  // MARK: getIndicatorOffset
  // ============================================================================

  describe('getIndicatorOffset', () => {
    it('returns offset for "before" place', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers }, (nestable) => {
        const result = nestable.getIndicatorOffset({ parent: 'groupA', before: 'item-2' });
        // item-2 rect y=70, groupA container y=10 → offset = 60
        expect(result).toEqual({ containerKey: 'groupA', offset: 60 });
      });
    });

    it('returns offset for "append" place (bottom of last item)', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers }, (nestable) => {
        const result = nestable.getIndicatorOffset({ parent: 'groupA', before: null });
        // item-3: y=120, height=40 → bottom=160. Container y=10 → offset = 150
        expect(result).toEqual({ containerKey: 'groupA', offset: 150 });
      });
    });

    it('returns offset 0 for append on empty container', () => {
      const containers: NestableContainer<string>[] = [
        {
          key: 'empty',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => Rect.of(0, 0, 200, 100)
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        const result = nestable.getIndicatorOffset({ parent: 'empty', before: null });
        expect(result).toEqual({ containerKey: 'empty', offset: 0 });
      });
    });

    it('returns undefined for unknown container', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers }, (nestable) => {
        const result = nestable.getIndicatorOffset({ parent: 'unknown', before: null });
        expect(result).toBeUndefined();
      });
    });

    it('returns undefined for undefined place', () => {
      const { containers } = nestedSetup();
      withNestable({ containers: () => containers }, (nestable) => {
        const result = nestable.getIndicatorOffset(undefined);
        expect(result).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // MARK: Edge cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles container with no rect gracefully', () => {
      const containers: NestableContainer<string>[] = [
        {
          key: 'ghost',
          items: () => ['a'],
          getRect: () => Rect.of(0, 0, 100, 40),
          getContainerRect: () => undefined // not mounted yet
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        const place = nestable.getInsertionPoint(Vec2.of(50, 20));
        expect(place).toBeUndefined();
      });
    });

    it('handles item with no rect gracefully (skips it)', () => {
      const containers: NestableContainer<string>[] = [
        {
          key: 'c',
          items: () => ['a', 'b'],
          getRect: (key) => (key === 'a' ? undefined : Rect.of(10, 60, 100, 40)),
          getContainerRect: () => Rect.of(0, 0, 120, 120)
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        // item 'a' has no rect, item 'b' center=80. Pointer at y=50 < 80 → should skip 'a', insert before 'b'
        const place = nestable.getInsertionPoint(Vec2.of(50, 50));
        expect(place).toEqual({ parent: 'c', before: 'b' });
      });
    });

    it('works with single container (equivalent to createSortable)', () => {
      const rects = new Map<string, Rect.Rect>([
        ['a', Rect.of(10, 10, 180, 40)],
        ['b', Rect.of(10, 60, 180, 40)]
      ]);
      const containers: NestableContainer<string>[] = [
        {
          key: 'list',
          items: () => ['a', 'b'],
          getRect: (key) => rects.get(key),
          getContainerRect: () => Rect.of(0, 0, 200, 120)
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        expect(nestable.getInsertionPoint(Vec2.of(100, 20))).toEqual({ parent: 'list', before: 'a' });
        expect(nestable.getInsertionPoint(Vec2.of(100, 56))).toEqual({ parent: 'list', before: 'b' });
        expect(nestable.getInsertionPoint(Vec2.of(100, 100))).toEqual({ parent: 'list', before: null });
      });
    });

    it('pointer on exact boundary between containers selects deeper one', () => {
      // Two overlapping containers: outer (large) and inner (small)
      const containers: NestableContainer<string>[] = [
        {
          key: 'outer',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => Rect.of(0, 0, 400, 400)
        },
        {
          key: 'inner',
          items: () => [],
          getRect: () => undefined,
          getContainerRect: () => Rect.of(50, 50, 100, 100)
        }
      ];

      withNestable({ containers: () => containers }, (nestable) => {
        // Pointer at edge of inner: should still select inner (smaller area)
        const place = nestable.getInsertionPoint(Vec2.of(50, 50));
        expect(place).toEqual({ parent: 'inner', before: null });
      });
    });
  });

  // ==========================================================================
  // MARK: draggedKeys — skip dragged items in insertion calculations
  // ==========================================================================

  describe('draggedKeys — skips dragged items', () => {
    it('excludes dragged item from insertion point calculation', () => {
      const { containers, parents } = nestedSetup();
      // Dragging item-3 (bottom item in groupA). Without filtering, pointer
      // near item-3 center (y=140) would return "before item-3". With filtering,
      // item-3 is excluded so pointer below item-2 center (y=90) → append.
      withNestable(
        {
          containers: () => containers,
          dragTags: () => ['item'],
          draggedKeys: () => ['item-3'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          // With item-3 excluded, remaining items: item-1(20-60), item-2(70-110).
          // item-2 is last: boundary = 110. y=115 > 110 → append.
          const place = nestable.getInsertionPoint(Vec2.of(100, 115));
          expect(place).toEqual({ parent: 'groupA', before: null });
        }
      );
    });

    it('skips dragged item so "before self" never occurs', () => {
      const { containers, parents } = nestedSetup();
      // Drag item-5 (last in groupB, center=310). Pointer at y=300 is between
      // item-4 center (260) and item-5 center (310). Without filtering → "before item-5".
      // With filtering → "append" since item-5 is excluded.
      withNestable(
        {
          containers: () => containers,
          dragTags: () => ['item'],
          draggedKeys: () => ['item-5'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          const place = nestable.getInsertionPoint(Vec2.of(100, 300));
          expect(place).toEqual({ parent: 'groupB', before: null });
        }
      );
    });

    it('insertion still works for non-dragged items', () => {
      const { containers, parents } = nestedSetup();
      // Drag item-1 (first in groupA). Pointer above item-2 center (90) → before item-2.
      withNestable(
        {
          containers: () => containers,
          dragTags: () => ['item'],
          draggedKeys: () => ['item-1'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          const place = nestable.getInsertionPoint(Vec2.of(100, 30));
          expect(place).toEqual({ parent: 'groupA', before: 'item-2' });
        }
      );
    });

    it('indicator offset uses last non-dragged item for append', () => {
      const { containers, containerRects, parents } = nestedSetup();
      // Drag item-3 (last in groupA). getIndicatorOffset for append should
      // use item-2 bottom (y=70+40=110), not item-3.
      // groupA container rect starts at y=10, so offset = 110 - 10 = 100.
      withNestable(
        {
          containers: () => containers,
          dragTags: () => ['item'],
          draggedKeys: () => ['item-3'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          const result = nestable.getIndicatorOffset({ parent: 'groupA', before: null });
          expect(result).toEqual({ containerKey: 'groupA', offset: 100 });
        }
      );
    });

    it('empty container after filtering all items → offset 0', () => {
      // Container with one item, that item is being dragged
      const containers: NestableContainer<string>[] = [
        {
          key: 'solo',
          items: () => ['only-item'],
          getRect: () => Rect.of(10, 10, 100, 40),
          getContainerRect: () => Rect.of(0, 0, 120, 60)
        }
      ];
      withNestable({ containers: () => containers, draggedKeys: () => ['only-item'] }, (nestable) => {
        const result = nestable.getIndicatorOffset({ parent: 'solo', before: null });
        expect(result).toEqual({ containerKey: 'solo', offset: 0 });
      });
    });

    it('multiple dragged keys are all excluded', () => {
      const { containers, parents } = nestedSetup();
      // Drag item-1 and item-2. Only item-3 remains in groupA.
      withNestable(
        {
          containers: () => containers,
          dragTags: () => ['item'],
          draggedKeys: () => ['item-1', 'item-2'],
          getParent: (key) => parents.get(key)
        },
        (nestable) => {
          // Pointer above item-3 center (140) → before item-3
          const place = nestable.getInsertionPoint(Vec2.of(100, 130));
          expect(place).toEqual({ parent: 'groupA', before: 'item-3' });
          // Pointer below item-3 bottom edge (160) → append
          const place2 = nestable.getInsertionPoint(Vec2.of(100, 165));
          expect(place2).toEqual({ parent: 'groupA', before: null });
        }
      );
    });
  });
});
