import type { Accessor, Setter } from 'solid-js'
import {
  deletePointsFromActiveDrawing,
  translatePointsInActiveDrawing,
  type Drawing,
  type GreaseDocument,
  type GreaseLayer,
  type StrokeId,
  type StrokePointKey,
} from '../../document'
import { sub3, type Vec3 } from '../../shared/vector'
import { findNearestPoint } from './hitTesting'
import { isEditableLayer } from './layerEditability'
import type { InteractionViewport } from './viewportPort'

type PointSelectionInteractionParams = {
  activeDrawing: Accessor<Drawing | undefined>
  activeLayer: Accessor<GreaseLayer | undefined>
  renderer: Accessor<InteractionViewport | undefined>
  selectedPointCount: Accessor<number>
  selectedPointKeys: Accessor<ReadonlySet<StrokePointKey>>
  setDocumentState: Setter<GreaseDocument>
  setPointerLabel: Setter<string>
  setSelectedPointKeys: Setter<ReadonlySet<StrokePointKey>>
  setSelectedStrokeIds: Setter<ReadonlySet<StrokeId>>
}

const POINT_SELECT_RADIUS = 0.14

export function createPointSelectionInteraction(
  params: PointSelectionInteractionParams,
) {
  let pointEditPointerId: number | undefined
  let lastPointEditPosition: Vec3 | undefined

  const deleteSelectedPoints = () => {
    const selected = params.selectedPointKeys()
    if (selected.size === 0) return

    params.setDocumentState((currentDocument) =>
      deletePointsFromActiveDrawing(currentDocument, selected),
    )
    params.setSelectedPointKeys(new Set<StrokePointKey>())
    params.setPointerLabel('Points deleted')
  }

  const startPointSelection = (event: PointerEvent) => {
    if (!isEditableLayer(params.activeLayer())) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    const hit = findNearestPoint(params.activeDrawing(), position, POINT_SELECT_RADIUS)
    if (!hit) {
      if (!event.shiftKey) params.setSelectedPointKeys(new Set<StrokePointKey>())
      params.setPointerLabel(event.shiftKey ? 'No point hit' : 'Point selection cleared')
      return
    }

    let nextSelection = new Set<StrokePointKey>()
    const currentSelection = params.selectedPointKeys()
    if (event.shiftKey) {
      nextSelection = new Set(currentSelection)
      if (nextSelection.has(hit.pointKey)) nextSelection.delete(hit.pointKey)
      else nextSelection.add(hit.pointKey)
    }
    else if (currentSelection.has(hit.pointKey)) {
      nextSelection = new Set(currentSelection)
    }
    else {
      nextSelection.add(hit.pointKey)
    }

    params.setSelectedPointKeys(nextSelection)
    params.setSelectedStrokeIds(new Set<StrokeId>())
    if (nextSelection.has(hit.pointKey)) {
      pointEditPointerId = event.pointerId
      lastPointEditPosition = position
    }
    params.setPointerLabel(`${nextSelection.size} points selected`)
  }

  const movePointSelection = (event: PointerEvent) => {
    if (
      !isPointSelectionPointer(event) ||
      params.selectedPointKeys().size === 0
    ) {
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position || !lastPointEditPosition) return

    const delta = sub3(position, lastPointEditPosition)
    lastPointEditPosition = position
    params.setDocumentState((currentDocument) =>
      translatePointsInActiveDrawing(
        currentDocument,
        params.selectedPointKeys(),
        delta,
      ),
    )
    params.setPointerLabel(`Moved ${params.selectedPointCount()} points`)
  }

  const endPointSelection = (event: PointerEvent) => {
    if (!isPointSelectionPointer(event)) return false
    pointEditPointerId = undefined
    lastPointEditPosition = undefined
    params.setPointerLabel(
      params.selectedPointCount() > 0
        ? `${params.selectedPointCount()} points selected`
        : 'Ready',
    )
    return true
  }

  const isPointSelectionPointer = (event: PointerEvent) =>
    pointEditPointerId === event.pointerId

  return {
    deleteSelectedPoints,
    endPointSelection,
    isPointSelectionPointer,
    movePointSelection,
    startPointSelection,
  } as const
}
