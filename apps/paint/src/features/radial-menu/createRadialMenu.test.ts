import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createRadialMenu, radialLayout, slotAt, type RadialItem } from './createRadialMenu';

it('numbers slots clockwise from the top and wraps around', () => {
  expect(slotAt(0)).toBe(0);
  expect(slotAt(Math.PI / 2)).toBe(3);
  expect(slotAt(Math.PI)).toBe(6);
  expect(slotAt(-Math.PI / 2)).toBe(9);
  expect(slotAt(-0.1)).toBe(0);
  expect(slotAt((Math.PI * 2 * 11.6) / 12)).toBe(0);
});

it('highlights the action a drag points at past the puck and runs it on release', () => {
  const { menu, brush, undo } = setup();
  const center = { x: 500, y: 400 };

  // Inside the puck nothing is chosen, even towards an action.
  menu.picker.move({ x: 500, y: 400 - radialLayout.puck / 2 }, center);
  expect(menu.highlighted()).toBeUndefined();
  expect(menu.picker.release({ x: 500, y: 400 - radialLayout.puck / 2 })).toBe(false);

  menu.picker.move({ x: 510, y: 300 }, center);
  expect(menu.highlighted()).toBe('brush');
  expect(menu.picker.release({ x: 510, y: 300 })).toBe(true);
  expect(brush).toHaveBeenCalledOnce();
  expect(menu.highlighted()).toBeUndefined();

  // Disabled actions and empty slots choose nothing; cancelling clears the highlight.
  menu.picker.move({ x: 380, y: 400 }, center);
  expect(menu.highlighted()).toBeUndefined();
  expect(menu.picker.release({ x: 500, y: 520 })).toBe(false);
  menu.picker.move({ x: 590, y: 310 }, center);
  menu.picker.cancel();
  expect(menu.highlighted()).toBeUndefined();
  expect(undo).not.toHaveBeenCalled();
});

it('closes the menu before running a pressed action, and ignores disabled ones', () => {
  const { menu, brush, undo, close } = setup();
  menu.choose('undo');
  expect(undo).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();

  menu.choose('brush');
  expect(close.mock.invocationCallOrder[0]).toBeLessThan(brush.mock.invocationCallOrder[0]!);
});

function setup() {
  const brush = vi.fn(),
    undo = vi.fn(),
    eraser = vi.fn(),
    close = vi.fn();
  const menu = createRoot(() => {
    const [center] = createSignal({ x: 500, y: 400 });
    const items: RadialItem[] = [
      { id: 'brush', label: 'Brush', icon: 'draw', slot: 0, run: brush },
      { id: 'eraser', label: 'Eraser', icon: 'erase', slot: 1, run: eraser },
      { id: 'undo', label: 'Undo', icon: 'undo', slot: 9, disabled: true, run: undo }
    ];
    return createRadialMenu({ center, items: () => items, close });
  });

  return { menu, brush, undo, close };
}
