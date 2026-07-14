import type { SelectionTarget } from '../../../editor/selection-targets';
import type { HandleDescriptor, TransformBoxHandleDescriptor } from '../../../editor/types';

export type ViewportToolId =
  | 'touch'
  | 'view-navigation'
  | 'selection'
  | 'element-handle'
  | 'transform-box'
  | (string & {});

export interface ViewportTool {
  readonly id: ViewportToolId;
  readonly label: string;
  readonly priority: number;
  readonly onCanvasWheel?: (event: WheelEvent) => boolean;
  readonly onCanvasPointerDown?: (event: PointerEvent) => boolean;
  readonly onNodePointerDown?: (nodeId: string, event: PointerEvent) => boolean;
  readonly onSelectionTargetPointerDown?: (target: SelectionTarget, event: PointerEvent) => boolean;
  readonly onWindowPointerMove?: (event: PointerEvent) => boolean;
  readonly onWindowPointerUp?: (event: PointerEvent) => boolean;
  readonly onWindowPointerCancel?: (event: PointerEvent) => boolean;
  readonly onHandlePointerDown?: (event: PointerEvent, handle: HandleDescriptor) => boolean;
  readonly onTransformBoxPointerDown?: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => boolean;
}

export interface ViewportToolRegistry {
  readonly tools: readonly ViewportTool[];
  readonly get: (id: ViewportToolId) => ViewportTool | undefined;
  readonly handleCanvasWheel: (event: WheelEvent) => boolean;
  readonly handleCanvasPointerDown: (event: PointerEvent) => boolean;
  readonly handleNodePointerDown: (nodeId: string, event: PointerEvent) => boolean;
  readonly handleSelectionTargetPointerDown: (target: SelectionTarget, event: PointerEvent) => boolean;
  readonly handleWindowPointerMove: (event: PointerEvent) => boolean;
  readonly handleWindowPointerUp: (event: PointerEvent) => boolean;
  readonly handleWindowPointerCancel: (event: PointerEvent) => boolean;
  readonly handleHandlePointerDown: (event: PointerEvent, handle: HandleDescriptor) => boolean;
  readonly handleTransformBoxPointerDown: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => boolean;
}

export function createViewportToolRegistry(tools: readonly ViewportTool[]): ViewportToolRegistry {
  const orderedTools = [...tools].sort((a, b) => b.priority - a.priority);

  return {
    tools: orderedTools,
    get: (id) => orderedTools.find((tool) => tool.id === id),
    handleCanvasWheel: (event) => runWheelHandlers(orderedTools, event),
    handleCanvasPointerDown: (event) => runCanvasPointerDownHandlers(orderedTools, event),
    handleNodePointerDown: (nodeId, event) => runNodePointerDownHandlers(orderedTools, nodeId, event),
    handleSelectionTargetPointerDown: (target, event) =>
      runSelectionTargetPointerDownHandlers(orderedTools, target, event),
    handleWindowPointerMove: (event) => runWindowPointerMoveHandlers(orderedTools, event),
    handleWindowPointerUp: (event) => runWindowPointerUpHandlers(orderedTools, event),
    handleWindowPointerCancel: (event) => runWindowPointerCancelHandlers(orderedTools, event),
    handleHandlePointerDown: (event, handle) => runHandlePointerDownHandlers(orderedTools, event, handle),
    handleTransformBoxPointerDown: (event, handle) =>
      runTransformBoxPointerDownHandlers(orderedTools, event, handle)
  };
}

function runWheelHandlers(tools: readonly ViewportTool[], event: WheelEvent): boolean {
  for (const tool of tools) {
    if (tool.onCanvasWheel?.(event)) {
      return true;
    }
  }

  return false;
}

function runCanvasPointerDownHandlers(tools: readonly ViewportTool[], event: PointerEvent): boolean {
  for (const tool of tools) {
    if (tool.onCanvasPointerDown?.(event)) {
      return true;
    }
  }

  return false;
}

function runNodePointerDownHandlers(
  tools: readonly ViewportTool[],
  nodeId: string,
  event: PointerEvent
): boolean {
  for (const tool of tools) {
    if (tool.onNodePointerDown?.(nodeId, event)) {
      return true;
    }
  }

  return false;
}

function runSelectionTargetPointerDownHandlers(
  tools: readonly ViewportTool[],
  target: SelectionTarget,
  event: PointerEvent
): boolean {
  for (const tool of tools) {
    if (tool.onSelectionTargetPointerDown?.(target, event)) {
      return true;
    }
  }

  return false;
}

function runWindowPointerMoveHandlers(tools: readonly ViewportTool[], event: PointerEvent): boolean {
  for (const tool of tools) {
    if (tool.onWindowPointerMove?.(event)) {
      return true;
    }
  }

  return false;
}

function runWindowPointerUpHandlers(tools: readonly ViewportTool[], event: PointerEvent): boolean {
  for (const tool of tools) {
    if (tool.onWindowPointerUp?.(event)) {
      return true;
    }
  }

  return false;
}

function runWindowPointerCancelHandlers(tools: readonly ViewportTool[], event: PointerEvent): boolean {
  for (const tool of tools) {
    if (tool.onWindowPointerCancel?.(event)) {
      return true;
    }
  }

  return false;
}

function runHandlePointerDownHandlers(
  tools: readonly ViewportTool[],
  event: PointerEvent,
  handle: HandleDescriptor
): boolean {
  for (const tool of tools) {
    if (tool.onHandlePointerDown?.(event, handle)) {
      return true;
    }
  }

  return false;
}

function runTransformBoxPointerDownHandlers(
  tools: readonly ViewportTool[],
  event: PointerEvent,
  handle: TransformBoxHandleDescriptor
): boolean {
  for (const tool of tools) {
    if (tool.onTransformBoxPointerDown?.(event, handle)) {
      return true;
    }
  }

  return false;
}
