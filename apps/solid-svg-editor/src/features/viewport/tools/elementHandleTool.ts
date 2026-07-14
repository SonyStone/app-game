import { cancelMatchingDrag, type DefaultViewportToolContext } from './defaultViewportToolContext';
import type { ViewportTool } from './toolRegistry';

export function createElementHandleTool(context: DefaultViewportToolContext): ViewportTool {
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
