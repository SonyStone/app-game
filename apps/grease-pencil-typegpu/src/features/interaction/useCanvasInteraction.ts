import type { Accessor, Setter } from 'solid-js'
import {
  type Drawing,
  type GreaseDocument,
  type GreaseLayer,
  type GreaseMaterial,
  type Stroke,
  type StrokeId,
  type StrokePointKey,
} from '../../document'
import type { ToolMode } from '../../shared/toolMode'
import { createEraserInteraction } from './eraserInteraction'
import { createSelectionInteraction } from './selectionInteraction'
import { createStrokeDrawingInteraction } from './strokeDrawing'
import { createViewportNavigation } from './viewportNavigation'
import type { InteractionViewport } from './viewportPort'

type UseCanvasInteractionParams = {
  canvas: Accessor<HTMLCanvasElement>
  renderer: Accessor<InteractionViewport | undefined>
  mode: Accessor<ToolMode>
  activeLayer: Accessor<GreaseLayer | undefined>
  activeDrawing: Accessor<Drawing | undefined>
  activeMaterial: Accessor<GreaseMaterial>
  currentFrame: Accessor<number>
  brushStrength: Accessor<number>
  eraserRadius: Accessor<number>
  draftStroke: Accessor<Stroke | undefined>
  setDraftStroke: Setter<Stroke | undefined>
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>
  setSelectedStrokeIds: Setter<ReadonlySet<StrokeId>>
  selectedPointKeys: Accessor<ReadonlySet<StrokePointKey>>
  setSelectedPointKeys: Setter<ReadonlySet<StrokePointKey>>
  selectedStrokeCount: Accessor<number>
  selectedPointCount: Accessor<number>
  setDocumentState: Setter<GreaseDocument>
  setPointerLabel: Setter<string>
}

export function useCanvasInteraction(params: UseCanvasInteractionParams) {
  const viewportNavigation = createViewportNavigation({
    mode: params.mode,
    renderer: params.renderer,
    setPointerLabel: params.setPointerLabel,
  })
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
    setPointerLabel: params.setPointerLabel,
  })
  const eraser = createEraserInteraction({
    activeLayer: params.activeLayer,
    eraserRadius: params.eraserRadius,
    renderer: params.renderer,
    setDocumentState: params.setDocumentState,
    setPointerLabel: params.setPointerLabel,
    setSelectedPointKeys: params.setSelectedPointKeys,
    setSelectedStrokeIds: params.setSelectedStrokeIds,
  })
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
    setSelectedStrokeIds: params.setSelectedStrokeIds,
  })

  const onPointerDown = (event: PointerEvent) => {
    params.canvas().setPointerCapture(event.pointerId)

    if (viewportNavigation.startPointer(event)) return

    if (params.mode() === 'select') {
      selection.startStrokeSelection(event)
      return
    }

    if (params.mode() === 'edit') {
      selection.startPointSelection(event)
      return
    }

    if (params.mode() === 'erase') {
      eraser.startEraser(event)
      return
    }

    strokeDrawing.startStroke(event)
  }

  const onPointerMove = (event: PointerEvent) => {
    const viewMove = viewportNavigation.movePointer(event)
    if (viewMove.status !== 'unhandled') return

    if (selection.isStrokeSelectionPointer(event)) {
      selection.moveStrokeSelection(event)
      return
    }

    if (selection.isPointSelectionPointer(event)) {
      selection.movePointSelection(event)
      return
    }

    if (eraser.isActivePointer(event)) {
      eraser.eraseAtEvent(event)
      return
    }

    strokeDrawing.appendDraftPoint(event)
  }

  const onPointerUp = (event: PointerEvent) => {
    viewportNavigation.releasePointer(event)
    selection.endStrokeSelection(event)
    selection.endPointSelection(event)
    eraser.endEraser(event)
    strokeDrawing.commitDraftStroke(event)
  }

  return {
    deleteCurrentSelection: selection.deleteCurrentSelection,
    deleteSelectedPoints: selection.deleteSelectedPoints,
    deleteSelectedStrokes: selection.deleteSelectedStrokes,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
