import { makeEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import type { PaintSession } from '../../features/session';
import type { PenMode, PenModes } from './createPenModes';
import { discCenter, discPick } from './disc';
import {
  adjustAxis,
  adjustedOpacity,
  adjustedSize,
  inZone,
  ringItemAt,
  ringLayout,
  zoneShape,
  type Point,
  type RingLayout,
  type Side
} from './geometry';

/**
 * The free hand's zone along the `side` edge and the touches in it. Touches that start in the zone never reach the
 * canvas, so they neither pan nor draw; touches elsewhere keep the canvas gestures. Pens and the mouse pass through
 * the zone and draw as anywhere else.
 *
 * In the zone:
 * - one finger opens the ring of pen modes around it (see `ringLayout`). Sliding onto a mode spring-loads it for as
 *   long as the finger stays down; lifting returns the pen to its latched mode (see `PenModes`). A quick flick onto a
 *   mode that lifts without using the pen latches it instead, and a tap without sliding leaves the ring open for a
 *   tap on a mode;
 * - one finger held still for half a second opens the color disc under it instead: sliding chooses the color live,
 *   lifting keeps it, a cancelled touch restores the previous one;
 * - two fingers dragging change the brush: up and down the size, sideways the opacity, locked to the direction they
 *   start in; a two-finger tap undoes and a three-finger tap calls `onLayers`.
 *
 * Listens on the window in the capture phase, so it must be created before the canvas mounts, within a Solid owner.
 */
export function createFreeHand(options: {
  session: PaintSession;
  modes: PenModes;
  /** The edge the free hand works at. */
  side: () => Side;
  /** The zone takes touches; false while something covers it. */
  enabled: () => boolean;
  /** A three-finger tap in the zone. */
  onLayers: () => void;
}) {
  const { session, modes } = options;
  const { tools } = session;
  /** The zone in stage pixels. */
  const zone = createMemo(() => zoneShape(session.size(), options.side()));
  /** The ring a finger opened: `held` while the finger is down, `open` after a tap, waiting for a tap on a mode. */
  const [ring, setRing] = createSignal<{ layout: RingLayout<PenMode>; hovered?: PenMode; state: 'held' | 'open' }>();
  const [disc, setDisc] = createSignal<{ center: Point; finger: Point; color: Hsv; original: string }>();
  const [adjusting, setAdjusting] = createSignal<{ at: Point; axis?: 'size' | 'opacity' }>();
  /** Touches the zone took, by pointer, in client pixels. */
  const fingers = new Map<number, Point>();
  let gesture: Gesture | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (run: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, delay);
    timers.add(timer);
  };
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers.clear();
  };
  onCleanup(clearTimers);

  listen();

  return {
    zone,
    ring,
    disc,
    /** A two-finger drag in progress: the fingers' center in client pixels and the value it adjusts, once known. */
    adjusting,
    /** Latches a mode tapped on an open ring and closes it. */
    choose(mode: PenMode) {
      modes.latch(mode);
      setRing(undefined);
    },
    closeRing: () => setRing(undefined)
  };

  /** The stage's bounds in client pixels. */
  function stageRect() {
    const bounds = session.stage()?.getBoundingClientRect();
    return bounds ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
  }

  function listen() {
    const capture = { capture: true };
    const consume = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    makeEventListener(
      window,
      'pointerdown',
      (event) => {
        if (event.pointerType !== 'touch') {
          // A pen or mouse press anywhere but on the ring closes a ring left open; the press goes on.
          if (ring()?.state === 'open' && !insideUi(event)) {
            setRing(undefined);
          }

          return;
        }

        if (insideUi(event)) {
          return;
        }

        const bounds = stageRect();
        const point = { x: event.clientX, y: event.clientY };
        if (!options.enabled() || !inZone(zone(), { x: point.x - bounds.left, y: point.y - bounds.top })) {
          if (ring()?.state === 'open') {
            setRing(undefined);
          }

          return;
        }

        consume(event);
        fingers.set(event.pointerId, point);
        press(event.pointerId, point, event.timeStamp);
      },
      capture
    );
    makeEventListener(
      window,
      'pointermove',
      (event) => {
        if (!fingers.has(event.pointerId)) {
          return;
        }

        consume(event);
        fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        move(event.pointerId);
      },
      capture
    );
    makeEventListener(
      window,
      'pointerup',
      (event) => {
        if (fingers.delete(event.pointerId)) {
          consume(event);
          lift(event.pointerId, event.timeStamp, false);
        }
      },
      capture
    );
    makeEventListener(
      window,
      'pointercancel',
      (event) => {
        if (fingers.delete(event.pointerId)) {
          lift(event.pointerId, event.timeStamp, true);
        }
      },
      capture
    );
    makeEventListener(window, 'blur', () => {
      for (const id of [...fingers.keys()]) {
        fingers.delete(id);
        lift(id, performance.now(), true);
      }
    });
  }

  /** A finger lands in the zone. */
  function press(id: number, point: Point, time: number) {
    if (!gesture) {
      // A tap elsewhere in the zone closes a ring left open and opens a new one under this finger.
      setRing(undefined);
      startRing(id, point, time);
      return;
    }

    if (gesture.kind === 'ring' && !gesture.mode && fingers.size === 2) {
      clearTimers();
      setRing(undefined);
      gesture = { kind: 'fingers', count: 2, start: gesture.start, origin: centroid(), moved: false };
      return;
    }

    if (gesture.kind === 'fingers' && !gesture.moved) {
      gesture.count = Math.max(gesture.count, fingers.size);
      gesture.origin = centroid();
    }
  }

  function startRing(id: number, point: Point, time: number) {
    const layout = ringLayout(point, modes.offered(), stageRect());
    const started: RingGesture = {
      kind: 'ring',
      id,
      origin: point,
      start: time,
      layout,
      moved: false,
      presses: modes.presses()
    };
    gesture = started;
    // Shown a moment later, so that a second finger turning this into a two-finger gesture does not flash it.
    later(() => {
      if (gesture === started && !ring()) {
        setRing({ layout, state: 'held', hovered: started.mode });
      }
    }, ringDelay);
    later(() => {
      if (gesture === started && !started.moved && !started.mode) {
        openDisc(id, point);
      }
    }, holdMs);
  }

  /** The long press turns the ring into the color disc under the finger. */
  function openDisc(id: number, finger: Point) {
    const original = tools.brush().color;
    const color = hexToHsv(original);
    setRing(undefined);
    gesture = { kind: 'disc', id, origin: finger, moved: false };
    setDisc({ center: discCenter(finger, color, stageRect()), finger, color, original });
  }

  function move(id: number) {
    const point = fingers.get(id)!;
    if (gesture?.kind === 'ring' && gesture.id === id) {
      if (!gesture.moved && distance(point, gesture.origin) > slop) {
        gesture.moved = true;
        if (!ring()) {
          setRing({ layout: gesture.layout, state: 'held' });
        }
      }

      const mode = ringItemAt(gesture.layout, point);
      // A stroke in progress keeps its tool: the ring waits for the pen.
      if (mode === gesture.mode || modes.penDown()) {
        return;
      }

      gesture.mode = mode;
      gesture.modeSince = performance.now();
      modes.hold(mode);
      setRing({ layout: gesture.layout, state: 'held', hovered: mode });
      return;
    }

    if (gesture?.kind === 'disc' && gesture.id === id) {
      const open = disc();
      if (!open || (!gesture.moved && distance(point, gesture.origin) <= slop / 2)) {
        return;
      }

      gesture.moved = true;
      const color = discPick(open.center, point, open.color);
      setDisc({ ...open, finger: point, color });
      tools.updateBrush({ color: hsvToHex(color) });
      return;
    }

    if (gesture?.kind === 'fingers') {
      const offset = subtract(centroid(), gesture.origin);
      if (!gesture.moved && Math.hypot(offset.x, offset.y) > slop) {
        gesture.moved = true;
        if (gesture.count === 2 && fingers.size === 2) {
          gesture = {
            kind: 'adjust',
            origin: gesture.origin,
            size: tools.brush().size,
            opacity: tools.brush().opacity
          };
          setAdjusting({ at: centroid() });
        }
      }

      if (gesture.kind === 'adjust') {
        adjust(gesture);
      }

      return;
    }

    if (gesture?.kind === 'adjust') {
      adjust(gesture);
    }
  }

  /** Follows a two-finger drag: the size or the opacity, counted from where the direction became clear. */
  function adjust(drag: AdjustGesture) {
    const at = centroid();
    if (!drag.axis) {
      drag.axis = adjustAxis(subtract(at, drag.origin));
      if (!drag.axis) {
        setAdjusting({ at });
        return;
      }

      drag.origin = at;
    }

    const offset = subtract(at, drag.origin);
    if (drag.axis === 'size' && !session.blockCursor()) {
      tools.updateBrush({ size: adjustedSize(drag.size, offset.y, maxBrushSize(tools.brush())) });
    } else if (drag.axis === 'opacity') {
      tools.updateBrush({ opacity: adjustedOpacity(drag.opacity, offset.x) });
    }

    setAdjusting({ at, axis: drag.axis });
  }

  /** A finger lifts or is cancelled. */
  function lift(id: number, time: number, cancelled: boolean) {
    const ended = gesture;
    if (ended?.kind === 'ring' && ended.id === id) {
      clearTimers();
      finishRing(ended, time, cancelled);
      gesture = { kind: 'spent' };
    } else if (ended?.kind === 'disc' && ended.id === id) {
      const open = disc();
      if (cancelled && open) {
        tools.updateBrush({ color: open.original });
      }

      setDisc(undefined);
      gesture = { kind: 'spent' };
    } else if (ended?.kind === 'adjust') {
      setAdjusting(undefined);
      gesture = { kind: 'spent' };
    } else if (ended?.kind === 'fingers' && fingers.size === 0 && !cancelled && !ended.moved) {
      // Fingers of a tap lift one after another; the tap counts from the first landing to the last lift.
      if (time - ended.start < tapMs && ended.count === 2 && session.engine.state().canUndo) {
        session.undo();
      } else if (time - ended.start < tapMs && ended.count === 3) {
        options.onLayers();
      }
    }

    if (fingers.size === 0) {
      gesture = undefined;
    }
  }

  /**
   * The ring's finger lifts: a mode flicked to and let go quickly without using the pen latches, a held one returns
   * to the latched mode; a tap leaves the ring open.
   */
  function finishRing(ended: RingGesture, time: number, cancelled: boolean) {
    if (ended.mode) {
      const quick =
        !cancelled &&
        performance.now() - (ended.modeSince ?? 0) < flickMs &&
        time - ended.start < flickMs * 2 &&
        modes.presses() === ended.presses;
      if (quick) {
        modes.latch(ended.mode);
      } else {
        modes.release();
      }

      setRing(undefined);
      return;
    }

    if (!cancelled && !ended.moved && time - ended.start < tapMs) {
      setRing({ layout: ended.layout, state: 'open' });
      return;
    }

    setRing(undefined);
  }

  /** The center of the zone's fingers, in client pixels. */
  function centroid(): Point {
    const points = [...fingers.values()];
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
      y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length)
    };
  }
}

/** The free hand's zone and gestures; see `createFreeHand`. */
export type FreeHand = ReturnType<typeof createFreeHand>;

type RingGesture = {
  kind: 'ring';
  id: number;
  origin: Point;
  start: number;
  layout: RingLayout<PenMode>;
  moved: boolean;
  /** The mode the finger points at and holds, and since when. */
  mode?: PenMode;
  modeSince?: number;
  /** Pen presses when the finger landed; see `PenModes.presses`. */
  presses: number;
};

type AdjustGesture = { kind: 'adjust'; origin: Point; size: number; opacity: number; axis?: 'size' | 'opacity' };

/**
 * A touch interaction in the zone, from its first finger until the last lifts: the ring, the color disc, several
 * fingers that may still tap or start to drag, a two-finger adjustment, or one that has ended while fingers remain.
 */
type Gesture =
  | RingGesture
  | { kind: 'disc'; id: number; origin: Point; moved: boolean }
  | { kind: 'fingers'; count: number; start: number; origin: Point; moved: boolean }
  | AdjustGesture
  | { kind: 'spent' };

/** Elements of this variant's interface take their own presses. */
function insideUi(event: Event) {
  return event.target instanceof Element && !!event.target.closest('[data-hands-ui]');
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Pixels a finger may tremble before it counts as moving. */
const slop = 10;

/** Milliseconds before the ring shows, unless the finger moves first. */
const ringDelay = 70;

/** How long a finger rests, in milliseconds, before the color disc opens. */
const holdMs = 500;

/** Longest touch, in milliseconds, that counts as a tap. */
const tapMs = 350;

/** Longest stay on a mode, in milliseconds, that latches it when the finger lifts. */
const flickMs = 300;
