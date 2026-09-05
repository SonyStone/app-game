import type { Accessor, Setter } from 'solid-js';
import type { ToolMode } from '../../shared/toolMode';
import type { ViewportMode } from '../../shared/viewportMode';
import { getViewAction, type ViewAction } from './pointerGestures';
import { touchGestureDelta, touchGestureSample } from './touchGesture';
import type { InteractionViewport } from './viewportPort';

/** Routes fingers independently from the pen. A pinch owns its touches until all lift. */
export function createViewportNavigation(params: ViewportNavigationParams) {
  const touches = new Map<number, PointerEvent>();
  const ignoredTouches = new Set<number>();
  let penPointerId: number | undefined;
  let singlePointer: { id: number; action: ViewAction; x: number; y: number } | undefined;
  let previousGesture: ReturnType<typeof touchGestureSample>;
  let hadMultitouch = false;

  const startPointer = (event: PointerEvent) => {
    if (event.pointerType === 'pen') {
      penPointerId = event.pointerId;
      for (const id of touches.keys()) ignoredTouches.add(id);
      touches.clear();
      previousGesture = undefined;
      singlePointer = undefined;
      hadMultitouch = false;
    }

    if (event.pointerType === 'touch') {
      // A resting palm must neither transform the camera nor join a pinch after pen-up.
      if (penPointerId !== undefined || ignoredTouches.has(event.pointerId)) {
        ignoredTouches.add(event.pointerId);
        return true;
      }
      touches.set(event.pointerId, event);
      if (touches.size >= 2) {
        hadMultitouch = true;
        singlePointer = undefined;
        previousGesture = touchGestureSample(touches.values());
        params.setPointerLabel('Pan / zoom / rotate');
        return true;
      }
    }

    const action =
      event.pointerType === 'touch' && params.viewportMode() === '2d'
        ? 'pan'
        : getViewAction(params.mode(), event) ??
          (event.pointerType === 'touch' && !params.touchDrawing() ? 'orbit' : undefined);
    if (!action) return false;
    singlePointer = { id: event.pointerId, action, x: event.clientX, y: event.clientY };
    params.setPointerLabel(action === 'pan' ? 'Pan' : params.viewportMode() === '2d' ? 'Rotate canvas' : 'Orbit');
    return true;
  };

  const movePointer = (event: PointerEvent): PointerMoveResult => {
    if (ignoredTouches.has(event.pointerId)) return { status: 'ignored' };
    if (event.pointerType === 'touch') {
      if (!touches.has(event.pointerId)) return { status: 'ignored' };
      touches.set(event.pointerId, event);
      if (touches.size >= 2) {
        const next = touchGestureSample(touches.values());
        if (previousGesture && next) params.renderer()?.transformTouch(touchGestureDelta(previousGesture, next));
        previousGesture = next;
        return { status: 'handled' };
      }
      // Do not resume drawing or jump to a different action when one pinch finger lifts.
      if (hadMultitouch) return { status: 'handled' };
    }

    if (singlePointer?.id === event.pointerId) {
      const dx = event.clientX - singlePointer.x;
      const dy = event.clientY - singlePointer.y;
      if (singlePointer.action === 'pan') {
        params.renderer()?.transformTouch({
          from: { x: singlePointer.x, y: singlePointer.y },
          to: { x: event.clientX, y: event.clientY },
          scale: 1,
          rotation: 0
        });
      } else params.renderer()?.orbit(dx, dy);
      singlePointer.x = event.clientX;
      singlePointer.y = event.clientY;
      return { status: 'handled' };
    }
    return { status: 'unhandled' };
  };

  const releasePointer = (event: PointerEvent) => {
    ignoredTouches.delete(event.pointerId);
    touches.delete(event.pointerId);
    if (penPointerId === event.pointerId) penPointerId = undefined;
    if (singlePointer?.id === event.pointerId) singlePointer = undefined;
    previousGesture = touchGestureSample(touches.values());
    if (touches.size === 0) hadMultitouch = false;
    if (touches.size === 0 && penPointerId === undefined) params.setPointerLabel('Ready');
  };

  return { isMultitouch: () => touches.size >= 2, movePointer, releasePointer, startPointer } as const;
}

type ViewportNavigationParams = {
  mode: Accessor<ToolMode>;
  renderer: Accessor<InteractionViewport | undefined>;
  setPointerLabel: Setter<string>;
  viewportMode: Accessor<ViewportMode>;
  /** Enables single-finger editing in 3D. In 2D, a finger always pans. */
  touchDrawing: Accessor<boolean>;
};

type PointerMoveResult = { status: 'handled' | 'ignored' | 'unhandled' };
