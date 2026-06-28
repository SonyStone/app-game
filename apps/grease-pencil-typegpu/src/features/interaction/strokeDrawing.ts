import type { Accessor, Setter } from 'solid-js'
import {
  appendStrokeToLayerFrame,
  createStroke,
  type GreaseDocument,
  type GreaseLayer,
  type GreaseMaterial,
  type LayerId,
  type Stroke,
} from '../../document'
import type { ToolMode } from '../../shared/toolMode'
import { shouldAppendPoint } from './drawingInput'
import { strokePointFromInput } from './strokeInput'
import type { InteractionViewport } from './viewportPort'

type DrawingTarget = {
  layerId: LayerId
  frameNumber: number
}

type StrokeDrawingParams = {
  activeLayer: Accessor<GreaseLayer | undefined>
  activeMaterial: Accessor<GreaseMaterial>
  brushStrength: Accessor<number>
  currentFrame: Accessor<number>
  draftStroke: Accessor<Stroke | undefined>
  mode: Accessor<ToolMode>
  renderer: Accessor<InteractionViewport | undefined>
  setDocumentState: Setter<GreaseDocument>
  setDraftStroke: Setter<Stroke | undefined>
  setPointerLabel: Setter<string>
}

export function createStrokeDrawingInteraction(params: StrokeDrawingParams) {
  let drawingPointerId: number | undefined
  let drawingTarget: DrawingTarget | undefined

  const startStroke = (event: PointerEvent) => {
    const layer = params.activeLayer()
    if (!layer || layer.locked || !layer.visible) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const renderer = params.renderer()
    if (!renderer) return

    const position = renderer.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    drawingPointerId = event.pointerId
    drawingTarget = {
      layerId: layer.id,
      frameNumber: params.currentFrame(),
    }
    const material = params.activeMaterial()
    const point = strokePointFromInput(
      event,
      material,
      params.brushStrength(),
      renderer.offsetFromWorkplane(position, 0.002),
    )
    params.setDraftStroke(
      createStroke(material, [point], { closed: params.mode() === 'fill' }),
    )
    params.setPointerLabel(`${event.pointerType} pressure ${point.pressure.toFixed(2)}`)
  }

  const appendDraftPoint = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    const renderer = params.renderer()
    if (!renderer) return

    const position = renderer.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    params.setDraftStroke((current) => {
      if (!current) return current
      const material = params.activeMaterial()
      const point = strokePointFromInput(
        event,
        material,
        params.brushStrength(),
        renderer.offsetFromWorkplane(position, 0.002),
      )
      if (!shouldAppendPoint(current.points, point)) return current
      params.setPointerLabel(`${event.pointerType} pressure ${point.pressure.toFixed(2)}`)
      return {
        ...current,
        points: [...current.points, point],
      }
    })
  }

  const commitDraftStroke = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    const draft = params.draftStroke()
    const target = drawingTarget
    drawingPointerId = undefined
    drawingTarget = undefined
    params.setDraftStroke(undefined)

    if (draft && target && draft.points.length > 0) {
      params.setDocumentState((currentDocument) =>
        appendStrokeToLayerFrame(
          currentDocument,
          target.layerId,
          target.frameNumber,
          draft,
        ),
      )
    }
    params.setPointerLabel('Ready')
  }

  return {
    appendDraftPoint,
    commitDraftStroke,
    startStroke,
  } as const
}
