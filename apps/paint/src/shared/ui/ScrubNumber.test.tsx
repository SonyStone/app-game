// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { ScrubNumber } from './ScrubNumber';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('drags sideways to change the value, in finer steps farther from the field, and commits once', () => {
  const { input, changes, inputs, pointer } = mount({ min: 0, max: 240 });
  pointer('pointerdown', 100, 0);
  pointer('pointermove', 102, 0);
  expect(inputs).toEqual([]);
  // 240 px cross the range, so 60 px move it by 60.
  pointer('pointermove', 160, 0);
  expect(inputs.at(-1)).toBe(110);
  expect(input().value).toBe('110');
  // 120 px below the field (jsdom gives it no height), a movement counts for a third.
  pointer('pointermove', 220, 120);
  expect(inputs.at(-1)).toBe(130);
  pointer('pointerup', 220, 120);
  expect(changes).toEqual([130]);
  expect(document.activeElement).not.toBe(input());
});

it('edits with the keyboard after a tap, steps with the arrows, and keeps the value for an entry that is not a number', () => {
  const { input, changes, pointer } = mount({ min: 0, max: 100 });
  pointer('pointerdown', 10, 0);
  pointer('pointerup', 11, 0);
  expect(document.activeElement).toBe(input());
  input().value = 'abc';
  input().dispatchEvent(new Event('change', { bubbles: true }));
  expect(changes).toEqual([]);
  expect(input().value).toBe('50');
  input().value = '72,4';
  input().dispatchEvent(new Event('change', { bubbles: true }));
  expect(changes).toEqual([72]);
  flush();
  input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
  expect(changes.at(-1)).toBe(82);
});

it('wraps angles past their bounds and doubles a logarithmic value every 50 px', () => {
  const angle = mount({ min: -180, max: 180, wrap: true, value: 170 });
  angle.input().value = '270';
  angle.input().dispatchEvent(new Event('change', { bubbles: true }));
  expect(angle.changes).toEqual([-90]);
  dispose?.();

  const radius = mount({ min: 0.5, max: 250, step: 0.5, scale: 'log', value: 8 });
  radius.pointer('pointerdown', 0, 0);
  radius.pointer('pointermove', 50, 0);
  radius.pointer('pointerup', 50, 0);
  expect(radius.changes).toEqual([16]);
});

function mount(options: Partial<Parameters<typeof ScrubNumber>[0]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const changes: number[] = [];
  const inputs: number[] = [];
  dispose = render(() => {
    const [value, setValue] = createSignal(options.value ?? 50);
    return (
      <ScrubNumber
        label="Amount"
        {...options}
        value={value()}
        onInput={(next) => inputs.push(next)}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    );
  }, host);
  flush();
  const input = () => host.querySelector<HTMLInputElement>('input')!;
  input().setPointerCapture = vi.fn();
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: 'pen' });
    input().dispatchEvent(event);
    flush();
  };
  return { input, changes, inputs, pointer };
}
