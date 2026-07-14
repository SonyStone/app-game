import { setPointerCaptureSafely } from '../../../editor/pointer';
import { cancelMatchingDrag, type DefaultViewportToolContext } from './defaultViewportToolContext';
import type { ViewportTool } from './toolRegistry';

export function createViewNavigationTool(context: DefaultViewportToolContext): ViewportTool {
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
