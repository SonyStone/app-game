// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultBrush } from './brush';
import { defaultCamera } from './camera';
import { attachInput } from './input';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])('shares one fresh rect across real, coalesced and predicted samples, raw=%s', (raw) => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: raw });
  Object.defineProperty(window, 'onpointerrawupdate', { configurable: true, value: null });
  const canvas = document.body.appendChild(document.createElement('canvas'));
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = () => false;
  const rect = vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 800, 600));
  const send = vi.fn();
  const cursor = vi.fn();
  createRoot((dispose) => {
    disposers.push(
      dispose,
      attachInput(canvas, {
        camera: defaultCamera,
        size: () => ({ width: 800, height: 600 }),
        brush: defaultBrush,
        ready: () => true,
        navigate: () => {},
        send,
        cursor,
        showPenCursor: () => true,
        predict: () => true,
        strokeHold: { delay: () => 10000, hold: () => {} }
      })
    );
  });
  let time = 1;
  const event = (type: string, x: number) => {
    const event = new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'pen',
      clientX: x,
      clientY: 330,
      buttons: 1,
      button: 0,
      pressure: 0.5
    });
    Object.defineProperty(event, 'timeStamp', { value: time++ });
    return event;
  };
  canvas.dispatchEvent(event('pointerdown', 410));
  expect(rect).toHaveBeenCalledOnce();
  rect.mockClear();
  send.mockClear();

  const coalesced = [event('pointermove', 420), event('pointermove', 430)];
  const predicted = [event('pointermove', 440)];
  const move = event(raw ? 'pointerrawupdate' : 'pointermove', 430);
  Object.defineProperty(move, 'getCoalescedEvents', { value: () => coalesced });
  Object.defineProperty(move, 'getPredictedEvents', { value: () => predicted });
  canvas.dispatchEvent(move);
  expect(rect).toHaveBeenCalledOnce();
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'samples',
      samples: [expect.objectContaining({ x: 10, y: 10 }), expect.objectContaining({ x: 20, y: 10 })]
    })
  );
  expect(cursor).toHaveBeenLastCalledWith({ x: 420, y: 310 });
  if (raw) {
    rect.mockClear();
    const prediction = event('pointermove', 430);
    Object.defineProperty(prediction, 'getPredictedEvents', { value: () => predicted });
    canvas.dispatchEvent(prediction);
    expect(rect).toHaveBeenCalledOnce();
  }
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ predicted: [expect.objectContaining({ x: 30, y: 10 })] })
  );

  // Layout changes between events must take effect immediately.
  rect.mockReturnValue(new DOMRect(20, 30, 800, 600));
  rect.mockClear();
  canvas.dispatchEvent(event('pointerup', 450));
  expect(rect).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'samples', samples: [expect.objectContaining({ x: 30, y: 0, pressure: 0.5 })] })
  );
  expect(cursor).toHaveBeenLastCalledWith({ x: 430, y: 300 });
});
