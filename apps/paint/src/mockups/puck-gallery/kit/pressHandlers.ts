import type { Point } from './createSketchCanvas';

/**
 * Press-drag-lift handlers for one element, the same for the pen, a finger and the mouse's main button: the press
 * captures the pointer, so moves and the lift arrive even off the element; a lift within `tapDistance` of the press
 * is a tap. Spread the result on the element: `<div {...pressHandlers({ start, move, end })}>`. One press at a time
 * per element: other pointers are ignored until it ends.
 *
 * The press in progress is kept on the element, not in the handlers, so handlers re-created mid-press (an inline
 * spread re-runs whenever another reactive attribute of its element changes) carry on with the same press and the
 * newest callbacks. Holds no reactive state, so it can be created anywhere, also per item in a list. Elements that
 * take presses should have `touch-action: none` so that fingers do not scroll the page instead.
 */
export function pressHandlers(options: {
  /**
   * The press starts; return `false` to decline it (no capture, the event goes on). `preventDefault` has run unless
   * declined, so the press neither selects text nor moves focus.
   */
  start?: (press: Press, event: PointerEvent) => boolean | void;
  /** The pointer moved during the press; `press.delta` is the move since the previous event. */
  move?: (press: Press, event: PointerEvent) => void;
  /** The press lifted after moving at least `tapDistance` (or always, if `tap` is not given). */
  end?: (press: Press, event: PointerEvent) => void;
  /** The press lifted without moving `tapDistance` away; falls back to `end` when absent. */
  tap?: (press: Press, event: PointerEvent) => void;
  /** The press was cancelled by the browser or lost its capture; nothing should be committed. */
  cancel?: (press: Press) => void;
  /** CSS pixels a tap may move; 8 by default, a pen's and a finger's natural tremble. */
  tapDistance?: number;
}) {
  const tapDistance = options.tapDistance ?? 8;
  /** The element's press of this pointer, if one is in progress. */
  const pressOf = (event: PointerEvent) => {
    const press = presses.get(event.currentTarget as Element);
    return press?.id === event.pointerId ? press : undefined;
  };
  const update = (press: Press, event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY };
    press.delta = { x: point.x - press.point.x, y: point.y - press.point.y };
    press.point = point;
    press.moved ||= Math.hypot(point.x - press.start.x, point.y - press.start.y) >= tapDistance;
    press.shift = event.shiftKey;
  };
  const finish = (event: PointerEvent) => {
    const press = pressOf(event);
    if (!press) {
      return;
    }

    update(press, event);
    presses.delete(press.target);
    if (!press.moved && options.tap) {
      options.tap(press, event);
    } else {
      options.end?.(press, event);
    }
  };
  const cancel = (event: PointerEvent) => {
    const press = pressOf(event);
    if (!press) {
      return;
    }

    presses.delete(press.target);
    options.cancel?.(press);
  };

  return {
    onPointerDown(event: PointerEvent) {
      const target = event.currentTarget as Element;
      if (presses.has(target) || (event.pointerType === 'mouse' && event.button !== 0) || event.button === 2) {
        return;
      }

      const point = { x: event.clientX, y: event.clientY };
      const started: Press = {
        id: event.pointerId,
        pointerType: event.pointerType as Press['pointerType'],
        start: point,
        point,
        delta: { x: 0, y: 0 },
        moved: false,
        shift: event.shiftKey,
        time: event.timeStamp,
        target
      };
      event.preventDefault();
      if (options.start?.(started, event) === false) {
        return;
      }

      presses.set(target, started);
      target.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event: PointerEvent) {
      const press = pressOf(event);
      if (press) {
        update(press, event);
        options.move?.(press, event);
      }
    },
    onPointerUp: finish,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel
  };
}

/** A press in progress: where it started, where it is and whether it has moved far enough to be no tap. */
export type Press = {
  id: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  start: Point;
  point: Point;
  /** The move since the previous event. */
  delta: Point;
  moved: boolean;
  shift: boolean;
  /** The press's event time stamp, for long-press and flick timing. */
  time: number;
  /** The element that captured the press. */
  target: Element;
};

/** Presses in progress by the element that took them. */
const presses = new WeakMap<Element, Press>();
