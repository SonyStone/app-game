import { setPointerCaptureSafely } from '../../../editor/pointer';
import type { ViewportTool } from './toolRegistry';
import type { DefaultViewportToolContext } from './defaultViewportToolContext';

export function createTouchTool(context: DefaultViewportToolContext): ViewportTool {
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
