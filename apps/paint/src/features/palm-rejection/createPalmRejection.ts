import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Palm rejection on the drawing hand's side only: while the pen is near, a touch that lands on the pen hand's side of
 * the pen (left of it for a left hand, right for a right hand) is ignored, so the palm resting beside the pen neither
 * pans, opens the cluster nor presses its controls. Touches on the other side, from the free hand, pass at once.
 *
 * The pen counts as near for `linger` milliseconds after its last event (hovering or touching), and no longer once it
 * reports leaving the window or its hover range. A pen that reports leaving right at its lift, as where the browser
 * reports no hovering (Chrome on the Wacom MovinkPad loses it in tabs moved into or out of an installed app), has only
 * been lifted, and still counts as near for `linger`.
 *
 * Without hovering, the palm often lands before the pen is near. With `before` above zero, the pen touching down
 * also takes back the touches on its hand's side that landed at most `before` milliseconds earlier and still touch:
 * `onRetract` receives them first, so that the app can undo what they did, then their targets get a `pointercancel`
 * and the rest of their events are ignored.
 *
 * It listens on the window in the capture phase and stops ignored touches before any other handler or element sees
 * them, including the click they would cause, so it must be created before other window listeners. Must be created
 * within a Solid owner.
 */
export function createPalmRejection(options: {
  enabled: Accessor<boolean>;
  /** The hand that holds the pen. */
  hand: Accessor<'left' | 'right'>;
  /** CSS pixels from the pen's x to the palm side's edge, toward the free hand; negative stops short of the pen. */
  tolerance: Accessor<number>;
  /** Milliseconds after the pen's last event during which it counts as near. */
  linger: Accessor<number>;
  /** How many milliseconds before the pen touches down a touch may have landed to be taken back; 0 takes none back. */
  before?: Accessor<number>;
  /** Receives the pointer ids of touches being taken back, before their `pointercancel`. */
  onRetract?: (pointerIds: number[]) => void;
}) {
  /** The pen's x while it counts as near. */
  const [penX, setPenX] = createSignal<number>();
  /** The pen's last event, for showing what the browser reports. */
  const [lastPen, setLastPen] = createSignal<{ type: string; time: number }>();
  /** Touches being ignored, by pointer, with where they are, for the marks. */
  const [ignored, setIgnored] = createSignal<ReadonlyMap<number, { x: number; y: number }>>(new Map());
  /** Touches that passed and still touch, with where they are, when they landed and what they landed on. */
  const passed = new Map<number, { x: number; y: number; time: number; target: EventTarget | null }>();
  /** Where and when the last ignored touch lifted, to swallow the click it causes. */
  let lifted: { x: number; y: number; time: number } | undefined;
  let lapse: ReturnType<typeof setTimeout> | undefined;
  /** The pen was lifted and has not hovered since: its leaving reports the lift, not leaving the hover range. */
  let justLifted = false;
  const capture = { capture: true };
  onCleanup(() => clearTimeout(lapse));

  const onPenHandSide = (x: number, pen = penX()) => {
    if (pen === undefined) {
      return false;
    }

    return options.hand() === 'left' ? x < pen + options.tolerance() : x > pen - options.tolerance();
  };
  const ignore = (event: PointerEvent) =>
    setIgnored((current) => new Map(current).set(event.pointerId, { x: event.clientX, y: event.clientY }));
  /** The pen touched down at `penX`: takes back the touches on its hand's side that landed just before. */
  const retract = (penX: number) => {
    const since = performance.now() - (options.before?.() ?? 0);
    const palms = [...passed].filter(([, touch]) => touch.time >= since && onPenHandSide(touch.x, penX));
    if (!palms.length) {
      return;
    }

    options.onRetract?.(palms.map(([pointerId]) => pointerId));
    for (const [pointerId, touch] of palms) {
      const { x: clientX, y: clientY } = touch;
      touch.target?.dispatchEvent(
        new PointerEvent('pointercancel', { pointerId, pointerType: 'touch', bubbles: true, clientX, clientY })
      );
      passed.delete(pointerId);
      setIgnored((current) => new Map(current).set(pointerId, { x: touch.x, y: touch.y }));
    }
  };
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  /** The pen is near: from its event until `linger` passes without another. */
  const seePen = (event: PointerEvent) => {
    if (event.pointerType !== 'pen') {
      return;
    }

    setLastPen({ type: event.type, time: performance.now() });
    setPenX(event.clientX);
    justLifted = event.type === 'pointerup' || event.type === 'pointercancel';
    clearTimeout(lapse);
    lapse = setTimeout(() => setPenX(undefined), options.linger());
  };
  /** The pen reported leaving: not near any more, unless it was only lifted. */
  const losePen = (event: PointerEvent) => {
    if (event.pointerType !== 'pen' || justLifted) {
      return;
    }

    setLastPen({ type: event.type, time: performance.now() });
    clearTimeout(lapse);
    setPenX(undefined);
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      seePen(event);
      if (event.pointerType === 'pen' && options.enabled() && options.before?.()) {
        retract(event.clientX);
      }

      if (event.pointerType !== 'touch') {
        return;
      }

      if (options.enabled() && onPenHandSide(event.clientX)) {
        swallow(event);
        ignore(event);
      } else {
        passed.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
          target: event.target
        });
      }
    },
    capture
  );
  createEventListener(
    window,
    'pointermove',
    (event) => {
      seePen(event);
      const touch = passed.get(event.pointerId);
      if (touch) {
        touch.x = event.clientX;
        touch.y = event.clientY;
      }

      if (ignored().has(event.pointerId)) {
        swallow(event);
        ignore(event);
      }
    },
    capture
  );
  const end = (event: PointerEvent) => {
    seePen(event);
    passed.delete(event.pointerId);
    if (ignored().has(event.pointerId)) {
      swallow(event);
      lifted = { x: event.clientX, y: event.clientY, time: performance.now() };
      setIgnored((current) => {
        const next = new Map(current);
        next.delete(event.pointerId);
        return next;
      });
    }
  };
  createEventListener(window, 'pointerup', end, capture);
  createEventListener(window, 'pointercancel', end, capture);
  // A pen leaving the window or its hover range sends `pointerout` without a related target, or `pointerleave`
  // on the document.
  createEventListener(
    window,
    'pointerout',
    (event) => {
      if (!event.relatedTarget) {
        losePen(event);
      }
    },
    capture
  );
  createEventListener(document.documentElement, 'pointerleave', losePen);
  createEventListener(
    window,
    'click',
    (event) => {
      if (
        lifted &&
        performance.now() - lifted.time < clickWindowMs &&
        Math.hypot(event.clientX - lifted.x, event.clientY - lifted.y) < clickSlop
      ) {
        swallow(event);
      }
    },
    capture
  );

  return {
    /** Where ignored touches are, for showing them while testing. */
    ignored: () => [...ignored().values()],
    /**
     * The guarded area while the pen is near: touches between `left` and `right` count as the palm. Undefined while
     * palm rejection is off or the pen is away.
     */
    zone: () => {
      const x = penX();
      if (x === undefined || !options.enabled()) {
        return undefined;
      }

      return options.hand() === 'left'
        ? { left: 0, right: Math.max(0, x + options.tolerance()) }
        : { left: Math.min(innerWidth, x - options.tolerance()), right: innerWidth };
    },
    /** The pen's last event type and time (`performance.now()`), for showing what the browser reports. */
    lastPen
  };
}

/** How soon and how near a click follows an ignored touch's lift for it to be that touch's click. */
const clickWindowMs = 500;
const clickSlop = 30;
