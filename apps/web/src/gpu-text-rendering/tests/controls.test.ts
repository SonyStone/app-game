import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCameraControls } from '../makeCameraControls';

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
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 }) as DOMRect;
  const camera = { x: 0.5, y: 0.5, zoom: 2, rotation: 0 };
  const changed = vi.fn();
  let dispose = () => {};
  createRoot((cleanup) => {
    dispose = cleanup;
    makeCameraControls(canvas, camera, () => 1, changed);
  });
  cleanups.push(dispose);
  const pointer = (type: string, id: number, x: number, y: number) => {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x + 100, clientY: y + 50, button: 0 })
    );
  };
  return { canvas, camera, changed, captures, pointer, dispose };
}

describe('pointer camera controls', () => {
  it('pans, pinches and rotates, then continues with one finger without a jump', () => {
    const { pointer, camera } = setup();
    pointer('pointerdown', 1, 200, 300);
    pointer('pointermove', 1, 230, 300);
    expect(camera.x).toBeCloseTo(0.3);
    pointer('pointerdown', 2, 430, 300);
    pointer('pointermove', 2, 430, 500);
    expect(camera.zoom).toBeCloseTo(Math.SQRT2);
    expect(camera.rotation).toBeCloseTo(-Math.PI / 4);
    pointer('pointerup', 2, 430, 500);
    const before = { ...camera };
    pointer('pointermove', 1, 230, 300);
    expect(camera).toEqual(before);
    pointer('pointermove', 1, 250, 300);
    expect(camera.x).not.toBe(before.x);
  });

  it.each(['pointercancel', 'lostpointercapture'])('stops manipulation after %s', (type) => {
    const { pointer, camera, captures } = setup();
    pointer('pointerdown', 1, 200, 200);
    pointer(type, 1, 200, 200);
    const before = { ...camera };
    pointer('pointermove', 1, 400, 400);
    expect(camera).toEqual(before);
    expect(captures.size).toBe(0);
  });

  it('prevents wheel scrolling and removes listeners and captures on disposal', () => {
    const { canvas, pointer, camera, dispose, captures, changed } = setup();
    const wheel = () => new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, cancelable: true });
    const event = wheel();
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(camera.zoom).toBeLessThan(2);
    pointer('pointerdown', 1, 200, 200);
    dispose();
    expect(captures.size).toBe(0);
    const calls = changed.mock.calls.length;
    canvas.dispatchEvent(wheel());
    pointer('pointermove', 1, 400, 400);
    expect(changed).toHaveBeenCalledTimes(calls);
  });
});
