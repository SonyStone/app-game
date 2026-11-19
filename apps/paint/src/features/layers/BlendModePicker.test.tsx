// @vitest-environment jsdom
import type { BlendMode } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BlendModePicker } from './BlendModePicker';

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('ResizeObserver', undefined);
  // jsdom has no popovers: opening one only has to succeed.
  HTMLElement.prototype.showPopover ??= function () {};
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('lists the modes as Settings rows, the current one selected, and chooses one by pen, keys and a press', () => {
  const [mode, setMode] = createSignal<BlendMode>('multiply');
  const change = vi.fn(setMode);
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <BlendModePicker mode={mode()} linear={false} onChange={change} />, host);
  flush();
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Layer blend mode"]')!;
  trigger.click();
  flush();

  const list = host.querySelector<HTMLElement>('[role="listbox"][aria-label="Layer blend modes"]')!;
  const options = [...list.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options.map((option) => [option.textContent, option.getAttribute('aria-selected')])).toEqual([
    ['Normal', 'false'],
    ['Multiply', 'true'],
    ['Screen', 'false'],
    ['Overlay', 'false']
  ]);
  // Each mode's circles fill its row's tile; what the mode does is its tooltip.
  expect(options.every((option) => option.querySelector('[data-picture] > canvas'))).toBe(true);
  expect(options[2]!.title).toBe('Screen: lightens, like projected light');

  const press = (key: string) =>
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  options[1]!.focus();
  press('ArrowDown');
  expect(document.activeElement).toBe(options[2]);
  press('End');
  expect(document.activeElement).toBe(options[3]);

  options[3]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'pen' }));
  flush();
  expect(options[3]!.hasAttribute('data-pressed')).toBe(true);
  options[3]!.click();
  flush();
  expect(change).toHaveBeenCalledWith('overlay');
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  // Choosing the current mode again only closes the list.
  trigger.click();
  flush();
  host.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')!.click();
  flush();
  expect(change).toHaveBeenCalledOnce();
});
