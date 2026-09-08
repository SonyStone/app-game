import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHorizontalRail } from '../src/createHorizontalRail';
import { createVerticalGesture } from '../src/createVerticalGesture';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('horizontal folder rail', () => {
  it('follows horizontal dragging, bounds the rail, and suppresses the resulting click', () => {
    const f = fixture();
    const click = vi.fn();
    f.button.addEventListener('click', click);
    f.pointer('pointerdown', 500, 50);
    f.pointer('pointermove', 300, 52);
    expect(f.rail.offset()).toBe(25);
    expect(f.rail.direct()).toBe(true);
    expect(f.captured.has(1)).toBe(true);
    f.pointer('pointermove', -5000, 52);
    expect(f.rail.offset()).toBe(132);
    f.pointer('pointercancel', -5000, 52);
    expect(f.rail.direct()).toBe(false);
    expect(f.captured.size).toBe(0);
    f.button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, cancelable: true }));
    expect(click).not.toHaveBeenCalled();
    f.button.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it.each(['mouse', 'touch'])('keeps a slow %s drag captured when it crosses the two axis thresholds', (pointerType) => {
    const f = fixture();
    f.pointer('pointerdown', 500, 50, f.button, pointerType);
    f.pointer('pointermove', 492, 51, f.button, pointerType);
    expect(f.captured.has(1)).toBe(true);
    expect(f.rail.offset()).toBe(1);
    // The rail has captured at 7px; the vertical recognizer rejects sideways intent at 10px.
    f.pointer('pointermove', 486, 52, f.button, pointerType);
    expect(f.captured.has(1)).toBe(true);
    for (const x of [470, 430, 390, 410, 450]) {
      f.pointer('pointermove', x, 52, f.button, pointerType);
      expect(f.captured.has(1)).toBe(true);
      expect(f.rail.direct()).toBe(true);
      expect(f.rail.offset()).toBeCloseTo((500 - x) / 8);
    }
    f.pointer('pointerup', 450, 52, f.button, pointerType);
    expect(f.captured.size).toBe(0);
    expect(f.rail.direct()).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
  });

  it('accepts touch swipes on card content while leaving vertical card wheel input alone', () => {
    const f = fixture(true);
    f.pointer('pointerdown', 500, 400, f.element, 'touch');
    f.pointer('pointermove', 300, 402, f.element, 'touch');
    expect(f.rail.offset()).toBe(25);
    expect(f.vertical.dragging()).toBe(false);
    f.pointer('pointercancel', 300, 402, f.element, 'touch');
    f.element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 160 }));
    flush();
    expect(f.rail.offset()).toBe(25);
    expect(f.commit).toHaveBeenCalled();
  });

  it('leaves vertical capture with the card gesture when dragging down from a tab', () => {
    const f = fixture();
    f.pointer('pointerdown', 500, 50);
    f.pointer('pointermove', 502, 200);
    expect(f.vertical.dragging()).toBe(true);
    expect(f.captured.has(1)).toBe(true);
    expect(f.rail.offset()).toBe(0);
    f.pointer('pointerup', 502, 200);
    expect(f.commit).toHaveBeenCalledWith({ direction: 'down', offset: 150 });
  });

  it('scrolls wheel input over tabs without navigating the deck and respects bounds', () => {
    const f = fixture();
    f.wheel(80, 0);
    expect(f.rail.offset()).toBe(10);
    f.wheel(0, 160);
    expect(f.rail.offset()).toBe(30);
    expect(f.commit).not.toHaveBeenCalled();
    f.wheel(10000, 0);
    expect(f.rail.offset()).toBe(132);
    f.wheel(-10000, 0);
    expect(f.rail.offset()).toBe(0);
    f.button.dispatchEvent(new WheelEvent('wheel', { deltaX: 80, ctrlKey: true, bubbles: true }));
    expect(f.rail.offset()).toBe(0);
  });

  it('reveals offscreen tabs with minimal scrolling and interrupts motion at its painted position', () => {
    const f = fixture();
    f.rail.reveal(59);
    flush();
    expect(f.rail.offset()).toBe(0);
    f.rail.reveal(199);
    flush();
    expect(f.rail.offset()).toBe(132);
    f.setPainted(50);
    f.pointer('pointerdown', 500, 50);
    expect(f.rail.offset()).toBe(50);
    f.pointer('pointermove', 420, 50);
    expect(f.rail.offset()).toBe(60);
    f.pointer('pointercancel', 420, 50);
    f.rail.reveal(3);
    flush();
    expect(f.rail.offset()).toBe(0);
  });

  it('releases capture and owned wheel timers when the target is removed', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.pointer('pointerdown', 500, 50);
    f.pointer('pointermove', 420, 50);
    expect(f.captured.size).toBe(1);
    f.setTarget(undefined);
    flush();
    expect(f.captured.size).toBe(0);
    f.wheel(80, 0);
    expect(f.rail.offset()).toBe(10);
    f.setTarget(f.element);
    flush();
    f.wheel(80, 0);
    expect(f.rail.offset()).toBe(20);
    f.dispose();
    flush();
    expect(vi.getTimerCount()).toBe(0);
    f.wheel(80, 0);
    expect(f.rail.offset()).toBe(20);
  });
});

function fixture(wholeCard = false) {
  const element = document.createElement('div');
  const button = document.createElement('button');
  element.append(button);
  document.body.append(element);
  const captured = new Set<number>();
  Object.defineProperties(element, {
    clientWidth: { value: 800 },
    clientHeight: { value: 868 },
    setPointerCapture: { value: (id: number) => captured.add(id) },
    releasePointerCapture: { value: (id: number) => captured.delete(id) },
    hasPointerCapture: { value: (id: number) => captured.has(id) }
  });
  const commit = vi.fn();
  let painted: number | undefined;
  const state = createRoot((dispose) => {
    disposers.push(dispose);
    const [target, setTarget] = createSignal<HTMLElement | undefined>(element);
    const vertical = createVerticalGesture(
      target,
      commit,
      () => true,
      (event) => event.target !== button
    );
    const rail = createHorizontalRail({
      target,
      enabled: () => true,
      max: () => 132,
      accepts: (node) => wholeCard || node === button,
      acceptsWheel: (node) => node === button,
      readPainted: () => painted ?? rail.offset()
    });
    return { rail, vertical, setTarget, dispose };
  });
  flush();
  return {
    ...state,
    element,
    button,
    captured,
    commit,
    setPainted: (value: number) => {
      painted = value;
    },
    pointer(type: string, x: number, y: number, target: HTMLElement = button, pointerType = 'mouse') {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType,
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y
        })
      );
      flush();
    },
    wheel(x: number, y: number) {
      button.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: x, deltaY: y }));
      flush();
    }
  };
}
