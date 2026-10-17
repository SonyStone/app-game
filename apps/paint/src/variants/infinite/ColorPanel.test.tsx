// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hexToHsv, hsvToHex } from '../../features/color/hsv';
import { tone } from '../../features/color/toneLock';
import { orbColor } from '../../features/lighting-orb';
import { ColorPanel } from './ColorPanel';
import { defaultInfiniteColorSettings, type InfiniteColorSettings } from './createInfiniteColorSettings';

let host: HTMLDivElement;
let dispose: () => void;
let color: () => string;
let settings: () => InfiniteColorSettings;
let commits: string[];

beforeEach(() => {
  const [value, setValue] = createSignal(start);
  const [current, setCurrent] = createSignal(defaultInfiniteColorSettings);
  color = value;
  settings = current;
  commits = [];
  host = document.body.appendChild(document.createElement('div'));
  dispose = render(
    () => (
      <ColorPanel
        color={value()}
        previous="#3d6a8c"
        recent={['#e7e2cf', '#1f4a2c']}
        settings={current()}
        onSettings={(patch) => setCurrent((before) => ({ ...before, ...patch }))}
        onInput={setValue}
        onCommit={(committed) => commits.push(committed)}
        onEyedropper={() => {}}
      />
    ),
    host
  );
  flush();
});

afterEach(() => {
  dispose();
  host.remove();
});

it('toggles Tone Lock with a tap on the hue pointer, and then turns the hue at the same tone', () => {
  const wheel = pressable('[aria-label="HSB color wheel"]', 244, 244);
  const pointer = huePoint(hexToHsv(start).h);
  press(wheel, [pointer]);
  expect(settings().toneLock).toBe(true);
  expect(host.querySelector('[role="switch"][aria-label^="Tone Lock"]')!.getAttribute('aria-checked')).toBe('true');
  expect(commits).toEqual([]);

  press(wheel, [huePoint(240), huePoint(120)]);
  const committed = commits.at(-1)!;
  expect(color()).toBe(committed);
  expect(Math.abs(tone(committed) - tone(start))).toBeLessThan(0.01);
  expect(Math.abs(hexToHsv(committed).h - 120)).toBeLessThan(4);
});

it('keeps saturation and brightness when the hue turns without Tone Lock, and picks them in the square', () => {
  const wheel = pressable('[aria-label="HSB color wheel"]', 244, 244);
  const { s, v } = hexToHsv(start);
  press(wheel, [huePoint(200)]);
  expect(commits).toEqual([hsvToHex({ h: 200, s, v })]);

  press(wheel, [{ x: 122 + 63, y: 122 - 63 }]);
  expect(commits.at(-1)).toBe(hsvToHex({ h: 200, s: 1, v: 1 }));
  expect(color()).toBe(commits.at(-1));
});

it('restores the previous color and shows tones under the color bar with Compare tone', () => {
  host.querySelector<HTMLButtonElement>('[aria-label^="Previous color"]')!.click();
  flush();
  expect(color()).toBe('#3d6a8c');
  expect(commits).toEqual(['#3d6a8c']);

  const halves = () => [...host.querySelector('[aria-label^="Previous color"]')!.parentElement!.children];
  expect(halves().every((half) => half.children.length === 1)).toBe(true);
  button('Color settings').click();
  flush();
  host.querySelector<HTMLButtonElement>('[role="switch"]:nth-of-type(3)')!.click();
  flush();
  expect(settings().compareTone).toBe(true);
  expect(halves().every((half) => half.children.length === 2)).toBe(true);
  button('HSB color wheel').click();
  flush();
  expect(host.querySelector('[aria-label="HSB color wheel"][role="group"]')).not.toBeNull();
});

it('takes hex in either form, ignores anything else, and steps RGB sliders', () => {
  button('Color sliders').click();
  flush();
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Hexadecimal color"]')!;
  expect(field.value).toBe(start.slice(1).toUpperCase());
  field.value = 'f00';
  field.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(color()).toBe('#ff0000');
  expect(commits).toEqual(['#ff0000']);

  field.value = 'nope';
  field.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(field.value).toBe('FF0000');
  expect(commits).toHaveLength(1);

  [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((radio) => radio.textContent === 'RGB')!.click();
  flush();
  expect(settings().model).toBe('rgb');
  slider('R').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  flush();
  expect(color()).toBe('#fe0000');
  expect(commits.at(-1)).toBe('#fe0000');
});

it('sets the color from the recent colors and the palettes', () => {
  button('Swatch palettes').click();
  flush();
  host.querySelector<HTMLButtonElement>('[aria-label="Recent"] [aria-label="#1f4a2c"]')!.click();
  flush();
  expect(color()).toBe('#1f4a2c');
  host.querySelector<HTMLButtonElement>('[aria-label="Basic Palette"] [aria-label="#f9c13f"]')!.click();
  flush();
  expect(commits).toEqual(['#1f4a2c', '#f9c13f']);
});

it('picks from the Lighting Orb and edits the selected chip', () => {
  button('Lighting Orb').click();
  flush();
  const orb = pressable('[aria-label^="Lighting Orb: drag"]', 172, 172);
  press(orb, [{ x: 86, y: 86 }]);
  expect(settings().orb.picker).toEqual({ x: 0, y: 0 });
  expect(commits).toEqual([orbColor(settings().orb, 0, 0)]);
  expect(color()).toBe(commits[0]);

  button('Shadow color').click();
  flush();
  expect(settings().orb.selected).toBe('shadow');
  const before = settings().orb.shadow;
  slider('Hue').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  flush();
  expect(Math.round(hexToHsv(settings().orb.shadow).h)).toBe(Math.round(hexToHsv(before).h) + 1);
  expect(settings().orb.light).toBe(defaultInfiniteColorSettings.orb.light);
});

const start = '#c8553d';

/** A point on the middle of the wheel's hue ring, in the 244 px wheel's coordinates. */
function huePoint(h: number) {
  const angle = (h * Math.PI) / 180;
  return { x: 122 + Math.cos(angle) * 109, y: 122 - Math.sin(angle) * 109 };
}

/** The element at `selector`, laid out at the origin at `width` × `height` and able to capture pointers. */
function pressable(selector: string, width: number, height: number) {
  const element = host.querySelector<HTMLElement>(selector)!;
  element.setPointerCapture = () => {};
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width, height });
  return element;
}

/** Presses at the first point, moves through the others and lifts at the last. */
function press(target: HTMLElement, points: { x: number; y: number }[]) {
  pointer(target, 'pointerdown', points[0]!);
  for (const point of points.slice(1)) {
    pointer(target, 'pointermove', point);
  }

  pointer(target, 'pointerup', points.at(-1)!);
}

function pointer(target: HTMLElement, type: string, { x, y }: { x: number; y: number }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.assign(event, { pointerId: 1, pointerType: 'pen' });
  target.dispatchEvent(event);
  flush();
}

function button(label: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

function slider(label: string) {
  return host.querySelector<HTMLElement>(`[role="slider"][aria-label="${label}"]`)!;
}
