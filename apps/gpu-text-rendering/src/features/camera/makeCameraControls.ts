import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';
import { moveCamera, type Camera, type Point } from './camera';

/**
 * Installs captured pointer gestures and wheel zoom for a fixed canvas; disposed with its Solid owner.
 * Interaction starts before camera mutation; changes follow it. Drag state resets on release, blur or disposal.
 */
export function makeCameraControls(
  canvas: HTMLCanvasElement,
  camera: Camera,
  pageAspect: () => number,
  onInteraction: (phase: 'start' | 'change') => void,
  onDraggingChange: (dragging: boolean) => void = () => {},
  viewport?: {
    size: () => { css: { width: number; height: number } };
    clientToScreen: (point: Point) => Point;
  }
) {
  const pointers = new Map<number, Point>();

  const local = (event: PointerEvent | WheelEvent): Point => {
    if (viewport) {
      return viewport.clientToScreen({ x: event.clientX, y: event.clientY });
    }

    const rect = canvas.getBoundingClientRect();

    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const apply = (from: Point, to: Point, scale = 1, angle = 0) => {
    const rect = viewport?.size().css ?? canvas.getBoundingClientRect();
    moveCamera(camera, from, to, scale, angle, rect.width, rect.height, pageAspect());
    onInteraction('change');
  };

  makeEventListener(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    onDraggingChange(true);
    onInteraction('start');
  });

  makeEventListener(canvas, 'pointermove', (event) => {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    const before = [...pointers.values()];
    pointers.set(event.pointerId, local(event));

    const after = [...pointers.values()];
    const a = before[0]!;
    const b = after[0]!;

    if (before.length === 1) {
      apply(a, b);
    } else {
      const a2 = before[1]!;
      const b2 = after[1]!;
      const oldDistance = Math.hypot(a2.x - a.x, a2.y - a.y);
      const newDistance = Math.hypot(b2.x - b.x, b2.y - b.y);

      // Avoid unstable zoom and angles when fingers overlap.
      const valid = oldDistance > 2 && newDistance > 2;

      apply(
        { x: (a.x + a2.x) / 2, y: (a.y + a2.y) / 2 },
        { x: (b.x + b2.x) / 2, y: (b.y + b2.y) / 2 },
        valid ? newDistance / oldDistance : 1,
        valid ? Math.atan2(a2.y - a.y, a2.x - a.x) - Math.atan2(b2.y - b.y, b2.x - b.x) : 0
      );
    }
  });

  const end = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (!pointers.size) {
      onDraggingChange(false);
    }
  };

  makeEventListener(canvas, 'pointerup', end);

  makeEventListener(canvas, 'pointercancel', end);

  makeEventListener(canvas, 'lostpointercapture', end);

  const clear = () => {
    const ids = [...pointers.keys()];
    pointers.clear();
    for (const id of ids) {
      if (canvas.hasPointerCapture(id)) {
        canvas.releasePointerCapture(id);
      }
    }
    onDraggingChange(false);
  };

  makeEventListener(window, 'blur', clear);

  makeEventListener(
    canvas,
    'wheel',
    (event) => {
      event.preventDefault();
      onInteraction('start');

      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (viewport?.size().css.height ?? canvas.clientHeight) : 1;
      const scale = Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * 0.002);
      const point = local(event);

      apply(point, point, scale);
    },
    { passive: false }
  );

  onCleanup(clear);
}
