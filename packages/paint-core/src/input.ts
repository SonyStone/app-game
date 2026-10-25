import type { createNavigationPuck } from '@app-game/navigation-puck/controller';
import { attachNavigationPuck, type PuckPicker } from '@app-game/navigation-puck/input';
import { makeTimer } from '@solid-primitives/timer';
import type { Brush, Sample } from './brush';
import { panCamera, screenToWorld, transformAt, type Camera, type Point, type ViewSize } from './camera';
import type { PaintCommand } from './protocol';

/**
 * Connects real pointer input to ordered worker commands; touch navigates and pen/mouse draw. Touches landing during a
 * stroke, selection or canvas action are ignored; telling palms from fingers is left to the device and the app's palm
 * rejection. Cancels the canvas's `touchstart` events, so that its contacts never start browser gestures or clicks.
 */
export function attachInput(
  canvas: HTMLCanvasElement,
  options: {
    camera: () => Camera;
    size: () => ViewSize;
    brush: () => Brush;
    /** Brush for strokes drawn with the pen's eraser end (`button` 5), whatever the active tool; ignored when absent. */
    eraser?: () => Brush;
    ready: () => boolean;
    navigate: (camera: Camera) => void;
    send: (command: PaintCommand) => void;
    cursor: (point: Point | undefined) => void;
    /** Defaults to hiding the pen ring during contact, while preserving hover and mouse cursors. */
    showPenCursor?: () => boolean;
    /** Called when real raw pen updates are received, rather than merely supported by the browser. */
    rawUpdate?: () => void;
    /**
     * Whether strokes also send the points the browser predicts the pen will reach next (`getPredictedEvents`), which
     * the engine shows ahead of the line; off when absent.
     */
    predict?: () => boolean;
    /** Called for each move of a pen hovering over the canvas without touching it, such as to prepare for a stroke. */
    hover?: (event: PointerEvent) => void;
    /**
     * Called with every pointer event whose samples a stroke sent to the engine, after sending them, for example to
     * draw a provisional ink trail from it; receives the stroke's brush too.
     */
    drawn?: (event: PointerEvent, brush: Brush) => void;
    /**
     * Maps raw pen pressure to the pressure strokes receive, before any stroke processor or brush engine, such as a
     * device calibration curve; called for every pen sample and must return a value in [0, 1]. Mouse and touch keep
     * pressure 1. Pressure is left unchanged when absent.
     */
    mapPressure?: (raw: number) => number;
    /**
     * Optional contact action, e.g. sampling canvas paint. Consumes the contact without a stroke or touch pan: `run`
     * receives the document point of the contact, `move` the points it is dragged to and `end` its release, or a
     * cancellation with `cancelled` set. Both receive the pen pressure and modifier keys; see `CanvasContact`.
     */
    canvasAction?: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'pointerType'>) => boolean;
      run: (point: Point, contact: CanvasContact) => void;
      move?: (point: Point, contact: CanvasContact) => void;
      end?: (cancelled: boolean) => void;
    };
    /**
     * Optional drag adjustment, such as brush size and opacity. Takes precedence over `canvasAction`; `begin`, `move`
     * and `end` receive canvas CSS pixels, and the contact neither draws nor navigates. `end` also runs on cancel.
     */
    adjust?: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'pointerType'>) => boolean;
      begin: (point: Point) => void;
      move: (point: Point) => void;
      end: () => void;
    };
    /**
     * Optional touch shortcuts beside navigation. `tap` receives the finger count of a short touch of two or more
     * fingers that barely moved; the camera returns to where the touch started. `hold` receives the document point of
     * one finger held still for half a second; the touch then no longer navigates until every finger lifts. A hold
     * that returns a drag follows that finger: `move` receives its document points and `end` its release, or a
     * cancellation with `cancelled` set.
     */
    touchGestures?: {
      tap: (fingers: number) => void;
      hold?: (point: Point) => TouchHoldDrag | void;
    };
    /**
     * Optional hold at the end of a stroke, such as QuickShape's. A pen or mouse drawing that stays within
     * {@link strokeHoldSlop} CSS pixels for `delay()` milliseconds calls `hold` with the stroke's samples so far, in
     * document pixels. A hold that returns a drag takes the stroke over: its later points go to `move` instead of the
     * engine, without predictions, and their events to `withheld` instead of `drawn`; `fingers` reports the touches on
     * the canvas, and `end` runs before the stroke's `end` is sent, at release or with `cancelled` set when
     * interrupted. A prediction already shown is cleared when the hold takes over. A hold that returns nothing leaves
     * the stroke drawing; it can fire again after the pen moves on.
     */
    strokeHold?: {
      delay: () => number;
      hold: (samples: readonly Sample[]) => StrokeHoldDrag | void;
    };
    /**
     * Called instead of `drawn` with each pointer event of a stroke a stroke hold took over, whose points reach the
     * hold's drag rather than the engine; for example to hide an ink trail, which would otherwise follow the pen.
     */
    withheld?: (event: PointerEvent) => void;
    puck?: ReturnType<typeof createNavigationPuck>;
    /** Chooses from controls around the puck with right-drags, such as a radial menu; see `PuckPicker`. */
    puckPicker?: PuckPicker;
    /** The canvas with the overlays drawn over it, where the puck opens too; see `attachNavigationPuck`'s `surface`. */
    puckSurface?: () => Element | undefined;
    /**
     * Selection gestures of a pen or mouse, in document pixels, instead of strokes while `enabled`; `begin` receives
     * the modifier keys held at the press, which choose how a new shape combines with the selection.
     */
    selection?: {
      enabled: () => boolean;
      begin: (point: Point, modifiers: { shiftKey: boolean; altKey: boolean }) => void;
      move: (point: Point) => void;
      end: () => void;
      cancel: () => void;
    };
  }
) {
  const abort = new AbortController(),
    signal = abort.signal;
  const touches = new Map<number, Point>();
  /** A stroke's `inputTime` is the event time of its newest sample sent; build-up samples do not advance it. */
  let gesture:
    | {
        kind: 'draw';
        id: number;
        camera: Camera;
        size: ViewSize;
        latest: Sample;
        raw: boolean;
        inputTime: number;
        brush: Brush;
        /** The engine shows a prediction sent for this stroke. */
        predicting: boolean;
        /** Every sample sent for the stroke, for `strokeHold`. */
        samples: Sample[];
        /** Where the pen came to rest, in canvas CSS pixels, while a stroke hold is timed. */
        still?: Point;
        /** The drag a stroke hold returned; it receives the stroke's later points. */
        held?: StrokeHoldDrag;
      }
    | { kind: 'select'; id: number; camera: Camera; size: ViewSize }
    | { kind: 'pan'; id: number; previous: Point }
    | { kind: 'action'; id: number }
    | { kind: 'adjust'; id: number }
    | undefined;
  let touchStart: { camera: Camera; center: Point; distance: number; angle: number } | undefined;
  /** One touch interaction, from the first finger down until every finger lifts, for tap and hold shortcuts. */
  let touchSession:
    | { start: number; camera: Camera; origins: Map<number, Point>; fingers: number; moved: boolean; held: boolean }
    | undefined;
  let clearHold: (() => void) | undefined;
  /** The drag of a held finger, while it is down. */
  let holdDrag: (TouchHoldDrag & { id: number }) | undefined;
  const endHoldDrag = (cancelled: boolean) => {
    const drag = holdDrag;
    holdDrag = undefined;
    drag?.end(cancelled);
  };
  const stopHold = () => {
    clearHold?.();
    clearHold = undefined;
  };
  const endTouchSession = () => {
    stopHold();
    touchSession = undefined;
  };
  const detachPuck =
    options.puck &&
    attachNavigationPuck(canvas, options.puck, {
      busy: () => !!gesture || touches.size > 0,
      ready: options.ready,
      onOpen: () => options.cursor(undefined),
      ...(options.puckPicker ? { pick: options.puckPicker } : {}),
      ...(options.puckSurface ? { surface: options.puckSurface } : {})
    });
  const local = (event: { clientX: number; clientY: number }, rect = canvas.getBoundingClientRect()): Point => {
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  /** The pressure a stroke receives from a sample of `pointerType`; every pen sample a stroke gets passes here. */
  const pressureOf = (pointerType: string, raw: number) =>
    pointerType === 'pen' ? (options.mapPressure?.(raw) ?? raw) : 1;
  let stopBuildUp: (() => void) | undefined;
  let stopStrokeHold: (() => void) | undefined;
  /** Touches that landed while a stroke hold's drag is active. */
  const heldFingers = new Set<number>();
  /** Times a stroke hold from where the pen comes to rest at `point`; moving within the slop keeps the timer. */
  const watchStrokeHold = (point: Point) => {
    const draw = gesture;
    const strokeHold = options.strokeHold;
    if (!strokeHold || draw?.kind !== 'draw' || draw.held) {
      return;
    }

    if (draw.still && Math.hypot(point.x - draw.still.x, point.y - draw.still.y) <= strokeHoldSlop) {
      return;
    }

    draw.still = point;
    stopStrokeHold?.();
    stopStrokeHold = makeTimer(
      () => {
        stopStrokeHold = undefined;
        if (gesture !== draw || draw.held) {
          return;
        }

        const drag = strokeHold.hold(draw.samples);
        if (!drag) {
          return;
        }

        draw.held = drag;
        // The drag replaces the stroke; paint built up at the rest point would be discarded anyway.
        stopBuildUp?.();
        stopBuildUp = undefined;
        if (draw.predicting) {
          draw.predicting = false;
          options.send({ type: 'samples', samples: [], predicted: [] });
        }
      },
      strokeHold.delay(),
      setTimeout
    );
  };
  /**
   * Sends a stroke's samples from `event`; with `samples` false, only the points predicted after it. Once a stroke
   * hold took the stroke over, its drag receives the newest point instead.
   */
  const collect = (event: PointerEvent, samples: boolean, rect: DOMRect) => {
    if (gesture?.kind !== 'draw' || gesture.id !== event.pointerId) return;
    const draw = gesture;
    const sample = (input: PointerEvent): Sample => ({
      ...screenToWorld({ x: input.clientX - rect.left, y: input.clientY - rect.top }, draw.camera, draw.size),
      ...tabletAxes(input),
      pressure: pressureOf(event.pointerType, input.pressure),
      time: input.timeStamp
    });
    const real: Sample[] = [];
    if (samples) {
      // iPad Safari repeats Apple Pencil samples of earlier moves in the coalesced list (WebKit bug 316105).
      // Replaying them would retrace the stroke, so only samples newer than the previous batch count.
      const sent = draw.inputTime;
      const coalesced = event.getCoalescedEvents?.() ?? [];
      for (const input of coalesced.length ? coalesced : [event]) {
        if (input.timeStamp <= sent) {
          continue;
        }

        draw.inputTime = Math.max(draw.inputTime, input.timeStamp);
        draw.latest = sample(input);
        real.push(draw.latest);
      }
    }

    if (draw.held) {
      const last = real.at(-1);
      if (last) {
        draw.held.move(last);
        options.withheld?.(event);
      }

      return;
    }

    // Raw updates carry no predictions; the pointermove after them does.
    const predicted =
      event.type === 'pointermove' && options.predict?.()
        ? (event.getPredictedEvents?.() ?? []).map(sample)
        : undefined;
    // An empty prediction is sent only to clear one shown before.
    if (!real.length && !predicted?.length && !draw.predicting) return;
    if (predicted) draw.predicting = predicted.length > 0;
    // Forward immediately, including raw updates. The worker batches while its GPU frame is in flight.
    options.send({ type: 'samples', samples: real, ...(predicted ? { predicted } : {}) });
    if (real.length) {
      options.drawn?.(event, draw.brush);
      draw.samples.push(...real);
      watchStrokeHold(local(event, rect));
    }
  };
  const cursorAt = (event: PointerEvent, point: Point) =>
    options.cursor(
      event.pointerType === 'touch' ||
        gesture?.kind === 'adjust' ||
        (event.pointerType === 'pen' && gesture?.kind === 'draw' && !options.showPenCursor?.())
        ? undefined
        : point
    );
  if (supportsRawPointerUpdates())
    canvas.addEventListener(
      'pointerrawupdate',
      (event) => {
        if (!(event instanceof PointerEvent)) return;
        if (event.pointerType !== 'pen' || gesture?.kind !== 'draw' || gesture.id !== event.pointerId) return;
        gesture.raw = true;
        options.rawUpdate?.();
        const rect = canvas.getBoundingClientRect();
        cursorAt(event, local(event, rect));
        collect(event, true, rect);
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
  const finish = (cancelled = false) => {
    stopBuildUp?.();
    stopBuildUp = undefined;
    stopStrokeHold?.();
    stopStrokeHold = undefined;
    heldFingers.clear();
    if (gesture?.kind === 'draw') {
      gesture.held?.end(cancelled);
      options.send({ type: 'end' });
    }
    if (gesture?.kind === 'select') options.selection?.end();
    if (gesture?.kind === 'adjust') options.adjust?.end();
    if (gesture?.kind === 'action') options.canvasAction?.end?.(cancelled);
    gesture = undefined;
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!options.ready()) return;
      const point = local(event);
      canvas.focus({ preventScroll: true });
      if (!gesture && !touches.size && event.button === 0 && options.adjust?.enabled(event)) {
        canvas.setPointerCapture(event.pointerId);
        gesture = { kind: 'adjust', id: event.pointerId };
        options.cursor(undefined);
        options.adjust.begin(point);
        event.preventDefault();
        return;
      }
      if (!gesture && !touches.size && event.button === 0 && options.canvasAction?.enabled(event)) {
        canvas.setPointerCapture(event.pointerId);
        gesture = { kind: 'action', id: event.pointerId };
        options.canvasAction.run(screenToWorld(point, options.camera(), options.size()), canvasContact(event));
        event.preventDefault();
        return;
      }
      if (event.pointerType === 'touch') {
        if (gesture?.kind === 'draw' && gesture.held) {
          heldFingers.add(event.pointerId);
          gesture.held.fingers(heldFingers.size);
        }

        if (gesture?.kind === 'draw' || gesture?.kind === 'select' || gesture?.kind === 'action') return;
        canvas.setPointerCapture(event.pointerId);
        if (!touches.size) {
          stopHold();
          touchSession = {
            start: event.timeStamp,
            camera: options.camera(),
            origins: new Map(),
            fingers: 0,
            moved: false,
            held: false
          };
        }
        touches.set(event.pointerId, point);
        if (touchSession) {
          touchSession.origins.set(event.pointerId, point);
          touchSession.fingers = Math.max(touchSession.fingers, touches.size);
          stopHold();
          const hold = options.touchGestures?.hold;
          const session = touchSession;
          if (hold && touches.size === 1 && !session.held)
            clearHold = makeTimer(
              () => {
                clearHold = undefined;
                if (touchSession !== session || session.moved || touches.size !== 1) return;
                session.held = true;
                const drag = hold(screenToWorld(point, options.camera(), options.size()));
                if (drag) holdDrag = { ...drag, id: event.pointerId };
              },
              touchHoldMs,
              setTimeout
            );
        }
        resetTouch();
        return;
      }
      if (gesture || event.button === 2) return;
      const eraser = event.pointerType === 'pen' && event.button === 5 ? options.eraser : undefined;
      canvas.setPointerCapture(event.pointerId);
      if (event.button === 1) {
        gesture = { kind: 'pan', id: event.pointerId, previous: point };
        return;
      }
      if (event.button !== 0 && !eraser) return;
      touches.clear();
      touchStart = undefined;
      const camera = options.camera();
      if (options.selection?.enabled() && !eraser) {
        gesture = { kind: 'select', id: event.pointerId, camera, size: { ...options.size() } };
        options.selection.begin(screenToWorld(point, camera, gesture.size), {
          shiftKey: event.shiftKey,
          altKey: event.altKey
        });
        return;
      }
      const pressure = pressureOf(event.pointerType, event.pressure);
      const latest = {
        ...tabletAxes(event),
        ...screenToWorld(point, camera, options.size()),
        pressure,
        time: event.timeStamp
      };
      const brush = eraser ? eraser() : options.brush();
      gesture = {
        kind: 'draw',
        id: event.pointerId,
        camera,
        size: { ...options.size() },
        latest,
        raw: false,
        inputTime: event.timeStamp,
        brush,
        predicting: false,
        samples: [latest]
      };
      cursorAt(event, point);
      watchStrokeHold(point);
      options.send({
        type: 'begin',
        brush,
        modifiers: { altKey: event.altKey },
        zoom: camera.zoom,
        samples: [latest]
      });
      options.drawn?.(event, brush);
      if (usesBuildUp(brush)) {
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
      const rect = canvas.getBoundingClientRect();
      const point = local(event, rect);
      cursorAt(event, point);
      if (event.pointerType === 'pen' && event.buttons === 0 && !gesture) options.hover?.(event);
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, point);
        const origin = touchSession?.origins.get(event.pointerId);
        if (touchSession && origin && Math.hypot(point.x - origin.x, point.y - origin.y) > touchSlop) {
          touchSession.moved = true;
          stopHold();
        }
        if (holdDrag?.id === event.pointerId) holdDrag.move(screenToWorld(point, options.camera(), options.size()));
        if (touchSession?.held) return;
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
      if (gesture.kind === 'action') {
        options.canvasAction?.move?.(screenToWorld(point, options.camera(), options.size()), canvasContact(event));
        return;
      }
      if (gesture.kind === 'adjust') {
        options.adjust?.move(point);
        return;
      }
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
        for (const sample of coalesced.length ? coalesced : [event]) {
          options.selection?.move(screenToWorld(local(sample, rect), gesture.camera, gesture.size));
        }

        return;
      }
      // Raw updates and pointermove contain the same physical samples. Never feed both to the filter.
      collect(event, !gesture.raw, rect);
    },
    { signal }
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (heldFingers.delete(event.pointerId) && gesture?.kind === 'draw') {
        gesture.held?.fingers(heldFingers.size);
      }

      if (touches.delete(event.pointerId)) {
        if (holdDrag?.id === event.pointerId) endHoldDrag(false);
        resetTouch();
        stopHold();
        const session = touchSession;
        if (!touches.size && session) {
          endTouchSession();
          if (
            !session.moved &&
            !session.held &&
            session.fingers >= 2 &&
            event.timeStamp - session.start <= touchTapMs
          ) {
            options.navigate(session.camera);
            options.touchGestures?.tap(session.fingers);
          }
        }
        return;
      }
      if (gesture?.id !== event.pointerId) return;
      const point = local(event);
      if (gesture.kind === 'select') {
        options.selection?.move(screenToWorld(point, gesture.camera, gesture.size));
      }

      if (gesture.kind === 'draw' && !gesture.held) {
        const endpoint = screenToWorld(point, gesture.camera, gesture.size);
        // Release pressure is usually zero. Keep the last contact pressure, and do not
        // advance a sample-count filter just because a stationary pen was lifted.
        if (endpoint.x !== gesture.latest.x || endpoint.y !== gesture.latest.y)
          options.send({
            type: 'samples',
            samples: [{ ...gesture.latest, ...endpoint, pressure: gesture.latest.pressure, time: event.timeStamp }]
          });
      }
      finish();
      cursorAt(event, point);
    },
    { signal }
  );
  const interrupted = (event: PointerEvent) => {
    if (heldFingers.delete(event.pointerId) && gesture?.kind === 'draw') {
      gesture.held?.fingers(heldFingers.size);
    }

    if (touches.delete(event.pointerId)) {
      if (holdDrag?.id === event.pointerId) endHoldDrag(true);
      resetTouch();
      endTouchSession();
    }
    if (gesture?.id === event.pointerId) {
      if (gesture.kind === 'select') {
        options.selection?.cancel();
        gesture = undefined;
      } else finish(true);
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
  // Unless its touch events are cancelled, iPadOS also hands a contact to its own gestures: Scribble, text selection
  // and the loupe. A quick series of Apple Pencil taps can then select the whole page. Pointer events still arrive, and
  // the canvas needs no clicks.
  canvas.addEventListener(
    'touchstart',
    (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    },
    { signal, passive: false }
  );
  window.addEventListener(
    'blur',
    () => {
      if (gesture?.kind === 'select') options.selection?.cancel();
      finish(true);
      endHoldDrag(true);
      touches.clear();
      resetTouch();
      endTouchSession();
      canvas.style.cursor = '';
    },
    { signal }
  );
  return () => {
    detachPuck?.();
    if (gesture?.kind === 'select') options.selection?.cancel();
    finish(true);
    endHoldDrag(true);
    endTouchSession();
    abort.abort();
  };
}

/** A drag that continues a touch hold, such as sampling colors under the held finger. */
export type TouchHoldDrag = { move: (point: Point) => void; end: (cancelled: boolean) => void };

/**
 * A drag that continues a stroke hold, such as editing the shape QuickShape made of the stroke: `move` receives the
 * points the pen moves to, in document pixels, `fingers` the count of touches on the canvas whenever it changes, and
 * `end` the release, or a cancellation with `cancelled` set.
 */
export type StrokeHoldDrag = {
  move: (sample: Sample) => void;
  fingers: (count: number) => void;
  end: (cancelled: boolean) => void;
};

/** Distance in CSS pixels a drawing pen may move and still count as resting, for a stroke hold. */
export const strokeHoldSlop = 4;

/** A canvas action's contact as pressed or dragged: pen pressure from 0 to 1, 1 for a mouse, and modifier keys. */
export type CanvasContact = { pressure: number; altKey: boolean; shiftKey: boolean };

function canvasContact(event: PointerEvent): CanvasContact {
  return {
    pressure: event.pointerType === 'pen' ? event.pressure : 1,
    altKey: event.altKey,
    shiftKey: event.shiftKey
  };
}

/** Longest touch, in milliseconds, that still counts as a tap. */
const touchTapMs = 350;

/** How long one finger must stay still, in milliseconds, to count as a hold. */
const touchHoldMs = 500;

/** Distance in CSS pixels a finger may move during a tap or hold. */
const touchSlop = 10;

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
    ? {
        pointerType: event.pointerType,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        rotation: event.twist,
        tangentialPressure: event.tangentialPressure
      }
    : { pointerType: event.pointerType };
}

/** Build-up is an opt-in preset behavior, independent of redraw/RAF frequency. */
function usesBuildUp(brush: Brush) {
  const settings = brush.engine?.settings;
  if (brush.engine?.id !== 'abr' || !settings || typeof settings !== 'object' || !('values' in settings)) return false;
  const values = settings.values;
  return !!values && typeof values === 'object' && 'useBuildUp' in values && values.useBuildUp === true;
}
