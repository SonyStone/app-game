import type { Point } from '../../kit/createSketchCanvas';
import { listenOnScreen, useScreen } from '../../kit/screen';

/**
 * Procreate's quick taps with several fingers on the drawing, reported as the number of fingers. A tap counts when
 * every finger went down and up within `quickTap` ms of the first one touching, none moved more than 10 px, and none
 * touched the HUD. Listens to the variant's screen in the capture phase and never consumes the events, so the stage's
 * own pinch and pan go on as usual. Must be called within the variant's owner; the listeners go with it.
 */
export function createFingerTaps(tapped: (fingers: number) => void) {
  let gesture: { started: number; at: Map<number, Point>; down: number; most: number; spoiled: boolean } | undefined;
  const capture = { capture: true };
  const screen = useScreen();

  listenOnScreen(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }

      if (!gesture || gesture.down === 0) {
        gesture = { started: event.timeStamp, at: new Map(), down: 0, most: 0, spoiled: false };
      }

      gesture.at.set(event.pointerId, screen.point(event));
      gesture.down += 1;
      gesture.most = Math.max(gesture.most, gesture.down);
      const onUi = event.target instanceof Element && !!event.target.closest('[data-gallery-ui]');
      gesture.spoiled ||= onUi || event.timeStamp - gesture.started > quickTap;
    },
    capture
  );
  listenOnScreen(
    'pointermove',
    (event) => {
      const start = gesture?.at.get(event.pointerId);
      if (!gesture || !start) {
        return;
      }

      const at = screen.point(event);
      if (Math.hypot(at.x - start.x, at.y - start.y) > 10) {
        gesture.spoiled = true;
      }
    },
    capture
  );
  const lift = (event: PointerEvent) => {
    if (!gesture?.at.has(event.pointerId)) {
      return;
    }

    gesture.at.delete(event.pointerId);
    gesture.down -= 1;
    gesture.spoiled ||= event.type === 'pointercancel' || event.timeStamp - gesture.started > quickTap;
    if (gesture.down > 0) {
      return;
    }

    const ended = gesture;
    gesture = undefined;
    if (!ended.spoiled && ended.most >= 2) {
      tapped(ended.most);
    }
  };
  listenOnScreen('pointerup', lift, capture);
  listenOnScreen('pointercancel', lift, capture);
}

/** How long a multi-finger tap may take from the first touch to the last lift, in ms. */
const quickTap = 260;
