import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFreeDrag } from '../src/primitives/createFreeDrag';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('free pointer ownership', () => {
  it('publishes only the latest movement once per rendered frame', () => {
    const f = fixture();
    f.pointer('pointerdown', 10, 10, f.handle);
    for (let i = 1; i <= 20; i++) f.pointer('pointermove', 10 + i * 10, 10 + i * 5);
    expect(f.drag.position()).toEqual({ x: 0, y: 0 });
    expect(f.frames.size).toBe(1);
    f.advance();
    expect(f.drag.position()).toEqual({ x: 200, y: 100 });
    expect(f.frames.size).toBe(0);
    f.pointer('pointermove', 220, 120);
    f.advance();
    expect(f.drag.position()).toEqual({ x: 210, y: 110 });
  });

  it('finishes an unpainted drag at release coordinates and cancels its queued frame', () => {
    const f = fixture();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 80, 90);
    f.pointer('pointerup', 100, 110);
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ x: 90, y: 100, cancelled: false });
    expect(f.frames.size).toBe(0);
    f.advance();
    expect(f.drag.position()).toEqual({ x: 0, y: 0 });
    expect(f.drag.dragging()).toBe(false);
  });

  it('captures after leaving the original handle and keeps both coordinates live', () => {
    const f = fixture();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 12, 12, document.body);
    expect(f.start).not.toHaveBeenCalled();
    f.pointer('pointermove', 100, 12, document.body);
    expect(f.start).toHaveBeenCalledExactlyOnceWith(f.handle);
    f.pointer('pointermove', 80, 200, document.body);
    f.advance();
    expect(f.drag.position()).toEqual({ x: 70, y: 190 });
    expect(f.captured.has(1)).toBe(true);
    f.pointer('pointerup', 90, 210, document.body);
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ x: 80, y: 200, cancelled: false });
    expect(f.drag.dragging()).toBe(false);
    expect(f.captured.size).toBe(0);
  });

  it('ignores child capture transfer and unrelated pointers, but cancels owner capture loss once', () => {
    const f = fixture();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 40, 50);
    f.pointer('lostpointercapture', 40, 50, f.handle);
    f.pointer('pointercancel', 40, 50, f.element, 2);
    expect(f.finish).not.toHaveBeenCalled();
    f.pointer('lostpointercapture', 40, 50);
    f.pointer('pointerup', 40, 50);
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ x: 30, y: 40, cancelled: true });
  });

  it('suppresses the click after a drag and preserves taps and keyboard clicks', () => {
    const f = fixture();
    const clicked = vi.fn();
    f.handle.addEventListener('click', clicked);
    const click = (detail: number) =>
      f.handle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 80, 90);
    f.pointer('pointerup', 80, 90);
    click(1);
    expect(clicked).not.toHaveBeenCalled();
    click(0);
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointerup', 10, 10);
    click(1);
    expect(clicked).toHaveBeenCalledTimes(2);
  });

  it('cancels when its target is removed and releases all listeners on disposal', () => {
    const f = fixture();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 80, 90);
    f.setTarget(undefined);
    flush();
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ x: 70, y: 80, cancelled: true });
    expect(f.captured.size).toBe(0);
    expect(f.frames.size).toBe(0);
    f.setTarget(f.element);
    flush();
    f.dispose();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 80, 90);
    expect(f.start).toHaveBeenCalledTimes(1);
  });
});

function fixture() {
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  function advance() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
    flush();
  }
  const element = document.createElement('div');
  const handle = document.createElement('button');
  element.append(handle);
  document.body.append(element);
  const captured = new Set<number>();
  element.setPointerCapture = (id) => {
    captured.add(id);
  };
  element.hasPointerCapture = (id) => captured.has(id);
  element.releasePointerCapture = (id) => {
    captured.delete(id);
  };
  const [target, setTarget] = createSignal<HTMLElement | undefined>(element);
  const start = vi.fn();
  const finish = vi.fn();
  let dispose!: () => void;
  const drag = createRoot((cleanup) => {
    disposers.push(cleanup);
    dispose = cleanup;
    return createFreeDrag({ target, accepts: () => true, onStart: start, onFinish: finish });
  });
  flush();
  function pointer(type: string, x: number, y: number, destination: EventTarget = element, pointerId = 1) {
    destination.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
        pointerType: 'touch'
      })
    );
    flush();
  }
  return { element, handle, captured, drag, start, finish, pointer, setTarget, dispose, frames, advance };
}
