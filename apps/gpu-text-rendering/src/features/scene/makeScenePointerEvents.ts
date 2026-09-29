import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';
import type { Point } from '../camera/camera';
import type { ScenePointerEvent, ScenePointerHandlers } from './RenderLayer';

/**
 * Dispatches canvas pointer events to scene layers; disposed with its Solid owner.
 * `layers` returns visible layers in draw order, so the last one is on top. Listeners run in the capture phase,
 * so a claimed press and its captured moves stop before other canvas listeners such as camera controls.
 */
export function makeScenePointerEvents(
  canvas: HTMLCanvasElement,
  layers: () => readonly ScenePointerHandlers[],
  toScreen: (event: PointerEvent) => Point
) {
  const captured = new Map<number, ScenePointerHandlers>();
  const scene = (native: PointerEvent): ScenePointerEvent => ({ screen: toScreen(native), native });

  makeEventListener(
    canvas,
    'pointerdown',
    (native) => {
      if (native.pointerType === 'mouse' && native.button !== 0) {
        return;
      }

      const event = scene(native);
      const target = layers().findLast((layer) => layer.onPointerDown && layer.hitTest?.(event.screen));

      if (!target) {
        return;
      }

      native.stopImmediatePropagation();
      native.preventDefault();
      captured.set(native.pointerId, target);
      canvas.setPointerCapture(native.pointerId);
      target.onPointerDown!(event);
    },
    { capture: true }
  );

  makeEventListener(
    canvas,
    'pointermove',
    (native) => {
      const target = captured.get(native.pointerId);

      if (target) {
        native.stopImmediatePropagation();
        target.onPointerMove?.(scene(native));
      }
    },
    { capture: true }
  );

  for (const type of ['pointerup', 'pointercancel'] as const) {
    makeEventListener(canvas, type, (native) => release(native, true), { capture: true });
  }

  makeEventListener(canvas, 'lostpointercapture', (native) => release(native, false), { capture: true });

  onCleanup(() => {
    for (const pointer of captured.keys()) {
      if (canvas.hasPointerCapture(pointer)) {
        canvas.releasePointerCapture(pointer);
      }
    }

    captured.clear();
  });

  /** Ends a captured gesture once; lost capture without a release still notifies the layer. */
  function release(native: PointerEvent, stop: boolean) {
    const target = captured.get(native.pointerId);

    if (!target) {
      return;
    }

    captured.delete(native.pointerId);

    if (stop) {
      native.stopImmediatePropagation();
    }

    target.onPointerUp?.(scene(native));
  }
}
