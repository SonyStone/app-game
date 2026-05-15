import { batch, createRoot, createSignal } from 'solid-js';
import { GAP_KEY } from 'src/core/displayList';
import type { Place } from 'src/core/place';
import * as Rect from 'src/core/rect';
import { reorderItems } from 'src/core/reorder';
import * as Vec2 from 'src/core/vec2';
import { createDisplayList } from 'src/primitives/createDisplayList';
import { createSelection } from 'src/primitives/createSelection';
import { createSortable } from 'src/primitives/createSortable';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Test Helpers
// ============================================================================

/**
 * Standard 4-item vertical list layout.
 *
 * ```
 * Container: (0, 0, 200, 200)
 *
 *   y=0   ┌─────────────────────┐  Item A (0, 0, 200, 40)   center=20
 *   y=40  ├─────────────────────┤
 *   y=50  │ Item B (0, 50, 200, 40)   center=70
 *   y=90  ├─────────────────────┤
 *  y=100  │ Item C (0, 100, 200, 40)  center=120
 *  y=140  ├─────────────────────┤
 *  y=150  │ Item D (0, 150, 200, 40)  center=170
 *  y=190  └─────────────────────┘
 *  y=200  container bottom
 * ```
 */
function makeLayout() {
  const rects = new Map<string, Rect.Rect>([
    ['a', Rect.of(0, 0, 200, 40)],
    ['b', Rect.of(0, 50, 200, 40)],
    ['c', Rect.of(0, 100, 200, 40)],
    ['d', Rect.of(0, 150, 200, 40)]
  ]);
  const containerRect = Rect.of(0, 0, 200, 200);
  return { rects, containerRect };
}

// ============================================================================
// MARK: Sortable + DisplayList integration
// ============================================================================

describe('sortable + display list integration', () => {
  it('sortable produces insertion point → display list shows gap', () => {
    createRoot((dispose) => {
      const { rects, containerRect } = makeLayout();
      const [items] = createSignal(['a', 'b', 'c', 'd']);
      const [draggedKeys, setDraggedKeys] = createSignal<string[]>([]);
      const [dropPlace, setDropPlace] = createSignal<Place<string> | undefined>(undefined);

      const sortable = createSortable<string>({
        containerKey: 'list',
        items,
        draggedKeys,
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      const display = createDisplayList<string>({
        keys: items,
        draggedKeys,
        place: dropPlace,
        containerKey: 'list'
      });

      // Initially no gap
      expect(display.displayKeys()).toEqual(['a', 'b', 'c', 'd']);

      // Simulate dragging 'b' — pointer at y=110 (below center of 'c' at 120)
      batch(() => {
        setDraggedKeys(['b']);
        const place = sortable.getInsertionPoint(Vec2.of(100, 110));
        setDropPlace(place);
      });

      // Pointer at y=110 < center of c (120), so place = before 'c'
      expect(dropPlace()).toEqual({ parent: 'list', before: 'c' });
      // Display: 'b' removed, gap before 'c'
      expect(display.displayKeys()).toEqual(['a', GAP_KEY, 'c', 'd']);

      dispose();
    });
  });

  it('moving pointer updates insertion point and gap position', () => {
    createRoot((dispose) => {
      const { rects, containerRect } = makeLayout();
      const [items] = createSignal(['a', 'b', 'c', 'd']);
      const [draggedKeys] = createSignal(['a']);
      const [dropPlace, setDropPlace] = createSignal<Place<string> | undefined>(undefined);

      const sortable = createSortable<string>({
        containerKey: 'list',
        items,
        draggedKeys,
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      const display = createDisplayList<string>({
        keys: items,
        draggedKeys,
        place: dropPlace,
        containerKey: 'list'
      });

      // Pointer near top → before 'b' (first non-dragged item)
      setDropPlace(sortable.getInsertionPoint(Vec2.of(100, 60)));
      expect(dropPlace()).toEqual({ parent: 'list', before: 'b' });
      expect(display.displayKeys()).toEqual([GAP_KEY, 'b', 'c', 'd']);

      // Pointer moves to middle → before 'c'
      setDropPlace(sortable.getInsertionPoint(Vec2.of(100, 110)));
      expect(dropPlace()).toEqual({ parent: 'list', before: 'c' });
      expect(display.displayKeys()).toEqual(['b', GAP_KEY, 'c', 'd']);

      // Pointer moves to bottom → append
      setDropPlace(sortable.getInsertionPoint(Vec2.of(100, 195)));
      expect(dropPlace()).toEqual({ parent: 'list', before: null });
      expect(display.displayKeys()).toEqual(['b', 'c', 'd', GAP_KEY]);

      dispose();
    });
  });

  it('reorderItems produces correct new order from sortable place', () => {
    createRoot((dispose) => {
      const { rects, containerRect } = makeLayout();
      const [items, setItems] = createSignal(['a', 'b', 'c', 'd']);
      const [draggedKeys] = createSignal(['b']);

      const sortable = createSortable<string>({
        containerKey: 'list',
        items,
        draggedKeys,
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      // Pointer at y=160 (center of d=170) → before 'd'
      const place = sortable.getInsertionPoint(Vec2.of(100, 160));
      expect(place).toEqual({ parent: 'list', before: 'd' });

      // Apply the reorder
      const newOrder = reorderItems(items(), ['b'], place!, (k) => k);
      setItems(newOrder);

      expect(items()).toEqual(['a', 'c', 'b', 'd']);

      dispose();
    });
  });

  it('pointer outside container returns undefined', () => {
    createRoot((dispose) => {
      const { rects, containerRect } = makeLayout();
      const [items] = createSignal(['a', 'b', 'c', 'd']);

      const sortable = createSortable<string>({
        containerKey: 'list',
        items,
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      // Outside container bounds
      expect(sortable.getInsertionPoint(Vec2.of(-10, 100))).toBeUndefined();
      expect(sortable.getInsertionPoint(Vec2.of(100, -10))).toBeUndefined();
      expect(sortable.getInsertionPoint(Vec2.of(300, 100))).toBeUndefined();
      expect(sortable.getInsertionPoint(Vec2.of(100, 300))).toBeUndefined();

      dispose();
    });
  });
});

// ============================================================================
// MARK: Sortable + Selection + DisplayList integration
// ============================================================================

describe('sortable + selection + display list integration', () => {
  it('multi-select drag moves all selected items', () => {
    createRoot((dispose) => {
      const { rects, containerRect } = makeLayout();
      const [items, setItems] = createSignal(['a', 'b', 'c', 'd']);
      const itemKeys = () => items();

      const selection = createSelection<string>({
        items: itemKeys
      });

      // Select 'a' and 'b'
      selection.handleClick('a', { ctrlKey: false, metaKey: false, shiftKey: false });
      selection.handleClick('b', { ctrlKey: false, metaKey: false, shiftKey: true });
      expect(selection.selected()).toEqual(['a', 'b']);

      const draggedKeys = () => selection.selected();

      const sortable = createSortable<string>({
        containerKey: 'list',
        items: itemKeys,
        draggedKeys,
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      const display = createDisplayList<string>({
        keys: itemKeys,
        draggedKeys,
        place: () => sortable.getInsertionPoint(Vec2.of(100, 160)),
        containerKey: 'list'
      });

      // Both 'a' and 'b' are dragged, pointer near 'd' → before 'd'
      expect(display.isDragged('a')).toBe(true);
      expect(display.isDragged('b')).toBe(true);
      expect(display.isDragged('c')).toBe(false);
      // Display: 'a' and 'b' removed, gap before 'd'
      expect(display.displayKeys()).toEqual(['c', GAP_KEY, 'd']);

      // Reorder
      const place = sortable.getInsertionPoint(Vec2.of(100, 160));
      const newOrder = reorderItems(items(), ['a', 'b'], place!, (k) => k);
      setItems(newOrder);

      expect(items()).toEqual(['c', 'a', 'b', 'd']);

      dispose();
    });
  });

  it('selection clear + re-drag works cleanly', () => {
    createRoot((dispose) => {
      const { rects, containerRect } = makeLayout();
      const [items] = createSignal(['a', 'b', 'c', 'd']);
      const itemKeys = () => items();

      const selection = createSelection<string>({ items: itemKeys });

      // Select 'c'
      selection.handleClick('c', { ctrlKey: false, metaKey: false, shiftKey: false });
      expect(selection.selected()).toEqual(['c']);

      const sortable = createSortable<string>({
        containerKey: 'list',
        items: itemKeys,
        draggedKeys: () => selection.selected(),
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      // Insertion point with 'c' dragged, pointer at y=10 (above center of 'a')
      const place = sortable.getInsertionPoint(Vec2.of(100, 10));
      expect(place).toEqual({ parent: 'list', before: 'a' });

      // Clear and select different item
      selection.clear();
      selection.handleClick('d', { ctrlKey: false, metaKey: false, shiftKey: false });
      expect(selection.selected()).toEqual(['d']);

      // Now 'd' is dragged, pointer at y=10 → before 'a'
      const place2 = sortable.getInsertionPoint(Vec2.of(100, 10));
      expect(place2).toEqual({ parent: 'list', before: 'a' });

      dispose();
    });
  });
});

// ============================================================================
// MARK: Sortable grid + DisplayList integration
// ============================================================================

describe('sortable grid + display list integration', () => {
  it('grid sortable produces correct insertion points', () => {
    createRoot((dispose) => {
      // 4 items in 2 columns grid
      const rects = new Map<string, Rect.Rect>([
        ['a', Rect.of(0, 0, 100, 80)],
        ['b', Rect.of(108, 0, 100, 80)],
        ['c', Rect.of(0, 88, 100, 80)],
        ['d', Rect.of(108, 88, 100, 80)]
      ]);
      const containerRect = Rect.of(0, 0, 216, 176);

      const [items] = createSignal(['a', 'b', 'c', 'd']);
      const [draggedKeys] = createSignal(['b']);
      const [dropPlace, setDropPlace] = createSignal<Place<string> | undefined>(undefined);

      const sortable = createSortable<string>({
        containerKey: 'grid',
        items,
        layout: 'grid',
        gridConfig: { columns: 2, gap: 8, rowHeight: 80 },
        draggedKeys,
        getRect: (key) => rects.get(key),
        getContainerRect: () => containerRect
      });

      const display = createDisplayList<string>({
        keys: items,
        draggedKeys,
        place: dropPlace,
        containerKey: 'grid'
      });

      // Pointer in first cell → before 'a'
      setDropPlace(sortable.getInsertionPoint(Vec2.of(50, 40)));
      expect(dropPlace()?.before).toBe('a');
      expect(display.displayKeys()).toEqual([GAP_KEY, 'a', 'c', 'd']);

      // Pointer in last cell → before 'd' or append depending on exact position
      setDropPlace(sortable.getInsertionPoint(Vec2.of(160, 130)));
      // Should resolve to some valid place in the grid
      expect(dropPlace()).toBeDefined();

      dispose();
    });
  });
});
