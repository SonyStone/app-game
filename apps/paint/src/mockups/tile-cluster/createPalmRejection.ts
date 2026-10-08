import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Palm rejection on the drawing hand's side only: while the pen is near, a touch that lands on the pen hand's side of
 * the pen (left of it for a left hand, right for a right hand) is ignored, so the palm resting beside the pen neither
 * pans, opens the cluster nor presses its controls. Touches on the other side, from the free hand, pass at once.
 *
 * The pen counts as near for `linger` milliseconds after its last event (hovering or touching), and no longer once it
 * reports leaving the window or its hover range. It listens on the window in the capture phase and stops ignored
 * touches before any other handler or element sees them, including the click they would cause, so it must be
 * created before other window listeners. Must be created within a Solid owner.
 */
export function createPalmRejection(options: {
  enabled: Accessor<boolean>;
  /** The hand that holds the pen. */
  hand: Accessor<'left' | 'right'>;
  /** CSS pixels from the pen's x to the palm side's edge, toward the free hand; negative stops short of the pen. */
  tolerance: Accessor<number>;
  /** Milliseconds after the pen's last event during which it counts as near. */
  linger: Accessor<number>;
}) {
  /** The pen's x while it counts as near. */
  const [penX, setPenX] = createSignal<number>();
  /** The pen's last event, for showing what the browser reports. */
  const [lastPen, setLastPen] = createSignal<{ type: string; time: number }>();
  /** Touches being ignored, by pointer, with where they are, for the marks. */
  const [ignored, setIgnored] = createSignal<ReadonlyMap<number, { x: number; y: number }>>(new Map());
  /** Where and when the last ignored touch lifted, to swallow the click it causes. */
  let lifted: { x: number; y: number; time: number } | undefined;
  let lapse: ReturnType<typeof setTimeout> | undefined;
  const capture = { capture: true };
  onCleanup(() => clearTimeout(lapse));

  const onPenHandSide = (x: number) => {
    const pen = penX();
    if (pen === undefined) {
      return false;
    }

    return options.hand() === 'left' ? x < pen + options.tolerance() : x > pen - options.tolerance();
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
    clearTimeout(lapse);
    lapse = setTimeout(() => setPenX(undefined), options.linger());
  };
  /** The pen reported leaving: not near any more. */
  const losePen = (event: PointerEvent) => {
    if (event.pointerType !== 'pen') {
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
      if (event.pointerType === 'touch' && options.enabled() && onPenHandSide(event.clientX)) {
        swallow(event);
        setIgnored((current) => new Map(current).set(event.pointerId, { x: event.clientX, y: event.clientY }));
      }
    },
    capture
  );
  createEventListener(
    window,
    'pointermove',
    (event) => {
      seePen(event);
      if (ignored().has(event.pointerId)) {
        swallow(event);
        setIgnored((current) => new Map(current).set(event.pointerId, { x: event.clientX, y: event.clientY }));
      }
    },
    capture
  );
  const end = (event: PointerEvent) => {
    seePen(event);
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
