import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCameraControls } from './makeCameraControls';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function setup() {
  const canvas = document.createElement('canvas');
  const captures = new Set<number>();
  canvas.setPointerCapture = (id) => {
    captures.add(id);
  };
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = (id) => {
    captures.delete(id);
  };
  const viewport = {
    size: () => ({ css: { width: 800, height: 600 } }),
    clientToScreen: (point: { x: number; y: number }) => ({ x: point.x - 100, y: point.y - 50 })
  } as Parameters<typeof makeCameraControls>[0]['viewport'];
  const changed = vi.fn();
  const dragging = vi.fn();
  let dispose = () => {};
  const camera = createRoot((cleanup) => {
    dispose = cleanup;
    const [camera, setCamera] = createSignal({ x: 0.5, y: 0.5, zoom: 2, rotation: 0 });
    makeCameraControls({
      canvas,
      camera: { setCamera, pageAspect: () => 1 },
      viewport,
      onInteraction: changed,
      onDraggingChange: dragging
    });
    return camera;
  });
  cleanups.push(dispose);
  const pointer = (type: string, id: number, x: number, y: number) => {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x + 100, clientY: y + 50, button: 0 })
    );
    flush();
  };
  return { canvas, camera, changed, dragging, captures, pointer, dispose };
}

describe('pointer camera controls', () => {
  it('pans, pinches and rotates, then continues with one finger without a jump', () => {
    const { pointer, camera } = setup();
    pointer('pointerdown', 1, 200, 300);
    pointer('pointermove', 1, 230, 300);
    expect(camera().x).toBeCloseTo(0.3);
    pointer('pointerdown', 2, 430, 300);
    pointer('pointermove', 2, 430, 500);
    expect(camera().zoom).toBeCloseTo(Math.SQRT2);
    expect(camera().rotation).toBeCloseTo(-Math.PI / 4);
    pointer('pointerup', 2, 430, 500);
    const before = camera();
    pointer('pointermove', 1, 230, 300);
    expect(camera()).toEqual(before);
    pointer('pointermove', 1, 250, 300);
    expect(camera().x).not.toBe(before.x);
  });

  it('accumulates moves that arrive before Solid applies the previous write', () => {
    const { canvas, camera } = setup();
    const move = (type: string, x: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { pointerId: 1, pointerType: 'touch', clientX: x + 100, clientY: 350, button: 0 })
      );
    move('pointerdown', 200);
    move('pointermove', 215);
    move('pointermove', 230);
    flush();
    expect(camera().x).toBeCloseTo(0.3);
  });

  it.each(['pointercancel', 'lostpointercapture'])('stops manipulation after %s', (type) => {
    const { pointer, camera, captures } = setup();
    pointer('pointerdown', 1, 200, 200);
    pointer(type, 1, 200, 200);
    const before = camera();
    pointer('pointermove', 1, 400, 400);
    expect(camera()).toBe(before);
    expect(captures.size).toBe(0);
  });

  it('prevents wheel scrolling and removes listeners, captures and dragging state on disposal', () => {
    const { canvas, pointer, camera, dispose, captures, changed, dragging } = setup();
    const wheel = () => new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, cancelable: true });
    const event = wheel();
    canvas.dispatchEvent(event);
    flush();
    expect(event.defaultPrevented).toBe(true);
    expect(camera().zoom).toBeLessThan(2);
    expect(changed).toHaveBeenCalledOnce();
    pointer('pointerdown', 1, 200, 200);
    expect(dragging).toHaveBeenLastCalledWith(true);
    dispose();
    expect(captures.size).toBe(0);
    expect(dragging).toHaveBeenLastCalledWith(false);
    const calls = changed.mock.calls.length;
    canvas.dispatchEvent(wheel());
    pointer('pointermove', 1, 400, 400);
    expect(changed).toHaveBeenCalledTimes(calls);
  });
});
