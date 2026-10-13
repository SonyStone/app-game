// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createPenHover } from './createPenHover';

let dispose: (() => void) | undefined;
afterEach(() => dispose?.());

it('finds the pen hovering or showing up only on touching down, without waiting for a flush', () => {
  const penHover = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createPenHover();
  });
  expect(penHover.hovers()).toBeUndefined();

  pointer('pointerover', 1);
  pointer('pointerdown', 1);
  expect(penHover.hovers()).toBe(false);

  pointer('pointermove', 1);
  pointer('pointerup', 0);
  pointer('pointermove', 0);
  expect(penHover.hovers()).toBe(true);

  pointer('pointerdown', 1);
  expect(penHover.hovers()).toBe(true);

  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  expect(penHover.hovers()).toBe(false);
});

/** A pen event; jsdom has no PointerEvent constructor, so a MouseEvent carries `pointerType`. */
function pointer(type: string, buttons: number) {
  window.dispatchEvent(Object.assign(new MouseEvent(type, { buttons }), { pointerType: 'pen' }));
}
