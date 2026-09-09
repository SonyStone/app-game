import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFreeDrag } from '../src/createFreeDrag';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});

describe('free pointer ownership', () => {
  it('captures after leaving the original handle and keeps both coordinates live', () => {
    const f = fixture();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 12, 12, document.body);
    expect(f.start).not.toHaveBeenCalled();
    f.pointer('pointermove', 100, 12, document.body);
    expect(f.start).toHaveBeenCalledExactlyOnceWith(f.handle);
    f.pointer('pointermove', 80, 200, document.body);
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
    f.setTarget(f.element);
    flush();
    f.dispose();
    f.pointer('pointerdown', 10, 10, f.handle);
    f.pointer('pointermove', 80, 90);
    expect(f.start).toHaveBeenCalledTimes(1);
  });
});

function fixture() {
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
  return { element, handle, captured, drag, start, finish, pointer, setTarget, dispose };
}
