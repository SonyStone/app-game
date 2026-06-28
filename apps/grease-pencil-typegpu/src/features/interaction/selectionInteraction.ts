import type { Accessor, Setter } from 'solid-js'
import {
  type Drawing,
  type GreaseDocument,
  type GreaseLayer,
  type StrokeId,
  type StrokePointKey,
} from '../../document'
import { createPointSelectionInteraction } from './pointSelectionInteraction'
import { createStrokeSelectionInteraction } from './strokeSelectionInteraction'
import type { InteractionViewport } from './viewportPort'

type SelectionInteractionParams = {
  activeDrawing: Accessor<Drawing | undefined>
  activeLayer: Accessor<GreaseLayer | undefined>
  renderer: Accessor<InteractionViewport | undefined>
  selectedPointCount: Accessor<number>
  selectedPointKeys: Accessor<ReadonlySet<StrokePointKey>>
  selectedStrokeCount: Accessor<number>
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>
  setDocumentState: Setter<GreaseDocument>
  setPointerLabel: Setter<string>
  setSelectedPointKeys: Setter<ReadonlySet<StrokePointKey>>
  setSelectedStrokeIds: Setter<ReadonlySet<StrokeId>>
}

export function createSelectionInteraction(params: SelectionInteractionParams) {
  const strokeSelection = createStrokeSelectionInteraction({
    activeDrawing: params.activeDrawing,
    activeLayer: params.activeLayer,
    renderer: params.renderer,
    selectedStrokeCount: params.selectedStrokeCount,
    selectedStrokeIds: params.selectedStrokeIds,
    setDocumentState: params.setDocumentState,
    setPointerLabel: params.setPointerLabel,
    setSelectedPointKeys: params.setSelectedPointKeys,
    setSelectedStrokeIds: params.setSelectedStrokeIds,
  })
  const pointSelection = createPointSelectionInteraction({
    activeDrawing: params.activeDrawing,
    activeLayer: params.activeLayer,
    renderer: params.renderer,
    selectedPointCount: params.selectedPointCount,
    selectedPointKeys: params.selectedPointKeys,
    setDocumentState: params.setDocumentState,
    setPointerLabel: params.setPointerLabel,
    setSelectedPointKeys: params.setSelectedPointKeys,
    setSelectedStrokeIds: params.setSelectedStrokeIds,
  })

  const deleteCurrentSelection = () => {
    if (params.selectedPointKeys().size > 0) {
      pointSelection.deleteSelectedPoints()
      return
    }

    strokeSelection.deleteSelectedStrokes()
  }

  return {
    deleteCurrentSelection,
    deleteSelectedPoints: pointSelection.deleteSelectedPoints,
    deleteSelectedStrokes: strokeSelection.deleteSelectedStrokes,
    endPointSelection: pointSelection.endPointSelection,
    endStrokeSelection: strokeSelection.endStrokeSelection,
    isPointSelectionPointer: pointSelection.isPointSelectionPointer,
    isStrokeSelectionPointer: strokeSelection.isStrokeSelectionPointer,
    movePointSelection: pointSelection.movePointSelection,
    moveStrokeSelection: strokeSelection.moveStrokeSelection,
    startPointSelection: pointSelection.startPointSelection,
    startStrokeSelection: strokeSelection.startStrokeSelection,
  } as const
}
