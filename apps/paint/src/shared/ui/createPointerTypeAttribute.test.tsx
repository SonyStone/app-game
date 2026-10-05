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

/** jsdom has no PointerEvent constructor, so a MouseEvent carries `pointerType`. */
function pointer(type: string, pointerType: string) {
  return Object.assign(new MouseEvent(type, { bubbles: true }), { pointerType });
}
