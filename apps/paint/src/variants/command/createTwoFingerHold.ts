import { createEventListener } from '@solid-primitives/event-listener';
import { onCleanup, type Accessor } from 'solid-js';

/**
 * Calls `onHold` when exactly two fingers rest still on `target` for `holdMs`, longer than a two-finger tap (undo)
 * lasts. The canvas still sees the touches as a pinch meanwhile, so `onHold` receives what `snapshot` returned when
 * the second finger landed, such as the camera, to undo the slight pan and zoom that resting fingers cause. A third
 * finger, lifting a finger or moving one further than `slop` cancels the hold. Listens in the capture phase without
 * consuming anything. Must be created within a Solid owner.
 */
export function createTwoFingerHold<T>(options: {
  target: Accessor<HTMLElement | undefined>;
  /** Runs when the second finger lands. */
  snapshot: () => T;
  onHold: (snapshot: T) => void;
}) {
  const touches = new Map<number, { x: number; y: number }>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const lift = (event: PointerEvent) => {
    if (touches.delete(event.pointerId)) {
      cancel();
    }
  };

  onCleanup(cancel);
  const listening = { capture: true, passive: true };
  createEventListener(
    options.target,
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      cancel();
      if (touches.size !== 2) {
        return;
      }

      const snapshot = options.snapshot();
      timer = setTimeout(() => {
        timer = undefined;
        options.onHold(snapshot);
      }, holdMs);
    },
    listening
  );
  createEventListener(
    options.target,
    'pointermove',
    (event) => {
      const start = touches.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop) {
        cancel();
      }
    },
    listening
  );
  createEventListener(options.target, ['pointerup', 'pointercancel'], lift, listening);
}

/** How long two fingers must rest, in milliseconds; a two-finger tap ends within 350. */
const holdMs = 550;

/** CSS pixels a resting finger may drift. */
const slop = 14;
