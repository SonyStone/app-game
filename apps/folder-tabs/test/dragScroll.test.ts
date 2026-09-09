import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import { createDragScroll } from '../src/createDragScroll';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((f) => f());
  document.body.replaceChildren();
});

describe('card content scrolling', () => {
  it('drags content within bounds and suppresses the control click after a drag', () => {
    const f = fixture();
    let clicks = 0;
    f.button.addEventListener('click', () => clicks++);
    f.pointer('pointerdown', 400);
    f.pointer('pointermove', 200);
    expect(f.element.scrollTop).toBe(200);
    f.pointer('pointermove', -600);
    expect(f.element.scrollTop).toBe(600);
    f.pointer('pointerup', -600);
    f.button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(clicks).toBe(0);
    expect(f.capture.size).toBe(0);
  });

  it('does not cancel native touch or wheel scrolling, and preserves taps', () => {
    const f = fixture();
    f.pointer('pointerdown', 400, 'touch');
    const move = f.pointer('pointermove', 100, 'touch');
    expect(move.defaultPrevented).toBe(false);
    expect(f.capture.size).toBe(0);
    expect(f.element.scrollTop).toBe(0);
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 200 });
    f.element.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    f.pointer('pointerdown', 400);
    f.pointer('pointerup', 402);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    f.button.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('ends capture on cancellation, disable, replacement, and disposal', () => {
    const f = fixture();
    f.pointer('pointerdown', 400);
    f.pointer('pointermove', 300);
    f.pointer('pointercancel', 300);
    expect(f.capture.size).toBe(0);
    f.pointer('pointerdown', 400);
    f.pointer('pointermove', 300);
    f.setEnabled(false);
    flush();
    expect(f.capture.size).toBe(0);
    const top = f.element.scrollTop;
    f.pointer('pointermove', 0);
    expect(f.element.scrollTop).toBe(top);
    f.setEnabled(true);
    flush();
    f.pointer('pointerdown', 400);
    f.pointer('pointermove', 300);
    f.setTarget(undefined);
    flush();
    expect(f.capture.size).toBe(0);
    f.setTarget(f.element);
    flush();
    f.pointer('pointerdown', 400);
    f.pointer('pointermove', 300);
    f.dispose();
    expect(f.capture.size).toBe(0);
  });
});

function fixture() {
  const element = document.createElement('div');
  const button = document.createElement('button');
  element.append(button);
  document.body.append(element);
  const capture = new Set<number>();
  Object.defineProperties(element, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 400 },
    setPointerCapture: { value: (id: number) => capture.add(id) },
    hasPointerCapture: { value: (id: number) => capture.has(id) },
    releasePointerCapture: { value: (id: number) => capture.delete(id) }
  });
  const state = createRoot((dispose) => {
    disposers.push(dispose);
    const [target, setTarget] = createSignal<HTMLElement | undefined>(element);
    const [enabled, setEnabled] = createSignal(true);
    createDragScroll(target, enabled);
    return { setTarget, setEnabled, dispose };
  });
  flush();
  return {
    ...state,
    element,
    button,
    capture,
    pointer(type: string, y: number, pointerType = 'mouse') {
      const e = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 40,
        clientY: y
      });
      button.dispatchEvent(e);
      flush();
      return e;
    }
  };
}
