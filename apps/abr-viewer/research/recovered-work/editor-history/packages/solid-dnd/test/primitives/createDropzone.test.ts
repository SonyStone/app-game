import { createRoot, createSignal } from 'solid-js';
import { GAP_KEY } from 'src/core/displayList';
import type { Place } from 'src/core/place';
import { createDropzone, createTreeDropzone } from 'src/primitives/createDropzone';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: createDropzone
// ============================================================================

describe('createDropzone', () => {
  it('returns all keys when not dragging', () => {
    createRoot((dispose) => {
      const dropzone = createDropzone<string>({
        keys: () => ['a', 'b', 'c'],
        draggedKeys: () => [],
        place: () => undefined,
        containerKey: 'list'
      });

      expect(dropzone.displayKeys()).toEqual(['a', 'b', 'c']);
      dispose();
    });
  });

  it('removes dragged items and inserts gap', () => {
    createRoot((dispose) => {
      const dropzone = createDropzone<string>({
        keys: () => ['a', 'b', 'c', 'd'],
        draggedKeys: () => ['b'],
        place: () => ({ parent: 'list', before: 'c' }),
        containerKey: 'list'
      });

      // 'b' removed from list, gap before 'c'
      expect(dropzone.displayKeys()).toEqual(['a', GAP_KEY, 'c', 'd']);
      dispose();
    });
  });

  it('appends gap when place.before is null', () => {
    createRoot((dispose) => {
      const dropzone = createDropzone<string>({
        keys: () => ['a', 'b', 'c'],
        draggedKeys: () => ['b'],
        place: () => ({ parent: 'list', before: null }),
        containerKey: 'list'
      });

      expect(dropzone.displayKeys()).toEqual(['a', 'c', GAP_KEY]);
      dispose();
    });
  });

  it('isDragged returns correct values', () => {
    createRoot((dispose) => {
      const dropzone = createDropzone<string>({
        keys: () => ['a', 'b', 'c'],
        draggedKeys: () => ['b'],
        place: () => undefined,
        containerKey: 'list'
      });

      expect(dropzone.isDragged('a')).toBe(false);
      expect(dropzone.isDragged('b')).toBe(true);
      expect(dropzone.isDragged('c')).toBe(false);
      dispose();
    });
  });

  it('reacts to signal changes', () => {
    createRoot((dispose) => {
      const [draggedKeys, setDraggedKeys] = createSignal<string[]>([]);
      const [place, setPlace] = createSignal<Place<string> | undefined>(undefined);

      const dropzone = createDropzone<string>({
        keys: () => ['a', 'b', 'c'],
        draggedKeys,
        place,
        containerKey: 'list'
      });

      // Initially: just keys, no gap
      expect(dropzone.displayKeys()).toEqual(['a', 'b', 'c']);

      // Start dragging 'b', place before 'c'
      setDraggedKeys(['b']);
      setPlace({ parent: 'list', before: 'c' });
      expect(dropzone.displayKeys()).toEqual(['a', GAP_KEY, 'c']);

      // Move insertion point to end
      setPlace({ parent: 'list', before: null });
      expect(dropzone.displayKeys()).toEqual(['a', 'c', GAP_KEY]);

      // Stop dragging
      setDraggedKeys([]);
      setPlace(undefined);
      expect(dropzone.displayKeys()).toEqual(['a', 'b', 'c']);

      dispose();
    });
  });

  it('handles multiple dragged keys', () => {
    createRoot((dispose) => {
      const dropzone = createDropzone<string>({
        keys: () => ['a', 'b', 'c', 'd'],
        draggedKeys: () => ['a', 'c'],
        place: () => ({ parent: 'list', before: 'd' }),
        containerKey: 'list'
      });

      // Both 'a' and 'c' removed, gap before 'd'
      expect(dropzone.displayKeys()).toEqual(['b', GAP_KEY, 'd']);
      dispose();
    });
  });
});

// ============================================================================
// MARK: createTreeDropzone
// ============================================================================

describe('createTreeDropzone', () => {
  const tree = () =>
    ({
      root: ['groupA', 'groupB'],
      groupA: ['x', 'y'],
      groupB: ['z']
    }) as Record<string, string[]>;

  it('returns keys for each container when not dragging', () => {
    createRoot((dispose) => {
      const dropzone = createTreeDropzone<string>({
        tree,
        draggedKeys: () => [],
        place: () => undefined
      });

      expect(dropzone.getDisplayKeys('root')).toEqual(['groupA', 'groupB']);
      expect(dropzone.getDisplayKeys('groupA' as any)).toEqual(['x', 'y']);
      expect(dropzone.getDisplayKeys('groupB' as any)).toEqual(['z']);
      dispose();
    });
  });

  it('removes dragged item and inserts gap in target container', () => {
    createRoot((dispose) => {
      const dropzone = createTreeDropzone<string>({
        tree,
        draggedKeys: () => ['y'],
        place: () => ({ parent: 'groupB', before: 'z' })
      });

      // 'y' removed from groupA
      expect(dropzone.getDisplayKeys('groupA' as any)).toEqual(['x']);
      // Gap in groupB before 'z'
      expect(dropzone.getDisplayKeys('groupB' as any)).toEqual([GAP_KEY, 'z']);
      expect(dropzone.getDisplayKeys('root')).toEqual(['groupA', 'groupB']);
      dispose();
    });
  });

  it('isDragged returns correct values', () => {
    createRoot((dispose) => {
      const dropzone = createTreeDropzone<string>({
        tree,
        draggedKeys: () => ['y'],
        place: () => undefined
      });

      expect(dropzone.isDragged('x')).toBe(false);
      expect(dropzone.isDragged('y')).toBe(true);
      expect(dropzone.isDragged('z')).toBe(false);
      dispose();
    });
  });

  it('returns empty array for unknown container', () => {
    createRoot((dispose) => {
      const dropzone = createTreeDropzone<string>({
        tree,
        draggedKeys: () => [],
        place: () => undefined
      });

      expect(dropzone.getDisplayKeys('nonexistent' as any)).toEqual([]);
      dispose();
    });
  });
});
