import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';
import {
  dodgePlacement,
  pebbleRadius,
  placementAt,
  placementPoint,
  type Placement,
  type Point,
  type ViewSize
} from './placement';

/**
 * Where the pebble is on screen: at its resting place, carried by a finger, the pen or the mouse, or slid aside out of
 * a hovering pen's way. The resting place may be anywhere on screen; carried, the pebble stays fully on screen too. A
 * pen that lingers near the resting place (`near` pixels, for `dwellMs`) without hovering over the pebble itself
 * makes it slide away from the pen, along the edge when it rests against one; a pen heading for the pebble reaches it
 * before then, so it can still be tapped. The pebble returns once the pen moves `far` away or leaves the screen. Must
 * be created within a Solid owner.
 */
export function createPebble(options: {
  /** The resting place. */
  placement: () => Placement;
  setPlacement: (placement: Placement) => void;
  view: () => ViewSize;
  /** The pebble must stay put: it is pressed or its fan is open. */
  still: () => boolean;
}) {
  const [carried, setCarried] = createSignal<Placement>();
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

  const center = () => placementPoint(carried() ?? dodged() ?? options.placement(), options.view());

  return {
    /** The pebble's center in client pixels. */
    center,
    /** The pebble is carried to a new place. */
    carried: () => carried() !== undefined,
    /** The pebble has slid out of the pen's way. */
    dodged: () => dodged() !== undefined,
    /** Moves the carried pebble's center to `point`, or as near as keeps it on screen. */
    carry(point: Point) {
      stopDwell();
      setDodged(undefined);
      setCarried(placementAt(point, options.view()));
    },
    /** Puts the carried pebble down with its center at `point`, or as near as keeps it on screen, and rests it there. */
    drop(point: Point) {
      setCarried(undefined);
      options.setPlacement(placementAt(point, options.view()));
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

/**
 * Distance from the resting place's center, in CSS pixels, within which a lingering pen moves the pebble aside: a
 * band 50 pixels wide around the pebble.
 */
const near = pebbleRadius + 50;
/** Distance from the resting place beyond which the pebble returns. */
const far = near + 60;
/** How far the pebble slides: its own width and a fingertip more, so the pen is clear of it. */
const slide = 2 * pebbleRadius + 48;
/** How long the pen must linger near the pebble, in milliseconds. */
const dwellMs = 280;
