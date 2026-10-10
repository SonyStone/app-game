import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';
import {
  dodgePlacement,
  pebbleRadius,
  placementPoint,
  snapPlacement,
  type Placement,
  type Point,
  type ViewSize
} from './placement';

/**
 * Where the pebble is on screen: at its resting place, carried under a finger or pen, or slid aside out of a hovering
 * pen's way. A pen that lingers near the resting place (`near` pixels, for `dwellMs`) without hovering over the
 * pebble itself makes it slide along the screen's edge; a pen heading for the pebble reaches it before then, so it
 * can still be tapped. The pebble returns once the pen moves `far` away or leaves the screen. Must be created within
 * a Solid owner.
 */
export function createPebble(options: {
  /** The resting place. */
  placement: () => Placement;
  setPlacement: (placement: Placement) => void;
  view: () => ViewSize;
  /** The pebble must stay put: it is pressed or its fan is open. */
  still: () => boolean;
}) {
  const [carried, setCarried] = createSignal<Point>();
  const [dodged, setDodged] = createSignal<Placement>();
  let dwell: ReturnType<typeof setTimeout> | undefined;
  /** The hovering pen's latest point near the pebble, which the pebble slides away from. */
  let lastPen: Point | undefined;
  const stopDwell = () => {
    clearTimeout(dwell);
    dwell = undefined;
  };
  onCleanup(stopDwell);

  createEventListener(
    window,
    'pointermove',
    (event) => {
      if (event.pointerType === 'pen' && event.buttons === 0) {
        hover({ x: event.clientX, y: event.clientY });
      }
    },
    { capture: true, passive: true }
  );
  // A pen leaving the screen's hover range goes out to no element.
  createEventListener(
    window,
    'pointerout',
    (event) => {
      if (event.pointerType === 'pen' && !event.relatedTarget) {
        stopDwell();
        setDodged(undefined);
      }
    },
    { capture: true, passive: true }
  );

  const center = () => carried() ?? placementPoint(dodged() ?? options.placement(), options.view());

  return {
    /** The pebble's center in client pixels. */
    center,
    /** The pebble is carried to a new place. */
    carried: () => carried() !== undefined,
    /** The pebble has slid out of the pen's way. */
    dodged: () => dodged() !== undefined,
    /** Moves the carried pebble under `point`. */
    carry(point: Point) {
      stopDwell();
      setDodged(undefined);
      setCarried(point);
    },
    /** Puts the carried pebble down at the place nearest `point`, which becomes its resting place. */
    drop(point: Point) {
      setCarried(undefined);
      options.setPlacement(snapPlacement(point, options.view()));
    }
  };

  function hover(pen: Point) {
    if (options.still() || carried()) {
      stopDwell();
      return;
    }

    const current = center();
    if (Math.hypot(pen.x - current.x, pen.y - current.y) <= pebbleRadius + 6) {
      stopDwell();
      return;
    }

    const home = placementPoint(options.placement(), options.view());
    const distance = Math.hypot(pen.x - home.x, pen.y - home.y);
    if (distance > far) {
      stopDwell();
      setDodged(undefined);
      return;
    }

    lastPen = pen;
    if (distance > near) {
      stopDwell();
      return;
    }

    if (dodged() || dwell !== undefined) {
      return;
    }

    dwell = setTimeout(() => {
      dwell = undefined;
      if (!options.still() && lastPen) {
        setDodged(dodgePlacement(options.placement(), options.view(), lastPen, slide));
      }
    }, dwellMs);
  }
}

/** Distance from the resting place, in CSS pixels, within which a lingering pen moves the pebble aside. */
const near = 72;
/** Distance from the resting place beyond which the pebble returns. */
const far = 132;
/** How far the pebble slides along the edge. */
const slide = 104;
/** How long the pen must linger near the pebble, in milliseconds. */
const dwellMs = 280;
