import { createEventListener } from '@solid-primitives/event-listener';
import type { createSheet } from './createSheet';

/**
 * While `enabled`, two fingers pulled up anywhere on the page raise the box's sheet, as far as they go, and pulled down
 * lower it, as its handle does; on lift it settles the way it was flung, or on the nearest stop. One finger is left
 * alone, to select or carry parts. As the second finger lands, `onStart` drops whatever the first one began (a band,
 * a carried part, a long press), and that press reaches nothing under it. Touches only: a pen or a mouse never counts.
 */
export function createTwoFingerSheet(options: {
  enabled: () => boolean;
  sheet: ReturnType<typeof createSheet>;
  onStart: () => void;
}) {
  const touches = new Map<number, number>();
  let gesture: { startY: number; startHeight: number; lastY: number; lastTime: number; speed: number } | undefined;
  let moved = false;

  const middleY = () => {
    const ys = [...touches.values()].slice(0, 2);
    return ys.reduce((sum, y) => sum + y, 0) / ys.length;
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }

      touches.set(event.pointerId, event.clientY);
      if (touches.size !== 2 || !options.enabled()) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();
      options.onStart();
      const y = middleY();
      gesture = { startY: y, startHeight: options.sheet.height(), lastY: y, lastTime: event.timeStamp, speed: 0 };
      moved = false;
    },
    { capture: true }
  );

  createEventListener(
    window,
    'pointermove',
    (event) => {
      if (!touches.has(event.pointerId)) {
        return;
      }

      touches.set(event.pointerId, event.clientY);
      if (!gesture) {
        return;
      }

      event.stopPropagation();
      const y = middleY();
      moved ||= Math.abs(y - gesture.startY) >= startDistance;
      if (moved) {
        options.sheet.follow(gesture.startHeight + gesture.startY - y);
      }

      const time = Math.max(1, event.timeStamp - gesture.lastTime);
      gesture.speed = (gesture.lastY - y) / time;
      gesture.lastY = y;
      gesture.lastTime = event.timeStamp;
    },
    { capture: true }
  );

  const end = (event: PointerEvent) => {
    if (!touches.delete(event.pointerId) || !gesture) {
      return;
    }

    event.stopPropagation();
    const { speed } = gesture;
    gesture = undefined;
    if (moved) {
      options.sheet.settle(speed > flingSpeed ? 1 : speed < -flingSpeed ? -1 : 0);
    }
  };
  createEventListener(window, 'pointerup', end, { capture: true });
  createEventListener(window, 'pointercancel', end, { capture: true });
}

/** CSS pixels the fingers' middle must move before the sheet follows, so a two-finger tap leaves it. */
const startDistance = 8;

/** CSS pixels per millisecond a pull must end at to fling the sheet to the next stop rather than the nearest. */
const flingSpeed = 0.3;
