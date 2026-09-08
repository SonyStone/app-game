import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVerticalGesture } from '../src/createVerticalGesture';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('folder gestures', () => {
  it('tracks the pointer and commits down with its release displacement', () => {
    const f = fixture();
    f.pointer('pointerdown', 50, 50);
    f.pointer('pointermove', 52, 170);
    expect(f.gesture.offset()).toBe(120);
    expect(f.captured.has(1)).toBe(true);
    f.pointer('pointerup', 52, 170);
    expect(f.commit).toHaveBeenCalledExactlyOnceWith({ direction: 'down', offset: 120 });
    expect(f.gesture.offset()).toBe(0);
    expect(f.captured.size).toBe(0);
  });

  it('commits up and keeps horizontal or short drags from navigating', () => {
    const f = fixture();
    f.pointer('pointerdown', 50, 200);
    f.pointer('pointermove', 50, 80);
    f.pointer('pointerup', 50, 80);
    expect(f.commit).toHaveBeenCalledWith({ direction: 'up', offset: -120 });
    f.commit.mockClear();
    f.pointer('pointerdown', 50, 50);
    f.pointer('pointermove', 180, 60);
    f.pointer('pointerup', 180, 60);
    f.pointer('pointerdown', 50, 50);
    f.pointer('pointermove', 50, 60);
    f.pointer('pointerup', 50, 60);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.gesture.offset()).toBe(0);
  });

  it('cancels without committing and ignores unrelated pointer events', () => {
    const f = fixture();
    f.pointer('pointerdown', 50, 50);
    f.pointer('pointermove', 50, 160);
    f.pointer('pointermove', 50, 400, 2);
    f.pointer('pointercancel', 50, 400, 2);
    expect(f.gesture.offset()).toBe(110);
    f.pointer('pointercancel', 50, 160);
    f.pointer('pointerup', 50, 160);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.gesture.dragging()).toBe(false);
  });

  it('suppresses the synthetic click after dragging but preserves keyboard activation', () => {
    const f = fixture();
    const click = vi.fn();
    f.element.addEventListener('click', click);
    f.pointer('pointerdown', 50, 50);
    f.pointer('pointermove', 50, 170);
    f.pointer('pointerup', 50, 170);
    f.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, cancelable: true }));
    expect(click).not.toHaveBeenCalled();
    f.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(click).toHaveBeenCalledOnce();
  });

  it('groups wheel momentum into one step, then permits a reversed gesture', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.wheel(45);
    f.wheel(45);
    f.wheel(90);
    f.wheel(80);
    expect(f.commit).toHaveBeenCalledExactlyOnceWith({ direction: 'up', offset: -90 });
    vi.advanceTimersByTime(200);
    f.wheel(-90);
    expect(f.commit).toHaveBeenLastCalledWith({ direction: 'down', offset: 90 });
    expect(f.commit).toHaveBeenCalledTimes(2);
  });

  it('leaves search input and zoom gestures alone', () => {
    const f = fixture();
    const input = document.createElement('input');
    f.element.append(input);
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }));
    f.pointer('pointermove', 0, 200);
    f.pointer('pointerup', 0, 200);
    const zoom = new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, cancelable: true });
    f.element.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
  });

  it('releases capture and detaches listeners on target replacement and disposal', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.pointer('pointerdown', 50, 50);
    f.pointer('pointermove', 50, 170);
    f.setTarget(undefined);
    flush();
    expect(f.captured.size).toBe(0);
    expect(f.gesture.offset()).toBe(0);
    f.wheel(150);
    expect(f.commit).not.toHaveBeenCalled();
    f.setTarget(f.element);
    flush();
    f.wheel(20);
    f.dispose();
    vi.advanceTimersByTime(500);
    f.wheel(150);
    expect(f.commit).not.toHaveBeenCalled();
  });
});

function fixture() {
  const element = document.createElement('div');
  document.body.append(element);
  const captured = new Set<number>();
  Object.defineProperties(element, {
    clientHeight: { value: 600 },
    setPointerCapture: { value: (id: number) => captured.add(id) },
    releasePointerCapture: { value: (id: number) => captured.delete(id) },
    hasPointerCapture: { value: (id: number) => captured.has(id) }
  });
  const [target, setTarget] = createSignal<HTMLElement | undefined>(element);
  const commit = vi.fn();
  let dispose = () => {};
  const gesture = createRoot((cleanup) => {
    dispose = cleanup;
    return createVerticalGesture(target, commit);
  });
  disposers.push(dispose);
  flush();
  return {
    element,
    captured,
    commit,
    gesture,
    setTarget,
    dispose,
    pointer(type: string, x: number, y: number, id = 1) {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          isPrimary: id === 1,
          button: 0,
          clientX: x,
          clientY: y
        })
      );
      flush();
    },
    wheel(deltaY: number) {
      element.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true }));
      flush();
    }
  };
}
