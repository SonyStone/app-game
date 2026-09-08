import type { createNavigationPuck } from '@app-game/navigation-puck/controller';
import { attachNavigationPuck } from '@app-game/navigation-puck/input';
import { makeTimer } from '@solid-primitives/timer';
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
    /** Defaults to hiding the pen ring during contact, while preserving hover and mouse cursors. */
    showPenCursor?: () => boolean;
    /** Called when real raw pen updates are received, rather than merely supported by the browser. */
    rawUpdate?: () => void;
    /** Optional one-contact action, e.g. sampling canvas paint. Consumes contact without a stroke or touch pan. */
    canvasAction?: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'pointerType'>) => boolean;
      run: (point: Point) => void;
    };
    puck: ReturnType<typeof createNavigationPuck>;
    selection?: {
      enabled: () => boolean;
      begin: (point: Point) => void;
      move: (point: Point) => void;
      end: () => void;
      cancel: () => void;
    };
  }
) {
  const abort = new AbortController(),
    signal = abort.signal;
  const touches = new Map<number, Point>();
  let gesture:
    | { kind: 'draw'; id: number; camera: Camera; size: ViewSize; latest: Sample; raw: boolean }
    | { kind: 'select'; id: number; camera: Camera; size: ViewSize }
    | { kind: 'pan'; id: number; previous: Point }
    | { kind: 'action'; id: number }
    | undefined;
  let touchStart: { camera: Camera; center: Point; distance: number; angle: number } | undefined;
  const detachPuck = attachNavigationPuck(canvas, options.puck, {
    busy: () => !!gesture || touches.size > 0,
    ready: options.ready,
    onOpen: () => options.cursor(undefined)
  });
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  let stopBuildUp: (() => void) | undefined;
  const collect = (event: PointerEvent) => {
    if (gesture?.kind !== 'draw' || gesture.id !== event.pointerId) return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    const samples: Sample[] = [];
    const rect = canvas.getBoundingClientRect();
    for (const sample of coalesced.length ? coalesced : [event]) {
      gesture.latest = {
        ...screenToWorld({ x: sample.clientX - rect.left, y: sample.clientY - rect.top }, gesture.camera, gesture.size),
        ...tabletAxes(sample),
        pressure: event.pointerType === 'pen' ? sample.pressure : 1,
        time: sample.timeStamp
      };
      samples.push(gesture.latest);
    }
    // Forward immediately, including raw updates. The worker batches while its GPU frame is in flight.
    options.send({ type: 'samples', samples });
  };
  const cursorAt = (event: PointerEvent) =>
    options.cursor(
      event.pointerType === 'touch' ||
        (event.pointerType === 'pen' && gesture?.kind === 'draw' && !options.showPenCursor?.())
        ? undefined
        : local(event)
    );
  if (supportsRawPointerUpdates())
    canvas.addEventListener(
      'pointerrawupdate',
      (event) => {
        if (!(event instanceof PointerEvent)) return;
        if (event.pointerType !== 'pen' || gesture?.kind !== 'draw' || gesture.id !== event.pointerId) return;
        gesture.raw = true;
        options.rawUpdate?.();
        cursorAt(event);
        collect(event);
      },
      { signal }
    );
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
    stopBuildUp?.();
    stopBuildUp = undefined;
    if (gesture?.kind === 'draw') {
      options.send({ type: 'end' });
    }
    if (gesture?.kind === 'select') options.selection?.end();
    gesture = undefined;
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!options.ready()) return;
      const point = local(event);
      canvas.focus({ preventScroll: true });
      if (!gesture && !touches.size && event.button === 0 && options.canvasAction?.enabled(event)) {
        canvas.setPointerCapture(event.pointerId);
        gesture = { kind: 'action', id: event.pointerId };
        options.canvasAction.run(screenToWorld(point, options.camera(), options.size()));
        event.preventDefault();
        return;
      }
      if (event.pointerType === 'touch') {
        if (gesture?.kind === 'draw' || gesture?.kind === 'select' || gesture?.kind === 'action') return;
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
      if (options.selection?.enabled()) {
        gesture = { kind: 'select', id: event.pointerId, camera, size: { ...options.size() } };
        options.selection.begin(screenToWorld(point, camera, gesture.size));
        return;
      }
      const pressure = event.pointerType === 'pen' ? event.pressure : 1;
      const latest = {
        ...tabletAxes(event),
        ...screenToWorld(point, camera, options.size()),
        pressure,
        time: event.timeStamp
      };
      gesture = { kind: 'draw', id: event.pointerId, camera, size: { ...options.size() }, latest, raw: false };
      cursorAt(event);
      options.send({
        type: 'begin',
        brush: options.brush(),
        modifiers: { altKey: event.altKey },
        zoom: camera.zoom,
        samples: [latest]
      });
      if (usesBuildUp(options.brush())) {
        stopBuildUp?.();
        const startedAt = performance.now(),
          eventStart = latest.time;
        stopBuildUp = makeTimer(
          () => {
            if (gesture?.kind !== 'draw') return;
            const time = eventStart + performance.now() - startedAt;
            if (time - gesture.latest.time < 30) return;
            gesture.latest = { ...gesture.latest, time };
            options.send({ type: 'samples', samples: [gesture.latest] });
          },
          30,
          setInterval
        );
      }
    },
    { signal }
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const point = local(event);
      cursorAt(event);
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
      if (gesture.kind === 'action') return;
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
      if (gesture.kind === 'select') {
        for (const sample of coalesced.length ? coalesced : [event])
          options.selection?.move(screenToWorld(local(sample), gesture.camera, gesture.size));
        return;
      }
      // Raw updates and pointermove contain the same physical samples. Never feed both to the filter.
      if (!gesture.raw) collect(event);
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
      if (gesture.kind === 'select') options.selection?.move(screenToWorld(local(event), gesture.camera, gesture.size));
      if (gesture.kind === 'draw') {
        const endpoint = screenToWorld(local(event), gesture.camera, gesture.size);
        // Release pressure is usually zero. Keep the last contact pressure, and do not
        // advance a sample-count filter just because a stationary pen was lifted.
        if (endpoint.x !== gesture.latest.x || endpoint.y !== gesture.latest.y)
          options.send({
            type: 'samples',
            samples: [{ ...gesture.latest, ...endpoint, pressure: gesture.latest.pressure, time: event.timeStamp }]
          });
      }
      finish();
      cursorAt(event);
    },
    { signal }
  );
  const interrupted = (event: PointerEvent) => {
    if (touches.delete(event.pointerId)) resetTouch();
    if (gesture?.id === event.pointerId) {
      if (gesture.kind === 'select') {
        options.selection?.cancel();
        gesture = undefined;
      } else finish();
    }
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
      if (gesture?.kind === 'draw' || gesture?.kind === 'select') return;
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
      if (gesture?.kind === 'select') options.selection?.cancel();
      finish();
      touches.clear();
      resetTouch();
      canvas.style.cursor = '';
    },
    { signal }
  );
  return () => {
    detachPuck();
    if (gesture?.kind === 'select') options.selection?.cancel();
    finish();
    abort.abort();
  };
}

/** Feature detection only; receiving raw events is reported separately by the input adapter. */
export function supportsRawPointerUpdates(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'onpointerrawupdate' in window;
}

/** Keyboard shortcuts must not intercept text entry or native controls. */
export function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Raw/coalesced events retain stylus axes without routing high-frequency samples through signals. */
function tabletAxes(event: PointerEvent) {
  return event.pointerType === 'pen'
    ? { tiltX: event.tiltX, tiltY: event.tiltY, rotation: event.twist, tangentialPressure: event.tangentialPressure }
    : {};
}

/** Build-up is an opt-in preset behavior, independent of redraw/RAF frequency. */
function usesBuildUp(brush: Brush) {
  const settings = brush.engine?.settings;
  if (brush.engine?.id !== 'abr' || !settings || typeof settings !== 'object' || !('values' in settings)) return false;
  const values = settings.values;
  return !!values && typeof values === 'object' && 'useBuildUp' in values && values.useBuildUp === true;
}
