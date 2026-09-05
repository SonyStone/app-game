import { createSignal, type Accessor } from 'solid-js';
import type { ViewportMode } from '../../shared/viewportMode';
import type { InteractionViewport } from '../interaction/viewportPort';

/** Owns a puck drag independently of canvas editing; a second pointer cannot take it over. */
export function createNavigationPuck(params: {
  viewport: () => Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  renderer: Accessor<Pick<InteractionViewport, 'transformTouch' | 'orbit'> | undefined>;
  mode: Accessor<ViewportMode>;
  /** Current roll is used to snap to absolute 15° angles. */
  roll?: Accessor<number>;
}) {
  const [center, setCenter] = createSignal<Point>();
  const [activeAction, setActiveAction] = createSignal<PuckAction>();
  let invocation: 'held' | 'once' = 'once';
  let drag:
    | {
        pointerId: number;
        previous: Point;
        action: PuckAction;
        initialRoll: number;
        rotation: number;
        appliedRotation: number;
        orbitX: number;
        orbitY: number;
        appliedOrbitX: number;
        appliedOrbitY: number;
      }
    | undefined;
  const viewportCenter = () => {
    const rect = params.viewport();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const place = (point: Point) => {
    const rect = params.viewport();
    const clampAxis = (value: number, start: number, length: number) =>
      length < 248 ? start + length / 2 : Math.max(start + 124, Math.min(start + length - 124, value));
    setCenter({ x: clampAxis(point.x, rect.left, rect.width), y: clampAxis(point.y, rect.top, rect.height) });
  };

  const close = () => {
    drag = undefined;
    setActiveAction(undefined);
    setCenter(undefined);
  };

  return {
    center,
    activeAction,
    close,
    /** Drag-select uses the add-on's 30px threshold before choosing a quadrant. */
    actionAt(point: Point, origin: Point): PuckAction | undefined {
      const anchor = center();
      if (!anchor || Math.hypot(point.x - origin.x, point.y - origin.y) < 30) return;
      const x = point.x - anchor.x;
      const y = point.y - anchor.y;
      if (Math.hypot(x, y) <= 12 || Math.hypot(x, y) > 112) return;
      const action = y < 0 ? (x < 0 ? 'zoom' : 'rotate') : x < 0 ? 'pan' : 'orbit';
      return action === 'orbit' && params.mode() !== '3d' ? undefined : action;
    },
    /** Held hotkeys reopen at the release point; pointer/touch invocation completes one operation. */
    open(point: Point = viewportCenter(), source: 'held' | 'once' = 'once') {
      close();
      invocation = source;
      place(point);
    },
    /** Releasing Space dismisses an idle menu; an active drag keeps ownership until pointer-up. */
    releaseHotkey() {
      if (invocation !== 'held') return;
      invocation = 'once';
      if (!drag) close();
    },
    /** Pointer cancellation does not reopen the menu or leave a captured drag alive. */
    cancel(pointerId: number) {
      if (drag?.pointerId === pointerId) close();
    },
    begin(action: PuckAction, pointer: PuckPointer) {
      if (!center() || drag || (action === 'orbit' && params.mode() !== '3d')) return false;
      const anchor = center()!;
      if (Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) <= 12) return false;
      drag = {
        action,
        pointerId: pointer.pointerId,
        previous: pointer,
        initialRoll: params.roll?.() ?? 0,
        rotation: 0,
        appliedRotation: 0,
        orbitX: 0,
        orbitY: 0,
        appliedOrbitX: 0,
        appliedOrbitY: 0
      };
      setActiveAction(action);
      return true;
    },
    move(pointer: PuckPointer) {
      const anchor = viewportCenter();
      if (!drag || pointer.pointerId !== drag.pointerId || !center()) return;
      const previous = drag.previous;
      drag.previous = pointer;
      const dx = pointer.x - previous.x;
      const dy = pointer.y - previous.y;
      if (drag.action === 'orbit') {
        drag.orbitX += dx;
        drag.orbitY += dy;
        const x = pointer.shiftKey ? snapAngle(drag.orbitX * 0.006) / 0.006 : drag.orbitX;
        const y = pointer.shiftKey ? snapAngle(drag.orbitY * 0.005) / 0.005 : drag.orbitY;
        if (params.mode() === '3d') params.renderer()?.orbit(x - drag.appliedOrbitX, y - drag.appliedOrbitY);
        drag.appliedOrbitX = x;
        drag.appliedOrbitY = y;
        return;
      }
      let rotation = 0;
      if (drag.action === 'rotate') {
        // Crossing the center has no well-defined angle; rebase there without a sudden half-turn.
        if (
          Math.hypot(previous.x - anchor.x, previous.y - anchor.y) < 16 ||
          Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) < 16
        )
          return;
        const angle =
          Math.atan2(pointer.y - anchor.y, pointer.x - anchor.x) -
          Math.atan2(previous.y - anchor.y, previous.x - anchor.x);
        drag.rotation += Math.atan2(Math.sin(angle), Math.cos(angle));
        const applied = pointer.shiftKey
          ? drag.initialRoll - snapAngle(drag.initialRoll - drag.rotation)
          : drag.rotation;
        rotation = applied - drag.appliedRotation;
        drag.appliedRotation = applied;
      }
      params.renderer()?.transformTouch({
        from: drag.action === 'pan' ? previous : anchor,
        to: drag.action === 'pan' ? pointer : anchor,
        scale: drag.action === 'zoom' ? 1 / Math.max(0.01, 1 + dy * 0.002) : 1,
        rotation
      });
    },
    end(pointerId: number) {
      if (drag?.pointerId !== pointerId) return;
      const releasePoint = drag.previous;
      drag = undefined;
      setActiveAction(undefined);
      if (invocation === 'held') place(releasePoint);
      else close();
    },
    /** Arrow keys provide discrete alternatives to dragging each zone. */
    nudge(action: PuckAction, dx: number, dy: number) {
      const anchor = viewportCenter();
      if (!center()) return;
      if (action === 'orbit') {
        if (params.mode() === '3d') params.renderer()?.orbit(dx, dy);
      } else {
        params.renderer()?.transformTouch({
          from: anchor,
          to: action === 'pan' ? { x: anchor.x + dx, y: anchor.y + dy } : anchor,
          scale: action === 'zoom' ? Math.exp((dx - dy) * 0.01) : 1,
          rotation: action === 'rotate' ? (dx - dy) * 0.01 : 0
        });
      }
    }
  };
}

/** The same pan, zoom and roll controls apply in both modes; orbit belongs to 3D. */
export type PuckAction = 'pan' | 'zoom' | 'rotate' | 'orbit';
type Point = { x: number; y: number };
type PuckPointer = Point & { pointerId: number; shiftKey?: boolean };

function snapAngle(angle: number) {
  const step = Math.PI / 12;
  return Math.round(angle / step) * step;
}
