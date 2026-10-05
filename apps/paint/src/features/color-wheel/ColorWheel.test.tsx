// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { ColorWheel } from './ColorWheel';
import { createColorWheelSettings } from './createColorWheelSettings';
import { hexToWheel } from './oklch';
import { contains, maskPolygon, toDisk } from './wheelGeometry';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  localStorage.clear();
});

it('turns the hue and changes saturation and lightness from the keyboard, keeping the lightness', () => {
  const { color, settle } = setup('#c04040');
  const start = hexToWheel(color());
  const disk = slider('Hue and saturation');
  key(disk, 'ArrowRight', true);
  expect(hexToWheel(color()).h).toBeCloseTo(start.h + 10, 0);
  expect(hexToWheel(color()).l).toBeCloseTo(start.l, 2);
  key(disk, 'ArrowDown', true);
  expect(hexToWheel(color()).s).toBeCloseTo(start.s - 0.1, 1);
  disk.dispatchEvent(new FocusEvent('blur'));
  expect(settle).toHaveBeenCalledOnce();

  key(slider('Lightness'), 'ArrowUp');
  expect(hexToWheel(color()).l).toBeCloseTo(start.l + 0.01, 2);
});

it('picks harmony colors, keeps keyboard edits inside the gamut mask and persists the guides', () => {
  const { color, wheel } = setup('#c04040');
  wheel.update({ harmony: 'complementary', mask: 'complementary', maskAngle: Math.round(hexToWheel(color()).h) });
  flush();
  const [marker] = document.querySelectorAll<SVGCircleElement>('[aria-label^="Use #"]');
  marker!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  flush();
  // Rounding to 8-bit channels moves the hue by about a degree.
  expect(Math.abs(hexToWheel(color()).h - ((hexToWheel('#c04040').h + 180) % 360))).toBeLessThan(2);

  // Turning the hue a quarter away would leave the narrow complementary mask; the edit stays inside it.
  for (let step = 0; step < 9; step++) {
    key(slider('Hue and saturation'), 'ArrowRight', true);
  }
  const mask = maskPolygon('complementary', wheel.settings().maskAngle);
  const point = toDisk(hexToWheel(color()));
  expect(contains(mask, { x: point.x * 0.98, y: point.y * 0.98 })).toBe(true);

  expect(createColorWheelSettings().settings()).toMatchObject({ harmony: 'complementary', mask: 'complementary' });
});

it('adds a mask corner by dragging an edge dot and removes one with a double tap', () => {
  const { wheel } = setup('#c04040');
  wheel.update({ mask: 'square', maskAngle: 0 });
  flush();
  // A 200 × 200 px disk area centered at (100, 100); jsdom lays nothing out.
  const disk = slider('Hue and saturation') as unknown as SVGSVGElement;
  disk.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  Element.prototype.setPointerCapture ??= () => {};

  const [dot] = document.querySelectorAll('[aria-label="Add mask corner"]');
  const press = (target: Element, type: string, x: number, y: number, timeStamp?: number) => {
    const event = new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y });
    if (timeStamp !== undefined) {
      Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    }

    target.dispatchEvent(event);
    flush();
  };
  press(dot!, 'pointerdown', 100, 40);
  press(dot!, 'pointermove', 100, 30);
  press(dot!, 'pointerup', 100, 30);
  const added = wheel.settings().customMask;
  expect(wheel.settings().mask).toBe('custom');
  expect(added).toHaveLength(5);
  // The new corner, between the first two, follows the drag: 70 px above the center of an 86 px radius.
  expect(added[1]!.y).toBeCloseTo(-70 / 86);
  expect(document.querySelectorAll('[aria-label="Mask corner"]')).toHaveLength(5);

  const corner = document.querySelectorAll('[aria-label="Mask corner"]')[1]!;
  press(corner, 'pointerdown', 100, 30, 1000);
  press(corner, 'pointerup', 100, 30, 1050);
  press(corner, 'pointerdown', 100, 30, 1200);
  expect(wheel.settings().customMask).toHaveLength(4);
  expect(wheel.settings().customMask).toEqual(added.filter((_, index) => index !== 1));
});

function setup(initial: string) {
  const [color, setColor] = createSignal(initial);
  const settle = vi.fn();
  const wheel = createColorWheelSettings();
  const host = document.body.appendChild(document.createElement('div'));
  dispose = render(
    () => (
      <ColorWheel
        color={color()}
        onChange={setColor}
        onSettle={settle}
        settings={wheel.settings()}
        onSettings={wheel.update}
      />
    ),
    host
  );
  flush();
  return { color, settle, wheel };
}

function slider(name: string) {
  return document.querySelector<HTMLElement>(`[role="slider"][aria-label="${name}"]`)!;
}

function key(target: Element, key: string, shiftKey = false) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  flush();
}
