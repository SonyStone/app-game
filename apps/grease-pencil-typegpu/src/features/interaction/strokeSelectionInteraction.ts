import type { Accessor, Setter } from 'solid-js'
import {
  deleteStrokesFromActiveDrawing,
  translateStrokesInActiveDrawing,
  type Drawing,
  type GreaseDocument,
  type GreaseLayer,
  type StrokeId,
  type StrokePointKey,
} from '../../document'
import { sub3, type Vec3 } from '../../shared/vector'
import { findNearestStroke } from './hitTesting'
import { isEditableLayer } from './layerEditability'
import type { InteractionViewport } from './viewportPort'

type StrokeSelectionInteractionParams = {
  activeDrawing: Accessor<Drawing | undefined>
  activeLayer: Accessor<GreaseLayer | undefined>
  renderer: Accessor<InteractionViewport | undefined>
  selectedStrokeCount: Accessor<number>
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>
  setDocumentState: Setter<GreaseDocument>
  setPointerLabel: Setter<string>
  setSelectedPointKeys: Setter<ReadonlySet<StrokePointKey>>
  setSelectedStrokeIds: Setter<ReadonlySet<StrokeId>>
}

const SELECT_RADIUS = 0.16

export function createStrokeSelectionInteraction(
  params: StrokeSelectionInteractionParams,
) {
  let editPointerId: number | undefined
  let lastEditPosition: Vec3 | undefined

  const deleteSelectedStrokes = () => {
    const selected = params.selectedStrokeIds()
    if (selected.size === 0) return

    params.setDocumentState((currentDocument) =>
      deleteStrokesFromActiveDrawing(currentDocument, selected),
    )
    params.setSelectedStrokeIds(new Set<StrokeId>())
    params.setSelectedPointKeys(new Set<StrokePointKey>())
    params.setPointerLabel('Selection deleted')
  }

  const startStrokeSelection = (event: PointerEvent) => {
    if (!isEditableLayer(params.activeLayer())) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    const hit = findNearestStroke(params.activeDrawing(), position, SELECT_RADIUS)
    if (!hit) {
      if (!event.shiftKey) params.setSelectedStrokeIds(new Set<StrokeId>())
      params.setPointerLabel(event.shiftKey ? 'No stroke hit' : 'Selection cleared')
      return
    }

    let nextSelection = new Set<StrokeId>()
    const currentSelection = params.selectedStrokeIds()
    if (event.shiftKey) {
      nextSelection = new Set(currentSelection)
      if (nextSelection.has(hit.strokeId)) nextSelection.delete(hit.strokeId)
      else nextSelection.add(hit.strokeId)
    }
    else if (currentSelection.has(hit.strokeId)) {
      nextSelection = new Set(currentSelection)
    }
    else {
      nextSelection.add(hit.strokeId)
    }

    params.setSelectedStrokeIds(nextSelection)
    params.setSelectedPointKeys(new Set<StrokePointKey>())
    if (nextSelection.has(hit.strokeId)) {
      editPointerId = event.pointerId
      lastEditPosition = position
    }
    params.setPointerLabel(`${nextSelection.size} selected`)
  }

  const moveStrokeSelection = (event: PointerEvent) => {
    if (!isStrokeSelectionPointer(event) || params.selectedStrokeIds().size === 0) {
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position || !lastEditPosition) return

    const delta = sub3(position, lastEditPosition)
    lastEditPosition = position
    params.setDocumentState((currentDocument) =>
      translateStrokesInActiveDrawing(
        currentDocument,
        params.selectedStrokeIds(),
        delta,
      ),
    )
    params.setPointerLabel(`Moved ${params.selectedStrokeCount()} selected`)
  }

  const endStrokeSelection = (event: PointerEvent) => {
    if (!isStrokeSelectionPointer(event)) return false
    editPointerId = undefined
    lastEditPosition = undefined
    params.setPointerLabel(
      params.selectedStrokeCount() > 0
        ? `${params.selectedStrokeCount()} selected`
        : 'Ready',
    )
    return true
  }

  const isStrokeSelectionPointer = (event: PointerEvent) =>
    editPointerId === event.pointerId

  return {
    deleteSelectedStrokes,
    endStrokeSelection,
    isStrokeSelectionPointer,
    moveStrokeSelection,
    startStrokeSelection,
  } as const
}
