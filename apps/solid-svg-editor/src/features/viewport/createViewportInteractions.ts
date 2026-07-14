import { createEventListenerMap } from '@solid-primitives/event-listener';
import { createEffect, createSignal, type Accessor, type Setter } from 'solid-js';

import { type CommandTransaction } from '../../editor/commands';
import { type Point, type Rect } from '../../editor/geometry';
import type { SelectionTarget } from '../../editor/selection-targets';
import type { SvgSpatialIndex } from '../../editor/svg-spatial-index';
import type { ToolContribution } from '../../editor/kernel';
import type {
  ActiveDrag,
  ContextMenuState,
  DragSelectionMode,
  HandleDescriptor,
  TransformBoxHandleDescriptor
} from '../../editor/types';
import type { SvgElementNode } from '../../svg-model';
import { createDefaultViewportTools, createViewportToolsFromRegistry } from './tools/defaultViewportTools';
import { createViewportToolRegistry } from './tools/toolRegistry';
import { createElementHandleToolController } from './tools/elementHandleToolController';
import { createSelectionToolController } from './tools/selectionToolController';
import { createTransformBoxToolController } from './tools/transformBoxToolController';
import { createViewNavigationToolController } from './tools/viewNavigationToolController';
import type { ViewportRendererAdapter } from './rendererAdapter';
import { createRafQueue } from '../ui/createRafQueue';

export function createViewportInteractions(options: {
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedTargets: Accessor<readonly SelectionTarget[]>;
  readonly setSelectedTargets: (targets: readonly SelectionTarget[]) => void;
  readonly selectTarget: (target: SelectionTarget, event?: PointerEvent) => void;
  readonly selectNode: (nodeId: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly setContextMenu: Setter<ContextMenuState | undefined>;
  readonly beginCommandTransaction: () => CommandTransaction | undefined;
  readonly cancelCommandTransaction: () => void;
  readonly renderer: ViewportRendererAdapter;
  readonly spatialIndex?: Accessor<SvgSpatialIndex | undefined>;
  readonly zoom: Accessor<number>;
  readonly setZoom: Setter<number>;
  readonly viewportSize: Accessor<{ readonly width: number; readonly height: number }>;
  readonly viewportRotation: Accessor<number>;
  readonly setViewportRotation: Setter<number>;
  readonly setCameraCenter: Setter<Point>;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
  readonly centerForClientPoint: (worldPoint: Point, clientX: number, clientY: number, z: number, rotation: number) => Point;
  readonly angleFromViewportCenter: (clientX: number, clientY: number) => number;
  readonly zoomBy: (factor: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly rotateViewportBy: (delta: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly dragSelectionMode: Accessor<DragSelectionMode>;
  readonly useCtrlForZoom: Accessor<boolean>;
  readonly useRasterPreview: Accessor<boolean>;
  readonly keepViewportPreviewAlive: (delay?: number) => void;
  readonly toolContributions?: readonly ToolContribution[];
}) {
  const [activeDrag, setActiveDrag] = createSignal<ActiveDrag | undefined>();
  const [selectionBox, setSelectionBox] = createSignal<Rect | undefined>();
  const [marqueeRect, setMarqueeRect] = createSignal<Rect | undefined>();

  const selectionBoxFrame = createRafQueue(() =>
    setSelectionBox(
      options.renderer.measureSelectionBox({
        rootId: options.activeRoot().id,
        selectedIds: options.selectedIds(),
        selectedTargets: options.selectedTargets(),
        useRasterPreview: options.useRasterPreview(),
        clientToSvgPoint: options.clientToSvgPoint
      })
    )
  );
  const viewNavigationToolController = createViewNavigationToolController({
    setActiveDrag,
    zoom: options.zoom,
    setZoom: options.setZoom,
    viewportRotation: options.viewportRotation,
    setViewportRotation: options.setViewportRotation,
    setCameraCenter: options.setCameraCenter,
    clientToSvgPoint: options.clientToSvgPoint,
    centerForClientPoint: options.centerForClientPoint,
    angleFromViewportCenter: options.angleFromViewportCenter,
    zoomBy: options.zoomBy,
    rotateViewportBy: options.rotateViewportBy,
    useCtrlForZoom: options.useCtrlForZoom,
    keepViewportPreviewAlive: options.keepViewportPreviewAlive
  });
  const selectionToolController = createSelectionToolController({
    activeRoot: options.activeRoot,
    selectedIds: options.selectedIds,
    selectedTargets: options.selectedTargets,
    setSelectedTargets: options.setSelectedTargets,
    selectTarget: options.selectTarget,
    selectNode: options.selectNode,
    clearSelection: options.clearSelection,
    clearContextMenu,
    setActiveDrag,
    setMarqueeRect,
    clientToSvgPoint: options.clientToSvgPoint,
    dragSelectionMode: options.dragSelectionMode,
    renderer: options.renderer,
    ...(options.spatialIndex ? { spatialIndex: options.spatialIndex } : {}),
    beginCommandTransaction: options.beginCommandTransaction
  });
  const elementHandleToolController = createElementHandleToolController({
    activeDrag,
    setActiveDrag,
    selectTarget: options.selectTarget,
    clientToSvgPoint: options.clientToSvgPoint,
    beginCommandTransaction: options.beginCommandTransaction
  });
  const transformBoxToolController = createTransformBoxToolController({
    activeRoot: options.activeRoot,
    selectedIds: options.selectedIds,
    selectionBox,
    setActiveDrag,
    clientToSvgPoint: options.clientToSvgPoint,
    beginCommandTransaction: options.beginCommandTransaction
  });
  const defaultToolContext = {
    activeDrag,
    clearContextMenu,
    handleViewportWheel: viewNavigationToolController.handleViewportWheel,
    hasTouchPoint: viewNavigationToolController.hasTouchPoint,
    beginTouchPoint: viewNavigationToolController.beginTouchPoint,
    updateTouchPoint: viewNavigationToolController.updateTouchPoint,
    finishTouchPoint: viewNavigationToolController.finishTouchPoint,
    beginPanDrag: viewNavigationToolController.beginPanDrag,
    updatePanDrag: viewNavigationToolController.updatePanDrag,
    finishPanDrag: viewNavigationToolController.finishPanDrag,
    beginCanvasRotateDrag: viewNavigationToolController.beginCanvasRotateDrag,
    updateCanvasRotateDrag: viewNavigationToolController.updateCanvasRotateDrag,
    finishCanvasRotateDrag: viewNavigationToolController.finishCanvasRotateDrag,
    handleCanvasSelectionPointerDown: selectionToolController.handleCanvasSelectionPointerDown,
    handleNodeSelectionPointerDown: selectionToolController.handleNodeSelectionPointerDown,
    handleSelectionTargetPointerDown: selectionToolController.handleSelectionTargetPointerDown,
    updateMarqueeDrag: selectionToolController.updateMarqueeDragFromEvent,
    finishMarqueeDrag: selectionToolController.finishMarqueeDragFromEvent,
    updateMoveSelectionDrag: selectionToolController.updateMoveSelectionDragFromEvent,
    finishMoveSelectionDrag: selectionToolController.finishMoveSelectionDrag,
    beginElementHandleDrag: elementHandleToolController.beginElementHandleDrag,
    updateElementHandleDrag: elementHandleToolController.updateElementHandleDrag,
    finishElementHandleDrag: elementHandleToolController.finishElementHandleDrag,
    beginTransformBoxDrag: transformBoxToolController.beginTransformBoxDrag,
    updateTransformBoxDrag: transformBoxToolController.updateTransformBoxDragFromEvent,
    finishTransformBoxDrag: transformBoxToolController.finishTransformBoxDrag,
    cancelActiveDrag
  } satisfies Parameters<typeof createDefaultViewportTools>[0];
  const toolRegistry = createViewportToolRegistry(
    options.toolContributions
      ? createViewportToolsFromRegistry(defaultToolContext, options.toolContributions)
      : createDefaultViewportTools(defaultToolContext)
  );

  createEventListenerMap(
    window,
    {
      pointermove: onWindowPointerMove,
      pointerup: onWindowPointerUp,
      pointercancel: onWindowPointerCancel
    },
    { passive: false }
  );

  createEffect(() => {
    options.activeRoot();
    options.selectedIds();
    options.selectedTargets();
    options.viewportRotation();
    options.zoom();
    options.viewportSize();
    options.useRasterPreview();
    scheduleSelectionBoxUpdate();
  });

  function scheduleSelectionBoxUpdate(): void {
    selectionBoxFrame.schedule();
  }

  function clearContextMenu(): void {
    options.setContextMenu(undefined);
  }

  function onCanvasWheel(event: WheelEvent): void {
    toolRegistry.handleCanvasWheel(event);
  }

  function onCanvasPointerDown(event: PointerEvent): void {
    toolRegistry.handleCanvasPointerDown(event);
  }

  function onWindowPointerMove(event: PointerEvent): void {
    toolRegistry.handleWindowPointerMove(event);
  }

  function onWindowPointerUp(event: PointerEvent): void {
    toolRegistry.handleWindowPointerUp(event);
  }

  function onWindowPointerCancel(event: PointerEvent): void {
    toolRegistry.handleWindowPointerCancel(event);
  }

  function onNodePointerDown(nodeId: string, event: PointerEvent): void {
    toolRegistry.handleNodePointerDown(nodeId, event);
  }

  function onSelectionTargetPointerDown(target: SelectionTarget, event: PointerEvent): void {
    toolRegistry.handleSelectionTargetPointerDown(target, event);
  }

  function startHandleDrag(event: PointerEvent, handle: HandleDescriptor): void {
    toolRegistry.handleHandlePointerDown(event, handle);
  }

  function startTransformBoxDrag(event: PointerEvent, handle: TransformBoxHandleDescriptor): void {
    toolRegistry.handleTransformBoxPointerDown(event, handle);
  }

  function cancelActiveDrag(): void {
    viewNavigationToolController.cancelPendingViewNavigationUpdate();
    elementHandleToolController.cancelPendingHandleDragUpdate();
    options.cancelCommandTransaction();
    setMarqueeRect(undefined);
    setActiveDrag(undefined);
  }

  return {
    activeDrag,
    activeTouchGesture: viewNavigationToolController.activeTouchGesture,
    selectionBox,
    marqueeRect,
    onCanvasWheel,
    onCanvasPointerDown,
    onNodePointerDown,
    onSelectionTargetPointerDown,
    startHandleDrag,
    startTransformBoxDrag
  };
}
