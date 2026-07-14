import { cancelMatchingDrag, type DefaultViewportToolContext } from './defaultViewportToolContext';
import type { ViewportTool } from './toolRegistry';

export function createTransformBoxTool(context: DefaultViewportToolContext): ViewportTool {
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
