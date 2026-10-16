import { createEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';
import { maxZoom, minZoom, type Camera, type createCanvasCamera } from './createCanvasCamera';

/**
 * Moves the component canvas by hand, leaving components their own input:
 *
 * - The pen never moves the canvas.
 * - One finger works a component it lands on and moves the canvas from empty space (the background, a group's frame)
 *   or from an element marked `data-canvas-touch-pans`, such as a test strip that only the pen draws on.
 * - Two fingers anywhere pan and pinch. A component that the first finger was working gets a `pointercancel` and sees
 *   no more of either touch.
 * - The mouse's left button moves the canvas from empty space; the middle button, or the left one with Space held
 *   while no component has focus, moves it from anywhere. The wheel and trackpad pan; with Ctrl or ⌘, and the
 *   trackpad's pinch, they zoom around the pointer.
 *
 * Components are elements inside `data-canvas-content`; the canvas's own controls, inside `data-canvas-ui`, keep their
 * input. Listens on the window in the capture phase, so create it after palm rejection, which must see touches first.
 * `paused` stops it for whatever covers the canvas, as the wheel only reaches the viewport anyway.
 * Must be created within a Solid owner.
 */
export function createCanvasGestures(options: {
  viewport: () => HTMLElement | undefined;
  camera: ReturnType<typeof createCanvasCamera>;
  /** While true, such as while a whole UI is open over the canvas, the canvas takes no presses, wheel or keys. */
  paused?: () => boolean;
}) {
  const { camera } = options;
  /** Fingers down on the canvas, in landing order, with the camera when they landed. */
  const touches = new Map<number, TrackedTouch>();
  /**
   * Pointers that move the canvas, with how far they travelled: components see none of their events after the press,
   * nor a click once they moved or were taken back from a component.
   */
  const owned = new Map<number, { from: Point; travel: number; takenBack: boolean }>();
  let pan: { pointerId: number; x: number; y: number } | undefined;
  let pinch: { ids: [number, number]; camera: Camera; center: Point; distance: number } | undefined;
  let spaceHeld = false;
  /** The canvas is sending a component the `pointercancel` that takes a finger back from it. */
  let cancelling = false;
  /** Where and when a press that components did not see lifted, to swallow the click it causes. */
  let lifted: { x: number; y: number; time: number } | undefined;
  const capture = { capture: true };

  const classify = (event: PointerEvent): 'outside' | 'ui' | 'empty' | 'strip' | 'component' => {
    const viewport = options.viewport();
    const target = event.target instanceof Element ? event.target : undefined;
    if (!viewport || !target || !viewport.contains(target)) {
      return 'outside';
    }

    if (target.closest('[data-canvas-ui]')) {
      return 'ui';
    }

    if (event.pointerType === 'touch' && target.closest('[data-canvas-touch-pans]')) {
      return 'strip';
    }

    return target.closest('[data-canvas-content]') ? 'component' : 'empty';
  };
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  /** Starts a pinch with the first two fingers, taking the first one back from the component it was working. */
  const startPinch = () => {
    const [first, second] = [...touches];
    if (!first || !second) {
      return;
    }

    for (const [pointerId, touch] of [first, second]) {
      if (!owned.has(pointerId)) {
        owned.set(pointerId, { from: { x: touch.x, y: touch.y }, travel: 0, takenBack: true });
        // The canvas's own listeners let this one through to the component.
        cancelling = true;
        touch.target?.dispatchEvent(
          new PointerEvent('pointercancel', {
            pointerId,
            pointerType: 'touch',
            bubbles: true,
            clientX: touch.x,
            clientY: touch.y
          })
        );
        cancelling = false;
      }
    }

    pan = undefined;
    pinch = { ids: [first[0], second[0]], camera: camera.current(), ...pinchMetrics(first[1], second[1]) };
  };
  const reset = () => {
    touches.clear();
    owned.clear();
    pan = undefined;
    pinch = undefined;
    spaceHeld = false;
    options.viewport()?.removeAttribute('data-space-pan');
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (options.paused?.()) {
        return;
      }

      const kind = classify(event);
      if (kind === 'outside' || kind === 'ui' || event.pointerType === 'pen') {
        return;
      }

      const point = { x: event.clientX, y: event.clientY };

      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { ...point, target: event.target, camera: camera.current() });
        if (touches.size === 2) {
          swallow(event);
          owned.set(event.pointerId, { from: point, travel: 0, takenBack: true });
          startPinch();
        } else if (touches.size > 2) {
          swallow(event);
          owned.set(event.pointerId, { from: point, travel: 0, takenBack: true });
        } else if (kind !== 'component') {
          if (kind === 'strip') {
            swallow(event);
          }

          owned.set(event.pointerId, { from: point, travel: 0, takenBack: false });
          pan = { pointerId: event.pointerId, ...point };
        }

        return;
      }

      // The mouse.
      const fromAnywhere = event.button === 1 || (event.button === 0 && spaceHeld);
      if (pan || !(fromAnywhere || (event.button === 0 && kind === 'empty'))) {
        return;
      }

      if (kind === 'component' || event.button === 1) {
        swallow(event);
      }

      owned.set(event.pointerId, { from: point, travel: 0, takenBack: kind === 'component' });
      pan = { pointerId: event.pointerId, ...point };
    },
    capture
  );
  createEventListener(
    window,
    'pointermove',
    (event) => {
      const touch = touches.get(event.pointerId);
      if (touch) {
        touch.x = event.clientX;
        touch.y = event.clientY;
      }

      if (pinch?.ids.includes(event.pointerId)) {
        const a = touches.get(pinch.ids[0]);
        const b = touches.get(pinch.ids[1]);
        if (a && b) {
          const { center, distance } = pinchMetrics(a, b);
          const start = pinch.camera;
          const zoom = Math.min(maxZoom, Math.max(minZoom, (start.zoom * distance) / Math.max(1, pinch.distance)));
          // The world point under the pinch's starting center stays under its current center.
          const worldX = (pinch.center.x - start.x) / start.zoom;
          const worldY = (pinch.center.y - start.y) / start.zoom;
          camera.set({ x: center.x - worldX * zoom, y: center.y - worldY * zoom, zoom });
        }
      } else if (pan?.pointerId === event.pointerId) {
        camera.panBy(event.clientX - pan.x, event.clientY - pan.y);
        pan.x = event.clientX;
        pan.y = event.clientY;
      }

      const press = owned.get(event.pointerId);
      if (press) {
        press.travel = Math.max(press.travel, Math.hypot(event.clientX - press.from.x, event.clientY - press.from.y));
        swallow(event);
      }
    },
    capture
  );
  const end = (event: PointerEvent) => {
    if (cancelling) {
      return;
    }

    const press = owned.get(event.pointerId);
    owned.delete(event.pointerId);
    touches.delete(event.pointerId);

    if (pinch?.ids.includes(event.pointerId)) {
      pinch = undefined;
      // The finger left of the pinch keeps panning.
      const remaining = [...touches].find(([pointerId]) => owned.has(pointerId));
      if (remaining) {
        pan = { pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y };
      }
    }

    if (pan?.pointerId === event.pointerId) {
      pan = undefined;
    }

    if (press) {
      swallow(event);
      if (press.takenBack || press.travel > tapSlop) {
        lifted = { x: event.clientX, y: event.clientY, time: performance.now() };
      }
    }
  };
  createEventListener(window, 'pointerup', end, capture);
  createEventListener(window, 'pointercancel', end, capture);
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

  createEventListener(
    () => options.viewport(),
    'wheel',
    (event) => {
      if (event.target instanceof Element && event.target.closest('[data-canvas-ui]')) {
        return;
      }

      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        const delta = Math.max(-100, Math.min(100, event.deltaY * scale));
        camera.zoomAt({ x: event.clientX, y: event.clientY }, 2 ** (-delta / 250));
      } else {
        camera.panBy(-event.deltaX * scale, -event.deltaY * scale);
      }
    },
    { passive: false }
  );

  createEventListener(window, 'keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || options.paused?.() || componentHasFocus(options.viewport())) {
      return;
    }

    event.preventDefault();
    spaceHeld = true;
    options.viewport()?.setAttribute('data-space-pan', '');
  });
  createEventListener(window, 'keyup', (event) => {
    if (event.code === 'Space') {
      spaceHeld = false;
      options.viewport()?.removeAttribute('data-space-pan');
    }
  });
  createEventListener(window, 'blur', reset);
  createEventListener(document, 'visibilitychange', reset);
  // iPad Safari zooms the page on a pinch despite `touch-action`.
  createEventListener(document, 'gesturestart', (event) => event.preventDefault(), { passive: false });
  onCleanup(reset);

  return {
    /**
     * Puts the camera back where it was when the earliest of `pointerIds` landed: for palm rejection taking back
     * touches that turned out to be the palm.
     */
    retract(pointerIds: number[]) {
      const cameras = pointerIds.flatMap((pointerId) => touches.get(pointerId)?.camera ?? []);
      if (cameras[0]) {
        camera.set(cameras[0]);
      }
    }
  };
}

type Point = { x: number; y: number };

type TrackedTouch = Point & { target: EventTarget | null; camera: Camera };

function pinchMetrics(a: Point, b: Point) {
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}

/** Whether keyboard focus is in a component, which keeps its own Space. */
function componentHasFocus(viewport: HTMLElement | undefined) {
  const focused = document.activeElement;
  return !!focused && focused !== document.body && focused !== viewport && !!viewport?.contains(focused);
}

/** How soon and how near a click follows a canvas move's lift for it to be that move's click. */
const clickWindowMs = 500;
const clickSlop = 30;
/** CSS pixels a press may travel and still click what it pressed, such as a star. */
const tapSlop = 8;
