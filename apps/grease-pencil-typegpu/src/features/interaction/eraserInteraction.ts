import type { Accessor, Setter } from 'solid-js'
import {
  eraseStrokeSegmentFromActiveDrawing,
  type GreaseDocument,
  type GreaseLayer,
  type StrokeId,
  type StrokePointKey,
} from '../../document'
import type { Vec3 } from '../../shared/vector'
import type { InteractionViewport } from './viewportPort'

type EraserInteractionParams = {
  activeLayer: Accessor<GreaseLayer | undefined>
  eraserRadius: Accessor<number>
  renderer: Accessor<InteractionViewport | undefined>
  setDocumentState: Setter<GreaseDocument>
  setPointerLabel: Setter<string>
  setSelectedPointKeys: Setter<ReadonlySet<StrokePointKey>>
  setSelectedStrokeIds: Setter<ReadonlySet<StrokeId>>
}

export function createEraserInteraction(params: EraserInteractionParams) {
  let erasePointerId: number | undefined
  let lastErasePosition: Vec3 | undefined

  const startEraser = (event: PointerEvent) => {
    if (!isLayerEditable(params.activeLayer())) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    erasePointerId = event.pointerId
    lastErasePosition = position
    eraseBetween(position, position)
  }

  const eraseAtEvent = (event: PointerEvent) => {
    if (!isActivePointer(event)) return
    if (!isLayerEditable(params.activeLayer())) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    eraseBetween(lastErasePosition ?? position, position)
    lastErasePosition = position
  }

  const endEraser = (event: PointerEvent) => {
    if (!isActivePointer(event)) return false
    erasePointerId = undefined
    lastErasePosition = undefined
    params.setPointerLabel('Ready')
    return true
  }

  const isActivePointer = (event: PointerEvent) => erasePointerId === event.pointerId

  const eraseBetween = (start: Vec3, end: Vec3) => {
    let changed = false

    params.setDocumentState((currentDocument) => {
      const nextDocument = eraseStrokeSegmentFromActiveDrawing(
        currentDocument,
        start,
        end,
        params.eraserRadius(),
      )
      changed = nextDocument !== currentDocument
      return nextDocument
    })
    if (changed) {
      params.setSelectedStrokeIds(new Set<StrokeId>())
      params.setSelectedPointKeys(new Set<StrokePointKey>())
      params.setPointerLabel('Cut stroke')
    }
    else {
      params.setPointerLabel('Erase')
    }
  }

  return {
    endEraser,
    eraseAtEvent,
    isActivePointer,
    startEraser,
  } as const
}

function isLayerEditable(layer: GreaseLayer | undefined) {
  return Boolean(layer && layer.visible && !layer.locked)
}
