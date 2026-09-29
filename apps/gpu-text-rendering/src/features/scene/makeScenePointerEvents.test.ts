import { makeEventListener } from '@solid-primitives/event-listener';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeScenePointerEvents } from './makeScenePointerEvents';
import type { ScenePointerHandlers } from './RenderLayer';

let canvas: HTMLCanvasElement;
let dispose: () => void;
let controls: ReturnType<typeof vi.fn<(event: PointerEvent) => void>>;

beforeEach(() => {
  canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => dispose());

it('offers a press to the topmost layer that hits it and hides the press from other canvas listeners', () => {
  const below = layer(() => true);
  const above = layer(() => true);
  const missed = layer(() => false);
  mount([below, above, missed]);

  canvas.dispatchEvent(pointer('pointerdown', 10, 20));

  expect(above.onPointerDown).toHaveBeenCalledWith(
    expect.objectContaining({ screen: { x: 10, y: 20 }, native: expect.any(PointerEvent) })
  );
  expect(below.onPointerDown).not.toHaveBeenCalled();
  expect(missed.onPointerDown).not.toHaveBeenCalled();
  expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
  expect(controls).not.toHaveBeenCalled();
});

it('routes captured moves and the release to the pressed layer even outside its shape', () => {
  let inside = true;
  const target = layer(() => inside);
  mount([target]);

  canvas.dispatchEvent(pointer('pointerdown', 1, 1));
  inside = false;
  canvas.dispatchEvent(pointer('pointermove', 50, 60));
  canvas.dispatchEvent(pointer('pointerup', 70, 80));
  canvas.dispatchEvent(pointer('pointermove', 90, 90));

  expect(target.onPointerMove).toHaveBeenCalledOnce();
  expect(target.onPointerMove).toHaveBeenCalledWith(expect.objectContaining({ screen: { x: 50, y: 60 } }));
  expect(target.onPointerUp).toHaveBeenCalledWith(expect.objectContaining({ screen: { x: 70, y: 80 } }));
  // Only the move after release reaches other listeners.
  expect(controls).toHaveBeenCalledOnce();
});

it('passes presses that no layer claims to other canvas listeners', () => {
  const withoutPress: ScenePointerHandlers = { hitTest: () => true, onPointerMove: vi.fn() };
  const target = layer(() => false);
  mount([withoutPress, target]);

  canvas.dispatchEvent(pointer('pointerdown', 1, 1));
  canvas.dispatchEvent(pointer('pointerdown', 1, 1, { pointerType: 'mouse', button: 2, pointerId: 2 }));
  canvas.dispatchEvent(pointer('pointermove', 2, 2));

  expect(controls).toHaveBeenCalledTimes(3);
  expect(withoutPress.onPointerMove).not.toHaveBeenCalled();
  expect(target.onPointerDown).not.toHaveBeenCalled();
});

it('ends a gesture on lost capture and releases captured pointers on disposal', () => {
  const lost = layer(() => true);
  mount([lost]);
  canvas.dispatchEvent(pointer('pointerdown', 1, 1));
  canvas.dispatchEvent(pointer('lostpointercapture', 1, 1));
  expect(lost.onPointerUp).toHaveBeenCalledOnce();

  canvas.dispatchEvent(pointer('pointerdown', 1, 1, { pointerId: 3 }));
  dispose();
  expect(canvas.releasePointerCapture).toHaveBeenCalledWith(3);

  canvas.dispatchEvent(pointer('pointerdown', 1, 1, { pointerId: 4 }));
  expect(lost.onPointerDown).toHaveBeenCalledTimes(2);
});

function mount(layers: ScenePointerHandlers[]) {
  dispose = createRoot((dispose) => {
    makeScenePointerEvents(
      canvas,
      () => layers,
      (event) => ({ x: event.clientX, y: event.clientY })
    );
    // Registered afterwards and without capture, like CameraControls.
    controls = vi.fn<(event: PointerEvent) => void>();
    makeEventListener(canvas, 'pointerdown', controls);
    makeEventListener(canvas, 'pointermove', controls);
    return dispose;
  });
}

function layer(hitTest: () => boolean) {
  return {
    hitTest,
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn()
  } satisfies ScenePointerHandlers;
}

function pointer(type: string, x: number, y: number, init: PointerEventInit = {}) {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', ...init });
}
