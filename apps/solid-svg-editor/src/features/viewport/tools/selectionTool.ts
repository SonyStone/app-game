import { cancelMatchingDrag, type DefaultViewportToolContext } from './defaultViewportToolContext';
import type { ViewportTool } from './toolRegistry';

export function createSelectionTool(context: DefaultViewportToolContext): ViewportTool {
  return {
    id: 'selection',
    label: 'Selection',
    priority: 10,
    onCanvasPointerDown: (event) => context.handleCanvasSelectionPointerDown(event),
    onNodePointerDown: (nodeId, event) => context.handleNodeSelectionPointerDown(nodeId, event),
    onSelectionTargetPointerDown: (target, event) => context.handleSelectionTargetPointerDown(target, event),
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
