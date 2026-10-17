// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import type { VariantScreen } from '../mockups/puck-gallery/kit/screen';
import { createBoxScreen } from './GalleryStage';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

/** A 200 × 100 box drawn at (300, 50) at `zoom`, as the canvas's camera would draw it, and its screen. */
function boxScreen(zoom: number) {
  const box = document.createElement('div');
  const inner = document.createElement('div');
  const outside = document.createElement('div');
  box.append(inner);
  document.body.append(box, outside);
  Object.defineProperty(box, 'offsetWidth', { value: 200 });
  box.getBoundingClientRect = () => new DOMRect(300, 50, 200 * zoom, 100 * zoom);
  inner.getBoundingClientRect = () => new DOMRect(300 + 20 * zoom, 50 + 10 * zoom, 40 * zoom, 30 * zoom);
  let screen!: VariantScreen;
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    screen = createBoxScreen(() => box, { width: 200, height: 100 });
  });

  return { screen, inner, outside };
}

it('measures in the box’s own pixels at any zoom', () => {
  const { screen, inner } = boxScreen(0.5);

  expect(screen.point({ clientX: 310, clientY: 60 })).toEqual({ x: 20, y: 20 });
  expect(screen.client({ x: 20, y: 20 })).toEqual({ x: 310, y: 60 });
  const rect = screen.rect(inner);
  expect([rect.left, rect.top, rect.width, rect.height]).toEqual([20, 10, 40, 30]);
});

it('owns the pointer over the box and its presses, and the keys once pressed', () => {
  const { screen, inner, outside } = boxScreen(1);
  const pointer = (type: string, target: Element) => {
    const event = new PointerEvent(type, { bubbles: true, pointerId: 7 });
    target.dispatchEvent(event);
    return event;
  };
  const key = (target: Element) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, key: 'a' });
    target.dispatchEvent(event);
    return event;
  };

  expect(screen.owns(pointer('pointermove', inner))).toBe(true);
  expect(screen.owns(pointer('pointermove', outside))).toBe(false);
  expect(screen.owns(key(document.body))).toBe(false);

  pointer('pointerdown', inner);
  // The press goes on outside the box.
  expect(screen.owns(pointer('pointermove', outside))).toBe(true);
  expect(screen.owns(key(document.body))).toBe(true);

  const field = document.createElement('textarea');
  document.body.append(field);
  expect(screen.owns(key(field))).toBe(false);

  pointer('pointerup', outside);
  pointer('pointerdown', outside);
  expect(screen.owns(key(document.body))).toBe(false);
});
