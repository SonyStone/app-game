// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createPointerTypeAttribute } from './createPointerTypeAttribute';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('marks the type of the pointer that last entered or pressed, even when a handler stops propagation', () => {
  const host = document.createElement('div');
  document.body.append(host);
  let editor!: HTMLDivElement;
  let button!: HTMLButtonElement;
  dispose = render(() => {
    const element = (
      <div>
        <button ref={button} onPointerDown={(event) => event.stopPropagation()} />
      </div>
    ) as HTMLDivElement;
    editor = element;
    createPointerTypeAttribute(() => element);
    return element;
  }, host);
  flush();

  button.dispatchEvent(pointer('pointerdown', 'touch'));
  expect(editor.dataset.pointer).toBe('touch');

  button.dispatchEvent(pointer('pointerover', 'pen'));
  expect(editor.dataset.pointer).toBe('pen');

  dispose();
  dispose = undefined;
  button.dispatchEvent(pointer('pointerdown', 'mouse'));
  expect(editor.dataset.pointer).toBe('pen');
});

it('marks hover stale from a pen or touch press until a pen or mouse hovers again', () => {
  const host = document.createElement('div');
  document.body.append(host);
  let editor!: HTMLDivElement;
  let button!: HTMLButtonElement;
  dispose = render(() => {
    const element = (
      <div>
        <button ref={button} />
      </div>
    ) as HTMLDivElement;
    editor = element;
    createPointerTypeAttribute(() => element);
    return element;
  }, host);
  flush();

  button.dispatchEvent(pointer('pointerdown', 'mouse', 1));
  expect(editor.dataset.hoverStale).toBeUndefined();

  button.dispatchEvent(pointer('pointerdown', 'pen', 1));
  button.dispatchEvent(pointer('pointermove', 'pen', 1));
  button.dispatchEvent(pointer('pointermove', 'touch', 0));
  expect(editor.dataset.hoverStale).toBe('');

  button.dispatchEvent(pointer('pointermove', 'pen', 0));
  expect(editor.dataset.hoverStale).toBeUndefined();
});

/** jsdom has no PointerEvent constructor, so a MouseEvent carries `pointerType`. */
function pointer(type: string, pointerType: string, buttons = 0) {
  return Object.assign(new MouseEvent(type, { bubbles: true, buttons }), { pointerType });
}
