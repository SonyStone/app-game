// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, it } from 'vitest';
import type { BoxState } from './createTransform';
import { TransformNumbers } from './TransformNumbers';

it('applies exact sizes, angles and offsets, keeping proportions when asked, and not to a distorted box', () => {
  const [box, setBox] = createSignal<BoxState>({ offset: { x: 0, y: 0 }, scale: { x: -1, y: 1 }, angle: 0 });
  const [proportional, setProportional] = createSignal(true);
  const host = document.body.appendChild(document.createElement('div'));
  const dispose = render(
    () => (
      <TransformNumbers
        placement={{ left: 0, top: 0 }}
        box={box()}
        settings={{ proportional: proportional(), interpolation: 'smooth' }}
        onChange={setBox}
      />
    ),
    host
  );
  const commit = (name: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flush();
  };

  flush();
  // A flipped box keeps its flip; proportions scale both axes.
  commit('Width', '200');
  expect(box().scale).toEqual({ x: -2, y: 2 });
  setProportional(false);
  flush();
  commit('Height', '50');
  expect(box().scale).toEqual({ x: -2, y: 0.5 });
  commit('Angle', '270');
  expect(box().angle).toBeCloseTo(-Math.PI / 2);
  commit('Move horizontally', '12,5');
  expect(box().offset.x).toBe(12.5);
  commit('Move vertically', 'abc');
  expect(box().offset.y).toBe(0);
  expect(host.querySelector<HTMLInputElement>('[aria-label="Move vertically"]')!.value).toBe('0');

  setBox({
    ...box(),
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]
  });
  flush();
  expect(host.querySelector<HTMLInputElement>('[aria-label="Width"]')!.disabled).toBe(true);
  dispose();
  host.remove();
});
