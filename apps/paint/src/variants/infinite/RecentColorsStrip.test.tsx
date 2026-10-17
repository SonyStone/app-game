// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { RecentColorsStrip } from './RecentColorsStrip';

let host: HTMLDivElement;
let dispose: () => void;
let picks: string[];
let strip: HTMLElement;

beforeEach(() => {
  picks = [];
  host = document.body.appendChild(document.createElement('div'));
  dispose = render(
    () => (
      <RecentColorsStrip
        colors={['#c8553d', '#1f4a2c', '#e7e2cf']}
        height={100}
        onPick={(color) => picks.push(color)}
      />
    ),
    host
  );
  flush();
  strip = host.querySelector<HTMLElement>('[role="listbox"]')!;
  strip.setPointerCapture = () => {};
  strip.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 24, height: 100 });
});

afterEach(() => {
  dispose();
  host.remove();
});

it('shows ten segments, newest at the top, and picks a tapped one', () => {
  const options = host.querySelectorAll('[role="option"]');
  expect(options).toHaveLength(10);
  expect(options[0]!.getAttribute('aria-label')).toBe('#c8553d');
  expect(options[3]!.getAttribute('aria-label')).toBe('Empty');

  pointer('pointerdown', 15);
  pointer('pointerup', 15);
  expect(picks).toEqual(['#1f4a2c']);
});

it('previews the colors under a drag in a floating swatch and picks where it lifts', () => {
  pointer('pointerdown', 5);
  expect(previewed()).toBe('#c8553d');
  expect(preview()).not.toBeNull();

  pointer('pointermove', 25);
  expect(previewed()).toBe('#e7e2cf');
  // Below the last color the drag stays on it.
  pointer('pointermove', 90);
  expect(previewed()).toBe('#e7e2cf');
  pointer('pointermove', 12);
  pointer('pointerup', 12);
  expect(picks).toEqual(['#1f4a2c']);
  expect(previewed()).toBeUndefined();
  expect(preview()).toBeNull();
});

it('picks nothing when the press is cancelled', () => {
  pointer('pointerdown', 5);
  pointer('pointercancel', 5);
  expect(picks).toEqual([]);
  expect(preview()).toBeNull();
});

function previewed() {
  return host.querySelector('[role="option"][aria-selected="true"]')?.getAttribute('aria-label') ?? undefined;
}

function preview() {
  return host.querySelector('[aria-hidden="true"]');
}

function pointer(type: string, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 12, clientY: y, button: 0 });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  strip.dispatchEvent(event);
  flush();
}
