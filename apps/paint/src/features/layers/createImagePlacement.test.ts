// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createImagePlacement } from './createImagePlacement';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('places a pasted image named after its file, and leaves text pastes and text fields alone', () => {
  let canPlace = true;
  const { send } = setup(() => canPlace);
  const image = new File(['png'], 'Reference photo.png', { type: 'image/png' });

  expect(paste(window, [new File(['text'], 'notes.txt', { type: 'text/plain' })]).defaultPrevented).toBe(false);
  const input = document.body.appendChild(document.createElement('input'));
  paste(input, [image]);
  expect(send).not.toHaveBeenCalled();

  expect(paste(window, [image]).defaultPrevented).toBe(true);
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'edit',
    edit: 'place-image',
    command: { file: image, name: 'Reference photo', center: { x: 5, y: 6 }, fit: { width: 100, height: 80 } }
  });

  canPlace = false;
  expect(paste(window, [image]).defaultPrevented).toBe(false);
  expect(send).toHaveBeenCalledOnce();
});

function setup(canPlace: () => boolean) {
  const send = vi.fn();
  createRoot((stop) => {
    dispose = stop;
    createImagePlacement({
      canPlace,
      view: () => ({ center: { x: 5, y: 6 }, fit: { width: 100, height: 80 } }),
      send
    });
  });
  return { send };
}

/** Dispatches a paste of `files` at `target`; jsdom has no DataTransfer, so the clipboard data is a stand-in. */
function paste(target: EventTarget, files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files } });
  target.dispatchEvent(event);
  return event;
}
