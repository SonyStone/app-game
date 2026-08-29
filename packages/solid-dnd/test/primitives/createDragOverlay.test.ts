import { createRoot, createSignal, flush } from 'solid-js';
import { of as vec2 } from 'src/core/vec2';
import { createDragOverlay } from 'src/primitives/createDragOverlay';
import { describe, expect, it, vi } from 'vitest';

function createMockElement(rect: { x: number; y: number; width: number; height: number }): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = vi.fn(() => ({
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => undefined
  }));
  return element;
}

function createOverlayFixture(currentPosition: () => ReturnType<typeof vec2> | null) {
  return createRoot((dispose) => ({
    dispose,
    overlay: createDragOverlay({ currentPosition })
  }));
}

describe('createDragOverlay', () => {
  it('is inactive initially', () => {
    const { dispose, overlay } = createOverlayFixture(() => null);

    expect(overlay.active()).toBe(false);
    expect(overlay.rect).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
    expect(overlay.sourceRect()).toBeUndefined();
    dispose();
  });

  it('captures element metrics on start()', () => {
    const { dispose, overlay } = createOverlayFixture(() => vec2(120, 215));
    const element = createMockElement({ x: 100, y: 200, width: 150, height: 40 });

    overlay.start(element, vec2(120, 215));
    flush();

    expect(overlay.active()).toBe(true);
    expect(overlay.rect).toMatchObject({ width: 150, height: 40 });
    expect(overlay.sourceRect()).toEqual({ x: 100, y: 200, width: 150, height: 40 });
    dispose();
  });

  it('computes the grab offset and follows the pointer', () => {
    const [position, setPosition] = createSignal(vec2(120, 215));
    const { dispose, overlay } = createOverlayFixture(position);
    const element = createMockElement({ x: 100, y: 200, width: 150, height: 40 });

    overlay.start(element, vec2(120, 215));
    flush();
    expect(overlay.rect).toMatchObject({ x: 100, y: 200 });

    setPosition(vec2(200, 300));
    flush();
    expect(overlay.rect).toMatchObject({ x: 180, y: 285 });
    dispose();
  });

  it('resets on stop()', () => {
    const { dispose, overlay } = createOverlayFixture(() => vec2(120, 215));
    const element = createMockElement({ x: 100, y: 200, width: 150, height: 40 });

    overlay.start(element, vec2(120, 215));
    flush();
    overlay.stop();
    flush();

    expect(overlay.active()).toBe(false);
    expect(overlay.sourceRect()).toBeUndefined();
    expect(overlay.rect).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
    dispose();
  });

  it('uses zero geometry when the source has no measurable rect', () => {
    const { dispose, overlay } = createOverlayFixture(() => vec2(50, 50));

    overlay.start(document.createElement('div'), vec2(50, 50));
    flush();

    expect(overlay.active()).toBe(true);
    expect(overlay.rect).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
    dispose();
  });
});
