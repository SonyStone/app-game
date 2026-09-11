import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMotionViewport } from '../src/debug/createMotionViewport';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('motion canvas navigation', () => {
  it('anchors wheel zoom at the pointer, clamps scale and resets the view', () => {
    const { element, viewport } = setup();
    const event = new WheelEvent('wheel', { clientX: 500, clientY: 250, deltaY: -200, cancelable: true });
    element.dispatchEvent(event);
    flush();
    const camera = viewport.camera();
    // (500,250) is 200 px right of center. Its world coordinate stays under the cursor.
    expect((200 - camera.x) / camera.zoom).toBeCloseTo(200);
    expect(camera.y).toBe(0);
    expect(event.defaultPrevented).toBe(true);
    viewport.zoom(1000);
    flush();
    expect(viewport.camera().zoom).toBe(16);
    viewport.zoom(.0001);
    flush();
    expect(viewport.camera().zoom).toBe(.25);
    viewport.reset();
    flush();
    expect(viewport.camera()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('pans captured pointers, handles capture transfer, pinch and return to one finger without jumping', () => {
    const { element, viewport } = setup();
    const child = document.createElement('div');
    element.append(child);
    pointer(child, 'pointerdown', 1, 200, 200);
    pointer(child, 'lostpointercapture', 1, 200, 200);
    pointer(element, 'pointermove', 1, 220, 230);
    flush();
    expect(viewport.camera()).toEqual({ x: 20, y: 30, zoom: 1 });
    pointer(element, 'pointerdown', 2, 320, 230);
    pointer(element, 'pointermove', 2, 420, 230);
    flush();
    expect(viewport.camera().zoom).toBeCloseTo(2);
    pointer(element, 'pointerup', 2, 420, 230);
    const before = viewport.camera();
    pointer(element, 'pointermove', 1, 230, 245);
    flush();
    expect(viewport.camera().x).toBeCloseTo(before.x + 10);
    expect(viewport.camera().y).toBeCloseTo(before.y + 15);
    expect(viewport.camera().zoom).toBe(before.zoom);
    pointer(element, 'pointercancel', 1, 230, 245);
    flush();
    expect(viewport.dragging()).toBe(false);
    const final = viewport.camera();
    pointer(element, 'pointermove', 1, 400, 400);
    flush();
    expect(viewport.camera()).toBe(final);
  });

  it('detaches replaced targets and releases capture on disposal', () => {
    const { element, viewport, setTarget } = setup();
    pointer(element, 'pointerdown', 1, 200, 200);
    flush();
    setTarget(undefined);
    flush();
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(viewport.dragging()).toBe(false);
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    flush();
    expect(viewport.camera().zoom).toBe(1);
    setTarget(element);
    flush();
    pointer(element, 'pointerdown', 2, 200, 200);
    disposers.pop()!();
    expect(element.releasePointerCapture).toHaveBeenCalledWith(2);
  });
});

function setup() {
  const element = document.createElement('div');
  document.body.append(element);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 400, 400));
  const captured = new Set<number>();
  element.setPointerCapture = vi.fn(id => { captured.add(id); });
  element.hasPointerCapture = id => captured.has(id);
  element.releasePointerCapture = vi.fn(id => { captured.delete(id); });
  const result = createRoot(dispose => {
    disposers.push(dispose);
    const [target, setTarget] = createSignal<HTMLElement | undefined>(element);
    return { element, setTarget, viewport: createMotionViewport(target, () => ({ width: 400, height: 400 })) };
  });
  flush();
  return result;
}

function pointer(element: HTMLElement, type: string, id: number, x: number, y: number) {
  element.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: id, pointerType: 'touch' }));
}
