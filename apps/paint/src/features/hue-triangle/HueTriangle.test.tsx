// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { hexToHsv } from '../color/hsv';
import { HueTriangle } from './HueTriangle';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it('turns the hue on the ring and picks saturation and value in the triangle', () => {
  const [color, setColor] = createSignal('#ff0000');
  const settle = vi.fn();
  dispose = render(
    () => <HueTriangle color={color()} onChange={setColor} onSettle={settle} />,
    document.body.appendChild(document.createElement('div'))
  );
  flush();
  // jsdom lays nothing out: a 220 × 220 px square at the origin, so view box units are CSS pixels.
  const svg = document.querySelector('svg')!;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 220, height: 220 }) as DOMRect;
  svg.setPointerCapture = () => {};
  const press = (type: string, x: number, y: number) => {
    svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
    flush();
  };

  // The right of the ring is hue 90: yellowish green at full saturation and value.
  press('pointerdown', 210, 110);
  press('pointerup', 210, 110);
  expect(hexToHsv(color()).h).toBeCloseTo(90, 0);
  expect(settle).toHaveBeenCalledOnce();

  // The center of the triangle mixes its three corners equally: saturation ½, value ⅔.
  press('pointerdown', 110, 110);
  const centered = hexToHsv(color());
  expect(centered.s).toBeCloseTo(0.5, 1);
  expect(centered.v).toBeCloseTo(2 / 3, 1);

  const brightness = document.querySelector<HTMLElement>('[aria-label="Saturation and brightness"]')!;
  brightness.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
  flush();
  expect(hexToHsv(color()).v).toBeCloseTo(2 / 3 + 0.1, 1);
});
