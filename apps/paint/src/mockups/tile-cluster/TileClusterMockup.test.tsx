// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultOptions } from './debugOptions';
import { TileClusterMockup } from './TileClusterMockup';

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  localStorage.clear();
  Element.prototype.setPointerCapture = () => {};
});
afterEach(() => {
  dispose?.();
  vi.unstubAllGlobals();
  dispose = undefined;
  document.body.replaceChildren();
});

it('keeps a toggled cluster open after a tap on a value button, and Escape then closes only the grid', () => {
  const { pointer, cluster, grid, button } = mount();
  pointer('pointerdown', 500, 400, { button: 2 });
  pointer('pointerup', 500, 400, { button: 2 });
  expect(cluster()).not.toBeNull();

  pointer('pointerdown', 300, 300, {}, button('Size'));
  pointer('pointerup', 300, 300, {}, button('Size'));
  expect(grid()).not.toBeNull();
  expect(cluster()).not.toBeNull();
  expect(hidden()).toBe(false);

  key('keydown', 'Escape');
  expect(grid()).toBeNull();
  expect(cluster()).not.toBeNull();
});

it('keeps a held cluster in place after a tap on a value button', () => {
  const { pointer, cluster, grid, button } = mount();
  pointer('pointermove', 500, 400);
  key('keydown', ' ', 'Space');
  const left = cluster()!.style.left;

  pointer('pointerdown', 300, 300, {}, button('Size'));
  pointer('pointerup', 300, 300, {}, button('Size'));
  expect(grid()).not.toBeNull();
  expect(cluster()!.style.left).toBe(left);
  expect(hidden()).toBe(false);
});

it('restores the value from before when releasing Space closes the cluster during a slide in a grid', () => {
  const { pointer, cluster, grid, button } = mount();
  pointer('pointermove', 500, 400);
  key('keydown', ' ', 'Space');
  const before = button('Opacity').textContent;

  pointer('pointerdown', 300, 300, {}, button('Opacity'));
  pointer('pointermove', 220, 300, {}, button('Opacity'));
  expect(grid()).not.toBeNull();
  expect(button('Opacity').textContent).not.toBe(before);

  key('keyup', ' ', 'Space');
  expect(cluster()).toBeNull();
  key('keydown', ' ', 'Space');
  expect(button('Opacity').textContent).toBe(before);
});

it('applies the option pointed at in a list while sliding, and restores the one from before when lifted off it', () => {
  const { pointer, button } = mount();
  pointer('pointermove', 500, 400);
  key('keydown', ' ', 'Space');
  expect(button('Mixing').textContent).toContain('Normal');

  pointer('pointerdown', 300, 300, {}, button('Mixing'));
  pointer('pointermove', 300, 332, {}, button('Mixing'));
  expect(button('Mixing').textContent).toContain('Clear');

  pointer('pointermove', 600, 332, {}, button('Mixing'));
  expect(button('Mixing').textContent).toContain('Normal');
  pointer('pointerup', 600, 332, {}, button('Mixing'));
  expect(button('Mixing').textContent).toContain('Normal');
});

it('acts only on the ring itself, not in the corners of its box beyond it', () => {
  const { pointer, cluster, sheet } = mount();
  pointer('pointerdown', 500, 400, { button: 2 });
  pointer('pointerup', 500, 400, { button: 2 });
  const ring = document.querySelector('[data-ring]')!;
  const view = sheet();
  const corner = defaultOptions.ringDead + defaultOptions.ringWidth - 4;

  pointer('pointerdown', 500 - corner, 400 + corner, {}, ring);
  pointer('pointermove', 400, 520, {}, ring);
  expect(sheet()).toBe(view);
  expect(hidden()).toBe(false);
  pointer('pointerup', 400, 520, {}, ring);
  expect(cluster()).not.toBeNull();

  // Pan, lower left, on the ring.
  pointer('pointerdown', 500 - 32, 400 + 32, {}, ring);
  pointer('pointermove', 400, 520, {}, ring);
  expect(sheet()).not.toBe(view);
  expect(hidden()).toBe(true);
});

/** Renders the mockup and returns helpers that send mouse events and find its parts. */
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <TileClusterMockup />, host);
  flush();
  /** Sends a mouse pointer event to `target`, the canvas by default, as pointer capture would to the pressed element. */
  const pointer = (
    type: string,
    x: number,
    y: number,
    init: { button?: number } = {},
    target: Element = document.querySelector('canvas')!
  ) => {
    const pressed = type === 'pointerdown' || type === 'pointermove';
    const event = new MouseEvent(type, {
      clientX: x,
      clientY: y,
      button: init.button ?? 0,
      buttons: pressed ? (init.button === 2 ? 2 : 1) : 0,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    target.dispatchEvent(event);
    flush();
  };
  const cluster = () => document.querySelector<HTMLElement>('[data-cluster-ui][style*="--nav"]');
  const grid = () => document.querySelector('[role="dialog"]');
  const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const sheet = () => document.querySelector<HTMLElement>('canvas')!.parentElement!.style.transform;
  return { pointer, cluster, grid, button, sheet };
}

/** Whether the open cluster hides, as during a continuous action. */
function hidden() {
  return document.querySelector('[data-cluster-ui][style*="--nav"]')!.className.includes('hidden');
}

function key(type: 'keydown' | 'keyup', key: string, code = key) {
  document.body.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
  flush();
}
