import type { CameraState } from '../../render/cameraMatrices';
import type { WorkplaneGizmoMode } from '../../render/workplaneGizmoTypes';
import type { Accessor, Setter } from 'solid-js';
import {
  type Drawing,
  type DrawingWorkplane,
  type GreaseDocument,
  type GreaseLayer,
  type GreaseMaterial,
  type Stroke,
  type StrokeId,
  type StrokePointKey
} from '../../document';
import type { ToolMode } from '../../shared/toolMode';
import type { ViewportMode } from '../../shared/viewportMode';
import { createEraserInteraction } from './eraserInteraction';
import { createSelectionInteraction } from './selectionInteraction';
import { createStrokeDrawingInteraction } from './strokeDrawing';
import { createViewportNavigation } from './viewportNavigation';
import type { InteractionViewport } from './viewportPort';
import { createWorkplaneGizmoInteraction } from './workplaneGizmoInteraction';

type UseCanvasInteractionParams = {
  camera: Accessor<CameraState>;
  canvas: Accessor<HTMLCanvasElement>;
  renderer: Accessor<InteractionViewport | undefined>;
  mode: Accessor<ToolMode>;
  viewportMode: Accessor<ViewportMode>;
  gizmoMode: Accessor<WorkplaneGizmoMode>;
  touchDrawing: Accessor<boolean>;
  documentState: Accessor<GreaseDocument>;
  activeLayer: Accessor<GreaseLayer | undefined>;
  activeDrawing: Accessor<Drawing | undefined>;
  activeMaterial: Accessor<GreaseMaterial>;
  workplane: Accessor<DrawingWorkplane>;
  currentFrame: Accessor<number>;
  brushStrength: Accessor<number>;
  eraserRadius: Accessor<number>;
  draftStroke: Accessor<Stroke | undefined>;
  setDraftStroke: Setter<Stroke | undefined>;
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>;
  setSelectedStrokeIds: Setter<ReadonlySet<StrokeId>>;
  selectedPointKeys: Accessor<ReadonlySet<StrokePointKey>>;
  setSelectedPointKeys: Setter<ReadonlySet<StrokePointKey>>;
  selectedStrokeCount: Accessor<number>;
  selectedPointCount: Accessor<number>;
  setDocumentState: Setter<GreaseDocument>;
  setPointerLabel: Setter<string>;
};

export function useCanvasInteraction(params: UseCanvasInteractionParams) {
  const viewportNavigation = createViewportNavigation({
    mode: params.mode,
    renderer: params.renderer,
    setPointerLabel: params.setPointerLabel,
    viewportMode: params.viewportMode,
    touchDrawing: params.touchDrawing
  });
  const workplaneGizmo = createWorkplaneGizmoInteraction({
    camera: params.camera,
    canvas: params.canvas,
    mode: params.gizmoMode,
    renderer: params.renderer,
    setDocumentState: params.setDocumentState,
    setPointerLabel: params.setPointerLabel,
    workplane: params.workplane
  });
  const strokeDrawing = createStrokeDrawingInteraction({
    activeLayer: params.activeLayer,
    activeMaterial: params.activeMaterial,
    brushStrength: params.brushStrength,
    currentFrame: params.currentFrame,
    draftStroke: params.draftStroke,
    mode: params.mode,
    renderer: params.renderer,
    setDocumentState: params.setDocumentState,
    setDraftStroke: params.setDraftStroke,
    setPointerLabel: params.setPointerLabel
  });
  const eraser = createEraserInteraction({
    activeLayer: params.activeLayer,
    eraserRadius: params.eraserRadius,
    renderer: params.renderer,
    setDocumentState: params.setDocumentState,
    setPointerLabel: params.setPointerLabel,
    setSelectedPointKeys: params.setSelectedPointKeys,
    setSelectedStrokeIds: params.setSelectedStrokeIds
  });
  const selection = createSelectionInteraction({
    activeDrawing: params.activeDrawing,
    activeLayer: params.activeLayer,
    renderer: params.renderer,
    selectedPointCount: params.selectedPointCount,
    selectedPointKeys: params.selectedPointKeys,
    selectedStrokeCount: params.selectedStrokeCount,
    selectedStrokeIds: params.selectedStrokeIds,
    setDocumentState: params.setDocumentState,
    setPointerLabel: params.setPointerLabel,
    setSelectedPointKeys: params.setSelectedPointKeys,
    setSelectedStrokeIds: params.setSelectedStrokeIds
  });

  let editPointer: PointerEvent | undefined;
  let documentBeforeEdit: GreaseDocument | undefined;
  let selectionBeforeEdit: { strokes: ReadonlySet<StrokeId>; points: ReadonlySet<StrokePointKey> } | undefined;

  // A second finger takes ownership of the gesture, including an in-progress erase or selection move.
  const cancelEdit = () => {
    if (!editPointer) return;
    strokeDrawing.cancelDraftStroke();
    workplaneGizmo.endGizmoDrag(editPointer);
    selection.endStrokeSelection(editPointer);
    selection.endPointSelection(editPointer);
    eraser.endEraser(editPointer);
    if (documentBeforeEdit) params.setDocumentState(documentBeforeEdit);
    if (selectionBeforeEdit) {
      params.setSelectedStrokeIds(selectionBeforeEdit.strokes);
      params.setSelectedPointKeys(selectionBeforeEdit.points);
    }
    editPointer = undefined;
    documentBeforeEdit = undefined;
    selectionBeforeEdit = undefined;
  };

  const onPointerDown = (event: PointerEvent) => {
    params.canvas().setPointerCapture(event.pointerId);

    if (event.pointerType === 'pen' && editPointer?.pointerType === 'touch') cancelEdit();
    if (viewportNavigation.startPointer(event)) {
      if (viewportNavigation.isMultitouch()) cancelEdit();
      return;
    }

    editPointer = event;
    documentBeforeEdit = params.documentState();
    selectionBeforeEdit = { strokes: params.selectedStrokeIds(), points: params.selectedPointKeys() };
    if (params.viewportMode() === '3d' && workplaneGizmo.startGizmoDrag(event)) return;

    if (params.mode() === 'select') {
      selection.startStrokeSelection(event);
      return;
    }

    if (params.mode() === 'edit') {
      selection.startPointSelection(event);
      return;
    }

    if (params.mode() === 'erase') {
      eraser.startEraser(event);
      return;
    }

    strokeDrawing.startStroke(event);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (workplaneGizmo.moveGizmoDrag(event)) return;
    if (params.viewportMode() === '3d') workplaneGizmo.updateGizmoHover(event);

    const viewMove = viewportNavigation.movePointer(event);
    if (viewMove.status !== 'unhandled') return;

    if (selection.isStrokeSelectionPointer(event)) {
      selection.moveStrokeSelection(event);
      return;
    }

    if (selection.isPointSelectionPointer(event)) {
      selection.movePointSelection(event);
      return;
    }

    if (eraser.isActivePointer(event)) {
      eraser.eraseAtEvent(event);
      return;
    }

    strokeDrawing.appendDraftPoint(event);
  };

  const onPointerUp = (event: PointerEvent) => {
    workplaneGizmo.endGizmoDrag(event);
    if (params.viewportMode() === '3d') workplaneGizmo.updateGizmoHover(event);
    viewportNavigation.releasePointer(event);
    selection.endStrokeSelection(event);
    selection.endPointSelection(event);
    eraser.endEraser(event);
    strokeDrawing.commitDraftStroke(event);
    if (editPointer?.pointerId === event.pointerId) {
      editPointer = undefined;
      documentBeforeEdit = undefined;
      selectionBeforeEdit = undefined;
    }
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (editPointer?.pointerId === event.pointerId) cancelEdit();
    onPointerUp(event);
  };

  return {
    onPointerCancel,
    deleteCurrentSelection: selection.deleteCurrentSelection,
    deleteSelectedPoints: selection.deleteSelectedPoints,
    deleteSelectedStrokes: selection.deleteSelectedStrokes,
    onPointerDown,
    onPointerMove,
    onPointerUp
  };
}
