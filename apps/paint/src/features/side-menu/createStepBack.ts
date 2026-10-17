import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, type Accessor } from 'solid-js';

/**
 * Stepping back from the easel: `fingers` touches pinching together on `target` shrink the content toward the side
 * menu's card, following the fingers (`progress`, for `SideMenu`). Once a finger lifts, the step back holds where it
 * is; when the last one lifts, a pinch past half way opens the menu through `onCommit`, and a shorter one springs back.
 * Opening only then leaves the content its every finger's lift before the menu makes it inert.
 *
 * Fewer fingers are left alone, so two still zoom and pan. The content may already have moved under the first fingers
 * before the last one landed: `snapshot` runs when the first finger lands, and the function it returns runs when the
 * pinch takes over, to undo that (Paint puts the camera back). From then on, until every finger is up, touch moves
 * stop at the window's capture phase, so the content sees no movement; downs and ups pass, so it keeps count.
 *
 * Only touches that start on `target` while `enabled` pinch. Their moves and lifts are followed on the window, and
 * also after `enabled` turns false, so a gesture always ends. Must be created within a Solid owner.
 */
export function createStepBack(options: {
  target: Accessor<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  onCommit: () => void;
  /** Touches that pinch; 3 by default, as two zoom the drawing. */
  fingers?: number;
  snapshot?: () => (() => void) | void;
}) {
  const fingers = options.fingers ?? 3;
  const [progress, setProgress] = createSignal<number>();
  /** The touches of the current session that landed on the target, by pointer. */
  const touches = new Map<number, Point>();
  /** Whether the current session may pinch: its first touch landed while enabled. */
  let armed = false;
  /** Undoes what the first fingers did, from `snapshot`; until the pinch takes over. */
  let restore: (() => void) | void;
  /** The fingers' spread when the pinch took over; `undefined` until it does. */
  let startSpread: number | undefined;
  /** The pinch's progress, readable in the same event as it is written, unlike the signal. */
  let current = 0;
  /** Whether a finger lifted since the pinch took over, which holds the step back where it is. */
  let held = false;
  /** Whether the system cancelled one of the pinching touches, which springs the step back. */
  let cancelled = false;
  /** Whether this touch session pinched visibly; see `pinched`. */
  let pinched = false;

  createEventListener(
    options.target,
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }

      if (!touches.size) {
        armed = options.enabled();
        restore = armed ? options.snapshot?.() : undefined;
        startSpread = undefined;
        held = false;
        cancelled = false;
        pinched = false;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (armed && touches.size === fingers && startSpread === undefined && !held) {
        startSpread = spread([...touches.values()]);
        current = 0;
        restore?.();
        restore = undefined;
        setProgress(0);
      }
    },
    { capture: true, passive: true }
  );
  createEventListener(
    window,
    'pointermove',
    (event) => {
      if (!touches.has(event.pointerId)) {
        return;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (startSpread === undefined) {
        return;
      }

      event.stopPropagation();
      if (!held) {
        current = stepBackProgress(startSpread, spread([...touches.values()]));
        pinched ||= current > tapSlop;
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

      if (startSpread !== undefined) {
        held = true;
        cancelled ||= event.type === 'pointercancel';
      }

      if (touches.size) {
        return;
      }

      if (startSpread !== undefined) {
        setProgress(undefined);
        if (!cancelled && current >= commitAt) {
          options.onCommit();
        }
      }

      startSpread = undefined;
      restore = undefined;
    },
    { capture: true, passive: true }
  );

  return {
    /** How far the fingers have pinched, 0 to 1, while they do; `undefined` otherwise. */
    progress,
    /**
     * Whether the latest touches pinched visibly, so that their lifting is no tap: the canvas saw no movement and
     * would take a quick pinch for a three-finger tap. Stays true until the next touch lands.
     */
    pinched: () => pinched
  };
}

/**
 * The pinch's progress, 0 to 1, from the fingers' spread when it took over to their spread now: fully stepped back
 * once the fingers are `pinchDepth` closer together.
 */
export function stepBackProgress(startSpread: number, spreadNow: number) {
  if (startSpread <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, (1 - spreadNow / startSpread) / pinchDepth));
}

/** The fingers' mean distance from their center. */
export function spread(points: readonly Point[]) {
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
  return points.reduce((sum, point) => sum + Math.hypot(point.x - center.x, point.y - center.y), 0) / points.length;
}

type Point = { x: number; y: number };

/** The share of the fingers' spread a full step back takes. */
const pinchDepth = 0.45;

/** Progress past which lifting a finger opens the menu. */
const commitAt = 0.5;

/** Progress below which a pinch may still have been a tap. */
const tapSlop = 0.1;
