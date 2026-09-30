// @vitest-environment jsdom
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
  const [adaptiveQuality, setAdaptiveQuality] = createSignal(false);
  const [liveTail, setLiveTail] = createSignal(true);
  const [showPenCursor, setShowPenCursor] = createSignal(false);
  const [rawReceived, setRawReceived] = createSignal(false);
  const [performanceMonitor, setPerformanceMonitor] = createSignal(false);
  const close = vi.fn();
  const onWorkerEnabledChange = vi.fn();
  const settings = {
    debug,
    setDebug,
    adaptiveQuality,
    setAdaptiveQuality,
    liveTail,
    setLiveTail,
    showPenCursor,
    setShowPenCursor,
    performanceMonitor,
    setPerformanceMonitor,
    rawReceived,
    markRawReceived: () => setRawReceived(true)
  };
  dispose = render(
    () => (
      <DeveloperDialog
        settings={settings}
        ready
        workerEnabled
        switching={false}
        metrics={{ gpu: 1048576, ms: 1.2 }}
        onWorkerEnabledChange={onWorkerEnabledChange}
        close={close}
      />
    ),
    document.body
  );
  flush();
  const dialog = document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain(supported ? 'Available · waiting for pen' : 'Unavailable · using pointermove');
  setRawReceived(true);
  flush();
  expect(dialog.textContent).toContain(supported ? 'Receiving pen events' : 'Unavailable · using pointermove');
  const [wireframe, tail, cursor, worker, quality, monitor] = [...dialog.querySelectorAll('input')];
  wireframe!.click();
  tail!.click();
  cursor!.click();
  worker!.click();
  quality!.click();
  monitor!.click();
  flush();
  expect(adaptiveQuality()).toBe(true);
  expect(onWorkerEnabledChange).toHaveBeenCalledWith(false);
  expect(dialog.textContent).toContain('Undo history and the selection clipboard reset');
  flush();
  expect(debug()).toBe(true);
  expect(liveTail()).toBe(false);
  expect(showPenCursor()).toBe(true);
  expect(performanceMonitor()).toBe(true);
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
});
