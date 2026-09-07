import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { DeveloperDialog } from './DeveloperDialog';

let dispose: (() => void) | undefined;
const original = new Map(
  ['showModal', 'close'].map((key) => [key, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key)])
);
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});

it.each([true, false])('shows raw support (%s), switches controls and handles Escape', (supported) => {
  vi.stubGlobal('isSecureContext', supported);
  vi.stubGlobal('onpointerrawupdate', null);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      }
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      }
    }
  });
  const [debug, setDebug] = createSignal(false);
  const [liveTail, setLiveTail] = createSignal(true);
  const [showPenCursor, setShowPenCursor] = createSignal(false);
  const [rawReceived, setRawReceived] = createSignal(false);
  const [ready] = createSignal(true);
  const [workerEnabled] = createSignal(true);
  const [switchingRenderer] = createSignal(false);
  const [metrics] = createSignal({ gpu: 1048576, tiles: 1, ms: 1.2 });
  const close = vi.fn();
  const session = {
    debug,
    liveTail,
    setLiveTail,
    showPenCursor,
    setShowPenCursor,
    rawReceived,
    ready,
    toggleDebug: () => setDebug(!debug()),
    metrics,
    workerEnabled,
    switchingRenderer,
    setWorkerEnabled: vi.fn()
  };
  dispose = render(() => <DeveloperDialog session={session} close={close} />, document.body);
  flush();
  const dialog = document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain(supported ? 'Available · waiting for pen' : 'Unavailable · using pointermove');
  setRawReceived(true);
  flush();
  expect(dialog.textContent).toContain(supported ? 'Receiving pen events' : 'Unavailable · using pointermove');
  const [wireframe, tail, cursor, worker] = [...dialog.querySelectorAll('input')];
  wireframe!.click();
  tail!.click();
  cursor!.click();
  worker!.click();
  expect(session.setWorkerEnabled).toHaveBeenCalledWith(false);
  expect(dialog.textContent).toContain('Undo history and the selection clipboard reset');
  flush();
  expect(debug()).toBe(true);
  expect(liveTail()).toBe(false);
  expect(showPenCursor()).toBe(true);
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
});
