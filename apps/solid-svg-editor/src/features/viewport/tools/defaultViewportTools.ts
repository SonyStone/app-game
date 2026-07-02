import { setPointerCaptureSafely } from '../../../editor/pointer';
import type {
  ActiveDrag,
  ActiveHandleDrag,
  ActiveMarqueeDrag,
  ActiveMoveSelectionDrag,
  ActivePanDrag,
  ActiveTransformBoxDrag,
  HandleDescriptor,
  TransformBoxHandleDescriptor
} from '../../../editor/types';
import type { ViewportTool } from './toolRegistry';

export interface DefaultViewportToolContext {
  readonly activeDrag: () => ActiveDrag | undefined;
  readonly clearContextMenu: () => void;
  readonly handleViewportWheel: (event: WheelEvent) => boolean;
  readonly hasTouchPoint: (pointerId: number) => boolean;
  readonly beginTouchPoint: (event: PointerEvent) => void;
  readonly updateTouchPoint: (event: PointerEvent) => void;
  readonly finishTouchPoint: (pointerId: number) => void;
  readonly beginPanDrag: (event: PointerEvent) => void;
  readonly updatePanDrag: (drag: ActivePanDrag, event: PointerEvent) => void;
  readonly finishPanDrag: () => void;
  readonly beginCanvasRotateDrag: (event: PointerEvent) => void;
  readonly updateCanvasRotateDrag: (drag: Extract<ActiveDrag, { readonly type: 'rotate-canvas' }>, event: PointerEvent) => void;
  readonly finishCanvasRotateDrag: () => void;
  readonly handleCanvasSelectionPointerDown: (event: PointerEvent) => boolean;
  readonly handleNodeSelectionPointerDown: (nodeId: string, event: PointerEvent) => boolean;
  readonly updateMarqueeDrag: (drag: ActiveMarqueeDrag, event: PointerEvent) => void;
  readonly finishMarqueeDrag: (drag: ActiveMarqueeDrag, event: PointerEvent) => void;
  readonly updateMoveSelectionDrag: (drag: ActiveMoveSelectionDrag, event: PointerEvent) => void;
  readonly finishMoveSelectionDrag: (drag: ActiveMoveSelectionDrag) => void;
  readonly beginElementHandleDrag: (event: PointerEvent, handle: HandleDescriptor) => boolean;
  readonly updateElementHandleDrag: (drag: ActiveHandleDrag, event: PointerEvent) => void;
  readonly finishElementHandleDrag: () => void;
  readonly beginTransformBoxDrag: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => boolean;
  readonly updateTransformBoxDrag: (drag: ActiveTransformBoxDrag, event: PointerEvent) => void;
  readonly finishTransformBoxDrag: () => void;
  readonly cancelActiveDrag: () => void;
}

export function createDefaultViewportTools(context: DefaultViewportToolContext): readonly ViewportTool[] {
  return [
    createTouchTool(context),
    createViewNavigationTool(context),
    createElementHandleTool(context),
    createTransformBoxTool(context),
    createSelectionTool(context)
  ] as const satisfies readonly ViewportTool[];
}

function createTouchTool(context: DefaultViewportToolContext): ViewportTool {
  return {
    id: 'touch',
    label: 'Touch gestures',
    priority: 100,
    onCanvasPointerDown: (event) => {
      if (event.pointerType !== 'touch') {
        return false;
      }

      event.preventDefault();
      context.clearContextMenu();
      context.beginTouchPoint(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return true;
    },
    onWindowPointerMove: (event) => {
      if (event.pointerType !== 'touch' || !context.hasTouchPoint(event.pointerId)) {
        return false;
      }

      event.preventDefault();
      context.updateTouchPoint(event);
      return true;
    },
    onWindowPointerUp: (event) => {
      if (event.pointerType !== 'touch' || !context.hasTouchPoint(event.pointerId)) {
        return false;
      }

      context.finishTouchPoint(event.pointerId);
      return true;
    },
    onWindowPointerCancel: (event) => {
      if (event.pointerType !== 'touch' || !context.hasTouchPoint(event.pointerId)) {
        return false;
      }

      context.finishTouchPoint(event.pointerId);
      return true;
    }
  };
}

function createViewNavigationTool(context: DefaultViewportToolContext): ViewportTool {
  return {
    id: 'view-navigation',
    label: 'View navigation',
    priority: 90,
    onCanvasWheel: (event) => context.handleViewportWheel(event),
    onCanvasPointerDown: (event) => {
      if (event.altKey) {
        event.preventDefault();
        context.clearContextMenu();

        if (event.button === 0) {
          context.beginCanvasRotateDrag(event);
          setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
        }

        return true;
      }

      if (event.button !== 1) {
        return false;
      }

      event.preventDefault();
      context.clearContextMenu();
      context.beginPanDrag(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return true;
    },
    onWindowPointerMove: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId) {
        return false;
      }

      if (drag.type === 'pan') {
        context.updatePanDrag(drag, event);
        return true;
      }

      if (drag.type === 'rotate-canvas') {
        context.updateCanvasRotateDrag(drag, event);
        return true;
      }

      return false;
    },
    onWindowPointerUp: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId) {
        return false;
      }

      if (drag.type === 'pan') {
        context.finishPanDrag();
        return true;
      }

      if (drag.type === 'rotate-canvas') {
        context.finishCanvasRotateDrag();
        return true;
      }

      return false;
    },
    onWindowPointerCancel: (event) => cancelMatchingDrag(context, event, ['pan', 'rotate-canvas'])
  };
}

function createSelectionTool(context: DefaultViewportToolContext): ViewportTool {
  return {
    id: 'selection',
    label: 'Selection',
    priority: 10,
    onCanvasPointerDown: (event) => context.handleCanvasSelectionPointerDown(event),
    onNodePointerDown: (nodeId, event) => context.handleNodeSelectionPointerDown(nodeId, event),
    onWindowPointerMove: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId) {
        return false;
      }

      if (drag.type === 'marquee') {
        context.updateMarqueeDrag(drag, event);
        return true;
      }

      if (drag.type === 'move-selection') {
        context.updateMoveSelectionDrag(drag, event);
        return true;
      }

      return false;
    },
    onWindowPointerUp: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId) {
        return false;
      }

      if (drag.type === 'marquee') {
        context.finishMarqueeDrag(drag, event);
        return true;
      }

      if (drag.type === 'move-selection') {
        context.finishMoveSelectionDrag(drag);
        return true;
      }

      return false;
    },
    onWindowPointerCancel: (event) => cancelMatchingDrag(context, event, ['marquee', 'move-selection'])
  };
}

function createElementHandleTool(context: DefaultViewportToolContext): ViewportTool {
  return {
    id: 'element-handle',
    label: 'Element handles',
    priority: 80,
    onHandlePointerDown: (event, handle) => context.beginElementHandleDrag(event, handle),
    onWindowPointerMove: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId || drag.type !== 'handle') {
        return false;
      }

      context.updateElementHandleDrag(drag, event);
      return true;
    },
    onWindowPointerUp: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId || drag.type !== 'handle') {
        return false;
      }

      context.finishElementHandleDrag();
      return true;
    },
    onWindowPointerCancel: (event) => cancelMatchingDrag(context, event, ['handle'])
  };
}

function createTransformBoxTool(context: DefaultViewportToolContext): ViewportTool {
  return {
    id: 'transform-box',
    label: 'Transform box',
    priority: 80,
    onTransformBoxPointerDown: (event, handle) => context.beginTransformBoxDrag(event, handle),
    onWindowPointerMove: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId || drag.type !== 'transform-box') {
        return false;
      }

      context.updateTransformBoxDrag(drag, event);
      return true;
    },
    onWindowPointerUp: (event) => {
      const drag = context.activeDrag();

      if (!drag || drag.pointerId !== event.pointerId || drag.type !== 'transform-box') {
        return false;
      }

      context.finishTransformBoxDrag();
      return true;
    },
    onWindowPointerCancel: (event) => cancelMatchingDrag(context, event, ['transform-box'])
  };
}

function cancelMatchingDrag(
  context: DefaultViewportToolContext,
  event: PointerEvent,
  types: readonly ActiveDrag['type'][]
): boolean {
  const drag = context.activeDrag();

  if (!drag || drag.pointerId !== event.pointerId || !types.includes(drag.type)) {
    return false;
  }

  context.cancelActiveDrag();
  return true;
}
