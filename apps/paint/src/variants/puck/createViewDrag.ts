import { panCamera, transformAt, type Camera, type Point, type ViewSize } from '@app-game/paint-core/camera';
import { createSignal } from 'solid-js';

/**
 * Pan, zoom and rotate drags of the QuickMenu's buttons, its opening flick and its held digit keys, on the session's
 * camera, with the kind in progress as a signal so that the cluster can fade meanwhile. Zoom and rotate pivot on the
 * point given to `start`, the QuickMenu's center, so that the view turns and scales around where the menu opened,
 * not around the middle of the window. Points are client pixels. Must be created within a Solid owner.
 */
export function createViewDrag(options: {
  /** The camera as gesture handlers read it. */
  camera: () => Camera;
  navigate: (camera: Camera) => void;
  /** The canvas size in CSS pixels. */
  size: () => ViewSize;
  /** The canvas's top-left corner in client pixels. */
  origin: () => Point;
}) {
  const [kind, setKind] = createSignal<ViewDragKind>();
  let active: ViewDragState | undefined;
  const local = (point: Point) => {
    const origin = options.origin();
    return { x: point.x - origin.x, y: point.y - origin.y };
  };

  return {
    /** The drag in progress. */
    kind,
    /** Starts a drag at `at`; zoom and rotate pivot on `pivot`. */
    start(next: ViewDragKind, at: Point, pivot: Point) {
      const from = local(at);
      const center = local(pivot);
      active = {
        kind: next,
        last: from,
        pivot: center,
        pointerAngle: Math.atan2(from.y - center.y, from.x - center.x),
        swept: 0,
        startAngle: options.camera().angle
      };
      setKind(next);
    },
    /** Follows the pointer; Shift snaps rotation to 15° steps. */
    move(at: Point, shift = false) {
      if (!active) {
        return;
      }

      const dragged = draggedCamera(active, local(at), shift, options.camera(), options.size());
      active = dragged.drag;
      options.navigate(dragged.camera);
    },
    end() {
      active = undefined;
      setKind(undefined);
    },
    /** Sets the zoom to `zoom` around `pivot`, as the 100% button does. */
    zoomTo(zoom: number, pivot: Point) {
      options.navigate(transformAt(options.camera(), options.size(), local(pivot), zoom));
    },
    /** Multiplies the zoom by `factor` around `pivot`, for the wheel. */
    zoomBy(factor: number, pivot: Point) {
      const camera = options.camera();
      options.navigate(transformAt(camera, options.size(), local(pivot), camera.zoom * factor));
    },
    /** Turns the view by `degrees` clockwise around `pivot`, for the wheel. */
    rotateBy(degrees: number, pivot: Point) {
      const camera = options.camera();
      options.navigate(
        transformAt(camera, options.size(), local(pivot), camera.zoom, camera.angle + (degrees * Math.PI) / 180)
      );
    },
    /** Moves the drawing by a screen distance, for the wheel. */
    pan(dx: number, dy: number) {
      options.navigate(panCamera(options.camera(), options.size(), { x: dx, y: dy }));
    }
  };
}

/** The view drags of the cluster. */
export type ViewDrag = ReturnType<typeof createViewDrag>;

/** What a view drag changes. */
export type ViewDragKind = 'pan' | 'zoom' | 'rotate';

/** A view drag in progress, in canvas pixels: the pointer's previous point, the pivot and the rotation so far. */
export type ViewDragState = {
  kind: ViewDragKind;
  last: Point;
  pivot: Point;
  /** The pointer's direction from the pivot at its previous point outside the dead radius, in radians. */
  pointerAngle: number;
  /** The angle the pointer has swept around the pivot since the press, clockwise, in radians; may pass a turn. */
  swept: number;
  /** The camera's clockwise angle at the press, in radians. */
  startAngle: number;
};

/**
 * The camera after the pointer of `drag` moved to `to` (canvas pixels), and the drag's next state:
 *
 * - `pan` moves the drawing with the pointer;
 * - `zoom` scales by the vertical move, up zooms in (×2 per 115 px), around the pivot;
 * - `rotate` turns the view by the angle the pointer swept around the pivot since the press, also past a whole turn,
 *   so that the drawing follows the pointer like a turntable; with `shift` the angle snaps to 15° steps. Within
 *   24 px of the pivot, where the direction is unstable, the camera stays.
 */
export function draggedCamera(drag: ViewDragState, to: Point, shift: boolean, camera: Camera, size: ViewSize) {
  const next = { ...drag, last: to };
  if (drag.kind === 'pan') {
    return { drag: next, camera: panCamera(camera, size, { x: to.x - drag.last.x, y: to.y - drag.last.y }) };
  }

  if (drag.kind === 'zoom') {
    const zoom = camera.zoom * 2 ** (-(to.y - drag.last.y) / zoomDoubling);
    return { drag: next, camera: transformAt(camera, size, drag.pivot, zoom) };
  }

  if (Math.hypot(to.x - drag.pivot.x, to.y - drag.pivot.y) < rotateDeadRadius) {
    return { drag: next, camera };
  }

  const pointerAngle = Math.atan2(to.y - drag.pivot.y, to.x - drag.pivot.x);
  const step = pointerAngle - drag.pointerAngle;
  const swept = drag.swept + Math.atan2(Math.sin(step), Math.cos(step));
  const angle = shift ? Math.round((drag.startAngle + swept) / snapStep) * snapStep : drag.startAngle + swept;
  return {
    drag: { ...next, pointerAngle, swept },
    camera: transformAt(camera, size, drag.pivot, camera.zoom, angle)
  };
}

/** Pixels of upward drag that double the zoom. */
const zoomDoubling = 115;
/** Rotation ignores the pointer this close to the pivot. */
const rotateDeadRadius = 24;
/** Shift snaps rotation to multiples of 15°. */
const snapStep = Math.PI / 12;
