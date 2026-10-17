import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, type Accessor } from 'solid-js';

/**
 * Pulling the side menu out from its edge: `fingers` or more touches landing together near `target`'s edge on the
 * menu's `side` and drawn toward the middle step the content back into the side menu's card, following the fingers
 * (`progress`, for `SideMenu`). Once a finger lifts, the pull holds where it is; when the last one lifts, a pull past
 * half way opens the menu through `onCommit`, and a shorter one springs back. Opening only then leaves the content
 * its every finger's lift before the menu makes it inert.
 *
 * The fingers must land as one chord: the last within `chordWindow` of the first, before any of them has moved, with
 * their center in the outer `edgeZone` of the target. So a finger that touches down while two others turn or zoom
 * the drawing starts nothing, and fewer fingers are left alone. The content may still have moved a little under the
 * first fingers: `snapshot` runs when the first finger lands, and the function it returns runs when the pull takes
 * over, to undo that (Paint puts the camera back). From then on, until every finger is up, touch moves stop at the
 * window's capture phase, so the content sees no movement; downs and ups pass, so it keeps count.
 *
 * Only touches that start on `target` while `enabled` pull. Their moves and lifts are followed on the window, and also
 * after `enabled` turns false, so a gesture always ends. Must be created within a Solid owner.
 */
export function createEdgePull(options: {
  target: Accessor<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  onCommit: () => void;
  /** The edge the menu lies at, which the fingers pull from; `right` by default. */
  side?: 'left' | 'right';
  /** The fewest touches that pull; 3 by default, as two turn and zoom the drawing. */
  fingers?: number;
  /** CSS pixels of travel to a full pull, best the panel's width so the card's edge keeps under the fingers. */
  distance?: Accessor<number>;
  snapshot?: () => (() => void) | void;
}) {
  const fingers = options.fingers ?? 3;
  const side = options.side ?? 'right';
  const [progress, setProgress] = createSignal<number>();
  /** The touches of the current session that landed on the target, by pointer, where they landed and are now. */
  const touches = new Map<number, { start: Point; now: Point }>();
  /** Whether the current session may still pull: it began while enabled and has not missed its chord. */
  let armed = false;
  /** When the session's first finger landed, in event time. */
  let firstAt = 0;
  /** Undoes what the first fingers did, from `snapshot`; until the pull takes over. */
  let restore: (() => void) | void;
  /** The fingers' center when the pull took over, rebased as fingers join; `undefined` until it does. */
  let origin: number | undefined;
  /** The pull's progress, readable in the same event as it is written, unlike the signal. */
  let current = 0;
  /** Whether a finger lifted since the pull took over, which holds the pull where it is. */
  let held = false;
  /** Whether the system cancelled one of the pulling touches, which springs the pull back. */
  let cancelled = false;
  /** Whether this touch session pulled visibly; see `pulled`. */
  let pulled = false;

  createEventListener(
    options.target,
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }

      if (!touches.size) {
        armed = options.enabled();
        firstAt = event.timeStamp;
        restore = armed ? options.snapshot?.() : undefined;
        origin = undefined;
        held = false;
        cancelled = false;
        pulled = false;
      }

      const point = { x: event.clientX, y: event.clientY };
      const before = origin === undefined ? 0 : center(touches);
      touches.set(event.pointerId, { start: point, now: point });
      if (origin !== undefined) {
        // A finger joining the pull moves the center; the pull goes on from where it was.
        origin += center(touches) - before;
        return;
      }

      if (!armed || touches.size < fingers) {
        return;
      }

      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      if (event.timeStamp - firstAt > chordWindow || moved(touches) || !nearEdge(center(touches), bounds, side)) {
        armed = false;
        return;
      }

      origin = center(touches);
      current = 0;
      restore?.();
      restore = undefined;
      setProgress(0);
    },
    { capture: true, passive: true }
  );
  createEventListener(
    window,
    'pointermove',
    (event) => {
      const touch = touches.get(event.pointerId);
      if (!touch) {
        return;
      }

      touch.now = { x: event.clientX, y: event.clientY };
      if (origin === undefined) {
        return;
      }

      event.stopPropagation();
      if (!held) {
        const travel = side === 'right' ? origin - center(touches) : center(touches) - origin;
        current = pullProgress(travel, options.distance?.() ?? defaultDistance);
        pulled ||= current > tapSlop;
        setProgress(current);
      }
    },
    { capture: true }
  );
  createEventListener(
    window,
    ['pointerup', 'pointercancel'],
    (event) => {
      if (!touches.delete(event.pointerId)) {
        return;
      }

      if (origin !== undefined) {
        held = true;
        cancelled ||= event.type === 'pointercancel';
      }

      if (touches.size) {
        return;
      }

      if (origin !== undefined) {
        setProgress(undefined);
        if (!cancelled && current >= commitAt) {
          options.onCommit();
        }
      }

      origin = undefined;
      restore = undefined;
    },
    { capture: true, passive: true }
  );

  return {
    /** How far the fingers have pulled, 0 to 1, while they do; `undefined` otherwise. */
    progress,
    /**
     * Whether the latest touches pulled visibly, so that their lifting is no tap: the canvas saw no movement and would
     * take a quick pull for a three-finger tap. Stays true until the next touch lands.
     */
    pulled: () => pulled
  };
}

/** The pull's progress, 0 to 1, from the fingers' travel toward the middle and the travel of a full pull. */
export function pullProgress(travel: number, distance: number) {
  if (distance <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, travel / distance));
}

/** The horizontal center of the touches now. */
function center(touches: ReadonlyMap<number, { now: Point }>) {
  let sum = 0;
  for (const touch of touches.values()) {
    sum += touch.now.x;
  }

  return sum / touches.size;
}

/** Whether a touch has moved off the point it landed on, so the fingers are already at other work. */
function moved(touches: ReadonlyMap<number, { start: Point; now: Point }>) {
  for (const { start, now } of touches.values()) {
    if (Math.hypot(now.x - start.x, now.y - start.y) > chordSlop) {
      return true;
    }
  }

  return false;
}

/** Whether `x` is within the outer `edgeZone` of `bounds` on `side`. */
function nearEdge(x: number, bounds: DOMRect, side: 'left' | 'right') {
  const zone = bounds.width * edgeZone;
  return side === 'right' ? x >= bounds.right - zone : x <= bounds.left + zone;
}

type Point = { x: number; y: number };

/** Milliseconds within which the fingers of a chord land. */
const chordWindow = 250;

/** CSS pixels a finger may slide before the chord is complete. */
const chordSlop = 24;

/** The share of the target's width, on the menu's side, that the chord's center lands in. */
const edgeZone = 1 / 3;

/** CSS pixels of a full pull when the caller gives none: about the side menu's panel. */
const defaultDistance = 360;

/** Progress past which lifting the last finger opens the menu. */
const commitAt = 0.5;

/** Progress below which a pull may still have been a tap. */
const tapSlop = 0.1;
