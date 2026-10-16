import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal } from 'solid-js';
import { createDial } from './dial';
import { pebbleRadius, type Point } from './placement';

/**
 * Rewind: one finger circling the pebble scrubs the drawing's history like a jog dial, one undo per `stepDegrees`
 * counterclockwise and one redo per step clockwise; turning back retraces the steps. It starts with a finger landing on
 * the drawing within `haloRadius` of the pebble (but not on it) and ends when the finger lifts.
 *
 * It never fights the view's gestures, which take two fingers: the moment a second finger lands, the first is handed
 * to the canvas as if it had just touched down there, so the pair pinches, pans and rotates as usual. Pens draw through
 * the halo, and touches are ignored while a pen is near the screen or when they are as wide as a palm, so a hand
 * resting on the screen never rewinds.
 *
 * The listeners are on the window in the capture phase, so the canvas never sees a finger the dial takes. Must be
 * created within a Solid owner.
 */
export function createRewind(options: {
  /** The pebble's center in client pixels. */
  center: () => Point;
  canvas: () => HTMLCanvasElement | undefined;
  /** A rewind may start: the fan is closed and the drawing can be edited. */
  enabled: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
}) {
  const [dial, setDial] = createSignal<RewindDial>();
  /** The finger turning the dial. */
  let turning:
    | { id: number; dial: ReturnType<typeof createDial>; applied: number; point: Point; start: number }
    | undefined;
  /** Fingers down elsewhere: a rewind starts only with the first finger. */
  const fingers = new Set<number>();
  /** When a pen was last seen, hovering or touching. */
  let penSeen = -Infinity;
  /** A finger being handed to the canvas, whose synthetic press must pass. */
  let handing = false;
  const capture = { capture: true };
  const consume = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.pointerType === 'pen') {
        penSeen = event.timeStamp;
        return;
      }

      if (event.pointerType !== 'touch' || handing) {
        return;
      }

      if (turning) {
        // A second finger: the view's gestures take over both.
        handOver();
        fingers.add(event.pointerId);
        return;
      }

      const point = { x: event.clientX, y: event.clientY };
      if (fingers.size === 0 && startsRewind(event, point)) {
        consume(event);
        const center = options.center();
        turning = {
          id: event.pointerId,
          dial: createDial(center, point, step),
          applied: 0,
          point,
          start: Math.atan2(point.y - center.y, point.x - center.x)
        };
        show();
        return;
      }

      fingers.add(event.pointerId);
    },
    capture
  );
  createEventListener(
    window,
    'pointermove',
    (event) => {
      if (event.pointerType === 'pen') {
        penSeen = event.timeStamp;
        return;
      }

      if (turning?.id !== event.pointerId) {
        return;
      }

      consume(event);
      turning.point = { x: event.clientX, y: event.clientY };
      turn(turning.dial.move(turning.point));
      show();
    },
    capture
  );
  const lift = (event: PointerEvent) => {
    fingers.delete(event.pointerId);
    if (turning?.id === event.pointerId) {
      consume(event);
      turning = undefined;
      setDial(undefined);
    }
  };
  createEventListener(window, 'pointerup', lift, capture);
  createEventListener(window, 'pointercancel', lift, capture);

  return {
    /** The dial while a finger turns it. */
    dial
  };

  /** A finger landing at `point` turns the dial: on the canvas, in the pebble's halo, alone, and not a palm. */
  function startsRewind(event: PointerEvent, point: Point) {
    if (!options.enabled() || event.target !== options.canvas() || event.timeStamp - penSeen < penQuietMs) {
      return false;
    }

    if (Math.max(event.width, event.height) > palmWidth) {
      return false;
    }

    const center = options.center();
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    return distance > pebbleRadius + 4 && distance <= haloRadius;
  }

  /** Undoes or redoes toward `steps`, stopping at either end of the history, where the dial stops too. */
  function turn(steps: number) {
    if (!turning) {
      return;
    }

    while (turning.applied < steps && options.canRedo()) {
      options.redo();
      turning.applied++;
    }

    while (turning.applied > steps && options.canUndo()) {
      options.undo();
      turning.applied--;
    }

    turning.dial.limit(turning.applied);
  }

  function show() {
    if (!turning) {
      return;
    }

    const center = options.center();
    setDial({
      center,
      radius: Math.hypot(turning.point.x - center.x, turning.point.y - center.y),
      start: turning.start,
      turned: turning.dial.turned(),
      steps: turning.applied,
      step
    });
  }

  /** Gives the turning finger to the canvas, pressed where it is now, and ends the rewind. */
  function handOver() {
    const finger = turning;
    const canvas = options.canvas();
    turning = undefined;
    setDial(undefined);
    if (!finger || !canvas) {
      return;
    }

    fingers.add(finger.id);
    handing = true;
    try {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: finger.id,
          pointerType: 'touch',
          isPrimary: true,
          clientX: finger.point.x,
          clientY: finger.point.y,
          button: 0,
          buttons: 1,
          width: 1,
          height: 1,
          pressure: 0.5,
          bubbles: true,
          cancelable: true,
          composed: true
        })
      );
    } finally {
      handing = false;
    }
  }
}

/** A dial being turned, for drawing it: the finger's circle, where it started and how far it turned (radians). */
export type RewindDial = {
  center: Point;
  radius: number;
  start: number;
  turned: number;
  /** Undo (negative) or redo (positive) steps taken. */
  steps: number;
  /** The angle of one step, in radians. */
  step: number;
};

/** Angle per history step. */
const step = (24 * Math.PI) / 180;
/** How far from the pebble's center a finger may land to start a rewind: a band about 100 pixels wide around it. */
const haloRadius = pebbleRadius + 110;
/** Touches this soon after a pen was seen, in milliseconds, are taken for the hand holding it. */
const penQuietMs = 600;
/** Contacts wider than this, in CSS pixels, are taken for a palm. */
const palmWidth = 56;
