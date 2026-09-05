import type { createNavigationPuck } from '@app-game/navigation-puck/controller';
import { attachNavigationPuck } from '@app-game/navigation-puck/input';
import type { Brush, Sample } from './brush';
import { panCamera, screenToWorld, transformAt, type Camera, type Point, type ViewSize } from './camera';
import type { PaintCommand } from './protocol';

/** Connects real pointer input to ordered worker commands; touch navigates and pen/mouse draw. */
export function attachInput(
  canvas: HTMLCanvasElement,
  options: {
    camera: () => Camera;
    size: () => ViewSize;
    brush: () => Brush;
    ready: () => boolean;
    navigate: (camera: Camera) => void;
    send: (command: PaintCommand) => void;
    cursor: (point: Point | undefined) => void;
    puck: ReturnType<typeof createNavigationPuck>;
  }
) {
  const abort = new AbortController(),
    signal = abort.signal;
  const touches = new Map<number, Point>();
  let gesture:
    | { kind: 'draw'; id: number; camera: Camera; size: ViewSize; pressure: number }
    | { kind: 'pan'; id: number; previous: Point }
    | undefined;
  let touchStart: { camera: Camera; center: Point; distance: number; angle: number } | undefined;
  let pending: Sample[] = [],
    frame = 0;
  const detachPuck = attachNavigationPuck(canvas, options.puck, {
    busy: () => !!gesture || touches.size > 0,
    ready: options.ready,
    onOpen: () => options.cursor(undefined)
  });
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (pending.length) {
      options.send({ type: 'samples', samples: pending });
      pending = [];
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const touchMetrics = () => {
    const [a, b] = [...touches.values()];
    if (!a) return undefined;
    return b
      ? {
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          distance: Math.hypot(b.x - a.x, b.y - a.y),
          angle: Math.atan2(b.y - a.y, b.x - a.x)
        }
      : { center: a, distance: 0, angle: 0 };
  };
  const resetTouch = () => {
    const metrics = touchMetrics();
    touchStart = metrics ? { camera: options.camera(), ...metrics } : undefined;
  };
  const finish = () => {
    if (gesture?.kind === 'draw') {
      flush();
      options.send({ type: 'end' });
    }
    gesture = undefined;
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!options.ready()) return;
      const point = local(event);
      canvas.focus({ preventScroll: true });
      if (event.pointerType === 'touch') {
        if (gesture?.kind === 'draw') return;
        canvas.setPointerCapture(event.pointerId);
        touches.set(event.pointerId, point);
        resetTouch();
        return;
      }
      if (gesture || event.button === 2) return;
      canvas.setPointerCapture(event.pointerId);
      if (event.button === 1) {
        gesture = { kind: 'pan', id: event.pointerId, previous: point };
        return;
      }
      if (event.button !== 0) return;
      touches.clear();
      touchStart = undefined;
      const camera = options.camera();
      const pressure = event.pointerType === 'pen' ? event.pressure : 1;
      gesture = { kind: 'draw', id: event.pointerId, camera, size: { ...options.size() }, pressure };
      options.send({
        type: 'begin',
        brush: options.brush(),
        zoom: camera.zoom,
        samples: [{ ...screenToWorld(point, camera, options.size()), pressure, time: event.timeStamp }]
      });
    },
    { signal }
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const point = local(event);
      options.cursor(event.pointerType === 'touch' ? undefined : point);
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, point);
        const metrics = touchMetrics();
        if (!metrics || !touchStart) return;
        const zoom =
          touchStart.distance > 0
            ? (touchStart.camera.zoom * metrics.distance) / touchStart.distance
            : touchStart.camera.zoom;
        const angle =
          touchStart.camera.angle +
          (touchStart.distance > 0
            ? Math.atan2(Math.sin(metrics.angle - touchStart.angle), Math.cos(metrics.angle - touchStart.angle))
            : 0);
        const next = transformAt(touchStart.camera, options.size(), touchStart.center, zoom, angle);
        options.navigate(
          panCamera(next, options.size(), {
            x: metrics.center.x - touchStart.center.x,
            y: metrics.center.y - touchStart.center.y
          })
        );
        return;
      }
      if (!gesture || gesture.id !== event.pointerId) return;
      if (gesture.kind === 'pan') {
        options.navigate(
          panCamera(options.camera(), options.size(), {
            x: point.x - gesture.previous.x,
            y: point.y - gesture.previous.y
          })
        );
        gesture.previous = point;
        return;
      }
      const coalesced = event.getCoalescedEvents?.() ?? [];
      for (const sample of coalesced.length ? coalesced : [event]) {
        gesture.pressure = event.pointerType === 'pen' ? sample.pressure : 1;
        pending.push({
          ...screenToWorld(local(sample), gesture.camera, gesture.size),
          pressure: gesture.pressure,
          time: sample.timeStamp
        });
      }
      schedule();
    },
    { signal }
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (touches.delete(event.pointerId)) {
        resetTouch();
        return;
      }
      if (gesture?.id !== event.pointerId) return;
      if (gesture.kind === 'draw')
        pending.push({
          ...screenToWorld(local(event), gesture.camera, gesture.size),
          pressure: gesture.pressure,
          time: event.timeStamp
        });
      finish();
    },
    { signal }
  );
  const interrupted = (event: PointerEvent) => {
    if (touches.delete(event.pointerId)) resetTouch();
    if (gesture?.id === event.pointerId) finish();
  };
  canvas.addEventListener('pointercancel', interrupted, { signal });
  canvas.addEventListener(
    'lostpointercapture',
    (event) => {
      // A delayed loss from the previous stroke must not finish a newly captured pointer.
      if (!canvas.hasPointerCapture(event.pointerId)) interrupted(event);
    },
    { signal }
  );
  canvas.addEventListener('pointerleave', () => options.cursor(undefined), { signal });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (gesture?.kind === 'draw') return;
      options.navigate(
        transformAt(
          options.camera(),
          options.size(),
          local(event),
          options.camera().zoom * Math.exp(-event.deltaY * 0.002)
        )
      );
    },
    { signal, passive: false }
  );
  window.addEventListener(
    'blur',
    () => {
      finish();
      touches.clear();
      resetTouch();
      canvas.style.cursor = '';
    },
    { signal }
  );
  return () => {
    detachPuck();
    finish();
    abort.abort();
    cancelAnimationFrame(frame);
  };
}

/** Keyboard shortcuts must not intercept text entry or native controls. */
export function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
