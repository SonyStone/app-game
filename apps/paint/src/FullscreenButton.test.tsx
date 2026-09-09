import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FullscreenButton } from './FullscreenButton';

let dispose: (() => void) | undefined;
let fullscreenElement: Element | null = null;
const properties = ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen'] as const;
const original = new Map(properties.map((key) => [key, Object.getOwnPropertyDescriptor(document, key)]));
beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: { configurable: true, value: vi.fn(async () => change(null)) }
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  for (const key of properties) {
    const descriptor = original.get(key);
    if (descriptor) Object.defineProperty(document, key, descriptor);
    else Reflect.deleteProperty(document, key);
  }
});

it('enters the editor synchronously and follows external Escape and button exits', async () => {
  const { editor, button, request } = mount();
  button.click();
  expect(request).toHaveBeenCalledOnce();
  expect(fullscreenElement).toBe(editor);
  await settled();
  expect(button.getAttribute('aria-label')).toBe('Exit full screen');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  change(null); // The browser handles Escape; the component observes fullscreenchange.
  flush();
  expect(button.getAttribute('aria-pressed')).toBe('false');
  button.click();
  await settled();
  button.click();
  expect(document.exitFullscreen).toHaveBeenCalledOnce();
  await settled();
  expect(button.getAttribute('aria-label')).toBe('Enter full screen');
});

it('disables unsupported fullscreen without making a request', () => {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
  const { button, request } = mount();
  expect(button.disabled).toBe(true);
  button.click();
  expect(request).not.toHaveBeenCalled();
});

it('reports refused requests and allows a retry', async () => {
  const { button, request, onError } = mount();
  request.mockRejectedValueOnce(new Error('Fullscreen denied'));
  button.click();
  await settled();
  expect(onError).toHaveBeenCalledWith('Fullscreen denied');
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  button.click();
  await settled();
  expect(button.getAttribute('aria-pressed')).toBe('true');
});

it('guards double clicks before Solid settles and ignores late failure after disposal', async () => {
  const { button, request, onError } = mount();
  let reject!: (error: Error) => void;
  request.mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  button.click();
  button.click();
  expect(request).toHaveBeenCalledOnce();
  dispose?.();
  dispose = undefined;
  reject(new Error('Element detached'));
  await settled();
  expect(onError).not.toHaveBeenCalled();
});

function mount() {
  const editor = document.createElement('div');
  document.body.append(editor);
  const request = vi.fn(async () => change(editor));
  editor.requestFullscreen = request;
  const onError = vi.fn();
  dispose = render(() => <FullscreenButton target={() => editor} onError={onError} />, editor);
  flush();
  return { editor, button: editor.querySelector('button')!, request, onError };
}

function change(element: Element | null) {
  fullscreenElement = element;
  document.dispatchEvent(new Event('fullscreenchange'));
}

async function settled() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
}
