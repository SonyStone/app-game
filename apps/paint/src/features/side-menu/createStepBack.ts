import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, type Accessor } from 'solid-js';

/**
 * Stepping back from the easel: `fingers` touches pinching together on `target` shrink the content toward the side
 * menu's card, following the fingers (`progress`, for `SideMenu`). Lifting a finger once the pinch is past half way
 * opens the menu through `onCommit`; earlier, the content springs back.
 *
 * Fewer fingers are left alone, so two still zoom and pan. The content may already have moved under the first fingers
 * before the last one landed: `snapshot` runs when the first finger lands, and the function it returns runs when the
 * pinch takes over, to undo that (Paint puts the camera back). From then on, until every finger is up, touch moves
 * stop at `target`'s capture phase, so its descendants see no movement; downs and ups pass, so they keep count.
 *
 * Must be created within a Solid owner; the listeners follow `target` and detach while `enabled` is false.
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
  const touches = new Map<number, Point>();
  /** Undoes what the first fingers did, from `snapshot`; until the pinch takes over. */
  let restore: (() => void) | void;
  /** The fingers' spread when the pinch took over; `undefined` until it does. */
  let startSpread: number | undefined;
  /** The pinch's progress, readable in the same event as it is written, unlike the signal. */
  let current = 0;
  /** Whether a finger lifted after the pinch took over; the remaining fingers stay held until they lift. */
  let finished = false;
  /** Whether this touch session pinched visibly; see `pinched`. */
  let pinched = false;
  const target = () => (options.enabled() ? options.target() : undefined);

  createEventListener(
    target,
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }

      if (!touches.size) {
        restore = options.snapshot?.();
        startSpread = undefined;
        finished = false;
        pinched = false;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === fingers && startSpread === undefined && !finished) {
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
    target,
    'pointermove',
    (event) => {
      if (!touches.has(event.pointerId)) {
        return;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (startSpread === undefined && !finished) {
        return;
      }

      event.stopPropagation();
      if (!finished && startSpread !== undefined) {
        current = stepBackProgress(startSpread, spread([...touches.values()]));
        pinched ||= current > tapSlop;
        setProgress(current);
      }
    },
    { capture: true }
  );
  createEventListener(
    target,
    ['pointerup', 'pointercancel'],
    (event) => {
      if (!touches.delete(event.pointerId)) {
        return;
      }

      if (startSpread !== undefined && !finished) {
        finished = true;
        setProgress(undefined);
        if (event.type === 'pointerup' && current >= commitAt) {
          options.onCommit();
        }
      }

      if (!touches.size) {
        startSpread = undefined;
        restore = undefined;
      }
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
