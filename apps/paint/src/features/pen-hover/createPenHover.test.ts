// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createPenHover } from './createPenHover';

let dispose: (() => void) | undefined;
beforeEach(() => localStorage.clear());
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

it('counts touches in a row without hover only once the pen is known to hover', () => {
  const penHover = start();

  // A pen that never hovers here, as on a tablet without hover, has not lost it.
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  expect(penHover.lostContacts()).toBe(0);

  pointer('pointermove', 0);
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  expect(penHover.lostContacts()).toBe(0);

  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  expect(penHover.lostContacts()).toBe(2);

  pointer('pointerup', 0);
  pointer('pointermove', 0);
  expect(penHover.lostContacts()).toBe(0);
});

it('remembers the hover for pages that never see the pen hover, as in a tab that already lost it', () => {
  const first = start();
  pointer('pointermove', 0);
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  expect(first.lostContacts()).toBe(0);
  dispose?.();

  const reloaded = start();
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  expect(reloaded.lostContacts()).toBe(2);
});

it('forgets the hover when a page opened to get it back touches down before it hovered', () => {
  start();
  pointer('pointermove', 0);
  dispose?.();

  // A page that got hover back counts as usual.
  const restored = start({ trustRemembered: false });
  pointer('pointermove', 0);
  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  expect(restored.lostContacts()).toBe(1);
  dispose?.();

  const moved = start({ trustRemembered: false });
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  expect(moved.lostContacts()).toBe(0);
  dispose?.();

  const reloaded = start();
  pointer('pointerdown', 1);
  pointer('pointerup', 0);
  pointer('pointerdown', 1);
  expect(reloaded.lostContacts()).toBe(0);
});

function start(options?: Parameters<typeof createPenHover>[0]) {
  return createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createPenHover(options);
  });
}

/** A pen event; jsdom has no PointerEvent constructor, so a MouseEvent carries `pointerType`. */
function pointer(type: string, buttons: number) {
  window.dispatchEvent(Object.assign(new MouseEvent(type, { buttons }), { pointerType: 'pen' }));
}
