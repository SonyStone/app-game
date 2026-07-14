import type { SelectionTarget } from '../../../editor/selection-targets';
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
  readonly updateCanvasRotateDrag: (
    drag: Extract<ActiveDrag, { readonly type: 'rotate-canvas' }>,
    event: PointerEvent
  ) => void;
  readonly finishCanvasRotateDrag: () => void;
  readonly handleCanvasSelectionPointerDown: (event: PointerEvent) => boolean;
  readonly handleNodeSelectionPointerDown: (nodeId: string, event: PointerEvent) => boolean;
  readonly handleSelectionTargetPointerDown: (target: SelectionTarget, event: PointerEvent) => boolean;
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

export function cancelMatchingDrag(
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
