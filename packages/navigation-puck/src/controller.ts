import { createSignal } from 'solid-js';

/** Shared 2D/3D gestures, selection, snapping and held/one-shot navigation lifecycle. */
export function createNavigationPuck(params: {
  /** View bounds and all pointer/gesture coordinates use client CSS pixels. */
  viewport: () => { left: number; top: number; width: number; height: number };
  mode: () => '2d' | '3d';
  /** Clockwise screen angle in radians, independent of the camera's internal roll convention. */
  rotation: () => number;
  transform: (gesture: PuckTransform) => void;
  /** Orbit deltas match Grease's 0.006/0.005 radian-per-pixel convention. Called only in 3D. */
  orbit: (dx: number, dy: number) => void;
}) {
  const [position, setPosition] = createSignal<Point | undefined>(undefined, { ownedWrite: true });
  const [activeAction, setActiveAction] = createSignal<PuckAction | undefined>(undefined, { ownedWrite: true });
  const diameter = () => Math.max(1, Math.min(260, params.viewport().width - 16, params.viewport().height - 16));
  const viewportCenter = () => ({
    x: params.viewport().left + params.viewport().width / 2,
    y: params.viewport().top + params.viewport().height / 2
  });
  const center = () => {
    const point = position();
    if (!point) return;
    const inset = diameter() / 2 + 8;
    return {
      x: Math.max(
        params.viewport().left + inset,
        Math.min(params.viewport().left + params.viewport().width - inset, point.x)
      ),
      y: Math.max(
        params.viewport().top + inset,
        Math.min(params.viewport().top + params.viewport().height - inset, point.y)
      )
    };
  };
  let invocation: 'held' | 'once' = 'once';
  let drag:
    | {
        pointerId: number;
        previous: PuckPointer;
        action: PuckAction;
        initialAngle: number;
        rotation: number;
        applied: number;
        orbitX: number;
        orbitY: number;
        appliedOrbitX: number;
        appliedOrbitY: number;
      }
    | undefined;
  const close = () => {
    drag = undefined;
    setActiveAction(undefined);
    setPosition(undefined);
  };
  return {
    center,
    mode: params.mode,
    diameter,
    activeAction,
    close,
    /** A held Space invocation returns to the release point after each operation. */
    open(point: Point = viewportCenter(), source: 'held' | 'once' = 'once') {
      close();
      invocation = source;
      setPosition(point);
    },
    releaseHotkey() {
      if (invocation !== 'held') return;
      invocation = 'once';
      if (!drag) close();
    },
    /** Right-drag selects the pictured zone after 30px travel; the center has a 12px dead zone. */
    actionAt(point: Point, origin: Point): PuckAction | undefined {
      const anchor = center();
      if (!anchor || Math.hypot(point.x - origin.x, point.y - origin.y) < 30) return;
      const dx = point.x - anchor.x,
        dy = point.y - anchor.y;
      if (Math.hypot(dx, dy) <= 12) return;
      const x = dx / diameter() + 0.5,
        y = dy / diameter() + 0.5;
      if (params.mode() === '3d') {
        if (Math.hypot(x - 0.5, y - 0.5) > 0.5) return;
        if (x > 0.8 && y < 0.2) return;
        return y < 0.5 ? (x < 0.5 ? 'zoom' : 'rotate') : x < 0.5 ? 'pan' : 'orbit';
      }
      if (x >= 0.782 && x <= 0.932 && y >= 0.071 && y <= 0.221) return;
      if (Math.hypot(x - 0.5, y - 0.5) <= 0.268) return y >= 318 / 560 ? 'zoom' : 'pan';
      if (Math.hypot(x - 0.5, y - 0.5) <= 0.46) return 'rotate';
    },
    begin(action: PuckAction, pointer: PuckPointer) {
      const anchor = center();
      if (!anchor || drag || (action === 'orbit' && params.mode() !== '3d')) return false;
      drag = {
        pointerId: pointer.pointerId,
        previous: pointer,
        action,
        initialAngle: params.rotation(),
        rotation: 0,
        applied: 0,
        orbitX: 0,
        orbitY: 0,
        appliedOrbitX: 0,
        appliedOrbitY: 0
      };
      setActiveAction(action);
      return true;
    },
    move(pointer: PuckPointer) {
      if (!drag || drag.pointerId !== pointer.pointerId) return;
      const previous = drag.previous;
      drag.previous = pointer;
      const anchor = viewportCenter();
      const dx = pointer.x - previous.x,
        dy = pointer.y - previous.y;
      if (drag.action === 'orbit') {
        drag.orbitX += dx;
        drag.orbitY += dy;
        const x = pointer.shiftKey ? snapAngle(drag.orbitX * 0.006) / 0.006 : drag.orbitX;
        const y = pointer.shiftKey ? snapAngle(drag.orbitY * 0.005) / 0.005 : drag.orbitY;
        if (params.mode() === '3d') params.orbit(x - drag.appliedOrbitX, y - drag.appliedOrbitY);
        drag.appliedOrbitX = x;
        drag.appliedOrbitY = y;
        return;
      }
      let rotation = 0;
      if (drag.action === 'rotate') {
        if (
          Math.hypot(previous.x - anchor.x, previous.y - anchor.y) < 16 ||
          Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) < 16
        )
          return;
        const angle =
          Math.atan2(pointer.y - anchor.y, pointer.x - anchor.x) -
          Math.atan2(previous.y - anchor.y, previous.x - anchor.x);
        drag.rotation += Math.atan2(Math.sin(angle), Math.cos(angle));
        // Accumulate before snapping, so small pointer moves are never lost.
        const applied = pointer.shiftKey
          ? snapAngle(drag.initialAngle + drag.rotation) - drag.initialAngle
          : drag.rotation;
        rotation = applied - drag.applied;
        drag.applied = applied;
      }
      params.transform({
        from: drag.action === 'pan' ? previous : anchor,
        to: drag.action === 'pan' ? pointer : anchor,
        scale: drag.action === 'zoom' ? 1 / Math.max(0.01, 1 + dy * 0.002) : 1,
        rotation
      });
    },
    end(pointerId: number) {
      if (drag?.pointerId !== pointerId) return;
      const point = drag.previous;
      drag = undefined;
      setActiveAction(undefined);
      if (invocation === 'held') setPosition(point);
      else close();
    },
    cancel(pointerId: number) {
      if (drag?.pointerId === pointerId) close();
    },
    /** Discrete keyboard navigation uses the same viewport-center pivot as dragging. */
    nudge(action: PuckAction, dx: number, dy: number) {
      if (!center()) return;
      if (action === 'orbit') {
        if (params.mode() === '3d') params.orbit(dx, dy);
        return;
      }
      const anchor = viewportCenter();
      params.transform({
        from: anchor,
        to: action === 'pan' ? { x: anchor.x + dx, y: anchor.y + dy } : anchor,
        scale: action === 'zoom' ? Math.exp((dx - dy) * 0.01) : 1,
        rotation: action === 'rotate' ? (dx - dy) * 0.01 : 0
      });
    }
  };
}

/** Shared actions; orbit is enabled only in 3D. */
export type PuckAction = 'pan' | 'zoom' | 'rotate' | 'orbit';
/** A point in client CSS pixels. */
export type Point = { x: number; y: number };
/** Incremental camera-independent transform; rotation is clockwise on screen. */
export type PuckTransform = { from: Point; to: Point; scale: number; rotation: number };
/** Pointer coordinates use the same client space as viewport bounds. */
export type PuckPointer = Point & { pointerId: number; shiftKey?: boolean };
function snapAngle(angle: number) {
  const step = Math.PI / 12;
  return Math.round(angle / step) * step;
}
