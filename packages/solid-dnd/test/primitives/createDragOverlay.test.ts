import { createRoot, createSignal } from 'solid-js';
import { of as vec2 } from 'src/core/vec2';
import { createDragOverlay } from 'src/primitives/createDragOverlay';
import { describe, expect, it, vi } from 'vitest';

// ============================================================================
// MARK: Helpers
// ============================================================================

function createMockElement(rect: { x: number; y: number; width: number; height: number }): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = vi.fn(() => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => {}
  }));
  return el;
}

// ============================================================================
// MARK: createDragOverlay
// ============================================================================

describe('createDragOverlay', () => {
  it('is inactive initially', () => {
    createRoot((dispose) => {
      const overlay = createDragOverlay({
        currentPosition: () => null
      });

      expect(overlay.active()).toBe(false);
      expect(overlay.position()).toEqual({ x: 0, y: 0 });
      expect(overlay.size()).toEqual({ x: 0, y: 0 });
      expect(overlay.sourceRect()).toBeUndefined();

      dispose();
    });
  });

  it('captures element metrics on start()', () => {
    createRoot((dispose) => {
      const el = createMockElement({ x: 100, y: 200, width: 150, height: 40 });

      const overlay = createDragOverlay({
        currentPosition: () => vec2(120, 215)
      });

      expect(overlay.active()).toBe(false);

      // Start dragging
      overlay.start(el, vec2(120, 215));

      expect(overlay.active()).toBe(true);
      expect(overlay.size()).toEqual({ x: 150, y: 40 });
      expect(overlay.sourceRect()).toEqual({ x: 100, y: 200, width: 150, height: 40 });

      dispose();
    });
  });

  it('computes correct grab offset and position', () => {
    createRoot((dispose) => {
      const [pos, setPos] = createSignal(vec2(120, 215));
      const el = createMockElement({ x: 100, y: 200, width: 150, height: 40 });

      const overlay = createDragOverlay({
        currentPosition: pos
      });

      // Start: grab offset = (120-100, 215-200) = (20, 15)
      overlay.start(el, vec2(120, 215));

      // Position should be currentPosition - grabOffset
      // 120 - 20 = 100, 215 - 15 = 200 (back to the element's top-left)
      expect(overlay.position()).toEqual({ x: 100, y: 200 });

      // Move pointer
      setPos(vec2(200, 300));
      // 200 - 20 = 180, 300 - 15 = 285
      expect(overlay.position()).toEqual({ x: 180, y: 285 });

      dispose();
    });
  });

  it('resets on stop()', () => {
    createRoot((dispose) => {
      const el = createMockElement({ x: 100, y: 200, width: 150, height: 40 });

      const overlay = createDragOverlay({
        currentPosition: () => vec2(120, 215)
      });

      overlay.start(el, vec2(120, 215));
      expect(overlay.active()).toBe(true);

      overlay.stop();
      expect(overlay.active()).toBe(false);
      expect(overlay.sourceRect()).toBeUndefined();
      expect(overlay.size()).toEqual({ x: 0, y: 0 });

      dispose();
    });
  });

  it('returns currentPosition when started without valid element rect', () => {
    createRoot((dispose) => {
      // Element that returns a zero-sized rect
      const el = document.createElement('div');
      // Default getBoundingClientRect returns 0s

      const overlay = createDragOverlay({
        currentPosition: () => vec2(50, 50)
      });

      overlay.start(el, vec2(50, 50));
      expect(overlay.active()).toBe(true);
      // With zero-size rect at (0,0), grab offset = (50-0, 50-0) = (50,50)
      // Position = (50-50, 50-50) = (0,0)
      expect(overlay.position()).toEqual({ x: 0, y: 0 });

      dispose();
    });
  });
});
