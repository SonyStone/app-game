import type { Accessor, Setter } from 'solid-js'
import {
  appendStrokeToLayerFrame,
  createStroke,
  createStrokePointKey,
  deletePointsFromActiveDrawing,
  deleteStrokesFromActiveDrawing,
  eraseStrokeSegmentFromActiveDrawing,
  translatePointsInActiveDrawing,
  translateStrokesInActiveDrawing,
  type Drawing,
  type GreaseDocument,
  type GreaseLayer,
  type GreaseMaterial,
  type LayerId,
  type Stroke,
  type StrokeId,
  type StrokePoint,
  type StrokePointKey,
} from '../../document'
import {
  GreaseRenderer,
  pointerPressure,
  shouldAppendPoint,
} from '../../render/greaseRenderer'
import {
  add3,
  distance3,
  dot3,
  scale3,
  sub3,
  type Vec3,
} from '../../render/math'
import { copyVec4 } from '../shared/color'
import type { ToolMode } from '../tools/toolMode'

type ViewAction = 'orbit' | 'pan'

type DrawingTarget = {
  layerId: LayerId
  frameNumber: number
}

type StrokeHit = {
  strokeId: StrokeId
  distance: number
}

type PointHit = {
  pointKey: StrokePointKey
  distance: number
}

type UseCanvasInteractionParams = {
  canvas: Accessor<HTMLCanvasElement>
  renderer: Accessor<GreaseRenderer | undefined>
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

const SELECT_RADIUS = 0.16
const POINT_SELECT_RADIUS = 0.14

export function useCanvasInteraction(params: UseCanvasInteractionParams) {
  const activePointers = new Map<number, PointerEvent>()
  let drawingPointerId: number | undefined
  let drawingTarget: DrawingTarget | undefined
  let editPointerId: number | undefined
  let pointEditPointerId: number | undefined
  let erasePointerId: number | undefined
  let lastEditPosition: Vec3 | undefined
  let lastPointEditPosition: Vec3 | undefined
  let lastErasePosition: Vec3 | undefined
  let viewPointerId: number | undefined
  let viewAction: ViewAction | undefined
  let lastViewPoint: { x: number; y: number } | undefined
  let lastPinchDistance: number | undefined
  let lastPinchCenter: { x: number; y: number } | undefined

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

  const deleteSelectedPoints = () => {
    const selected = params.selectedPointKeys()
    if (selected.size === 0) return

    params.setDocumentState((currentDocument) =>
      deletePointsFromActiveDrawing(currentDocument, selected),
    )
    params.setSelectedPointKeys(new Set<StrokePointKey>())
    params.setPointerLabel('Points deleted')
  }

  const deleteCurrentSelection = () => {
    if (params.selectedPointKeys().size > 0) {
      deleteSelectedPoints()
      return
    }

    deleteSelectedStrokes()
  }

  const startSelection = (event: PointerEvent) => {
    if (!isActiveLayerEditable()) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    const hit = findNearestStroke(position, SELECT_RADIUS)
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

  const startPointEdit = (event: PointerEvent) => {
    if (!isActiveLayerEditable()) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    const hit = findNearestPoint(position, POINT_SELECT_RADIUS)
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

  const moveSelection = (event: PointerEvent) => {
    if (editPointerId !== event.pointerId || params.selectedStrokeIds().size === 0) {
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

  const movePointSelection = (event: PointerEvent) => {
    if (
      pointEditPointerId !== event.pointerId ||
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

  const startEraser = (event: PointerEvent) => {
    if (!isActiveLayerEditable()) {
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
    if (erasePointerId !== event.pointerId) return
    if (!isActiveLayerEditable()) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const position = params.renderer()?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    eraseBetween(lastErasePosition ?? position, position)
    lastErasePosition = position
  }

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

  const startStroke = (event: PointerEvent) => {
    const layer = params.activeLayer()
    if (!layer || layer.locked || !layer.visible) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const renderer = params.renderer()
    const position = renderer?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    drawingPointerId = event.pointerId
    drawingTarget = {
      layerId: layer.id,
      frameNumber: params.currentFrame(),
    }
    const material = params.activeMaterial()
    const pressure = pointerPressure(event)
    const radius = radiusFromInput(material.strokeRadius, pressure)
    const point: StrokePoint = {
      position: renderer?.offsetFromWorkplane(position, 0.002) ?? position,
      pressure,
      radius,
      opacity: opacityFromInput(event, pressure, params.brushStrength()),
      vertexColor: copyVec4(material.strokeColor),
      time: performance.now(),
    }
    params.setDraftStroke(
      createStroke(material, [point], { closed: params.mode() === 'fill' }),
    )
    params.setPointerLabel(`${event.pointerType} pressure ${point.pressure.toFixed(2)}`)
  }

  const appendDraftPoint = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    const renderer = params.renderer()
    const position = renderer?.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    params.setDraftStroke((current) => {
      if (!current) return current
      const material = params.activeMaterial()
      const pressure = pointerPressure(event)
      const radius = radiusFromInput(material.strokeRadius, pressure)
      const point: StrokePoint = {
        position: renderer?.offsetFromWorkplane(position, 0.002) ?? position,
        pressure,
        radius,
        opacity: opacityFromInput(event, pressure, params.brushStrength()),
        vertexColor: copyVec4(material.strokeColor),
        time: performance.now(),
      }
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

  const onPointerDown = (event: PointerEvent) => {
    params.canvas().setPointerCapture(event.pointerId)
    activePointers.set(event.pointerId, event)

    if (activePointers.size === 2) {
      lastPinchDistance = getPointerDistance()
      lastPinchCenter = getPointerCenter()
      return
    }

    const nextViewAction = getViewAction(event)
    if (nextViewAction) {
      viewPointerId = event.pointerId
      viewAction = nextViewAction
      lastViewPoint = { x: event.clientX, y: event.clientY }
      params.setPointerLabel(nextViewAction === 'pan' ? 'Pan' : 'Orbit')
      return
    }

    if (params.mode() === 'select') {
      startSelection(event)
      return
    }

    if (params.mode() === 'edit') {
      startPointEdit(event)
      return
    }

    if (params.mode() === 'erase') {
      startEraser(event)
      return
    }

    startStroke(event)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointers.has(event.pointerId)) return
    activePointers.set(event.pointerId, event)

    if (activePointers.size >= 2) {
      const nextDistance = getPointerDistance()
      if (nextDistance && lastPinchDistance) {
        params.renderer()?.zoom((lastPinchDistance - nextDistance) * 2.2)
      }
      const nextCenter = getPointerCenter()
      if (nextCenter && lastPinchCenter) {
        params.renderer()?.pan(
          nextCenter.x - lastPinchCenter.x,
          nextCenter.y - lastPinchCenter.y,
        )
      }
      lastPinchDistance = nextDistance
      lastPinchCenter = nextCenter
      params.setPointerLabel('Touch pan/zoom')
      return
    }

    if (editPointerId === event.pointerId) {
      moveSelection(event)
      return
    }

    if (pointEditPointerId === event.pointerId) {
      movePointSelection(event)
      return
    }

    if (erasePointerId === event.pointerId) {
      eraseAtEvent(event)
      return
    }

    if (viewPointerId === event.pointerId && lastViewPoint && viewAction) {
      const dx = event.clientX - lastViewPoint.x
      const dy = event.clientY - lastViewPoint.y
      if (viewAction === 'pan') params.renderer()?.pan(dx, dy)
      else params.renderer()?.orbit(dx, dy)
      lastViewPoint = { x: event.clientX, y: event.clientY }
      return
    }

    appendDraftPoint(event)
  }

  const onPointerUp = (event: PointerEvent) => {
    activePointers.delete(event.pointerId)
    if (viewPointerId === event.pointerId) {
      viewPointerId = undefined
      viewAction = undefined
      lastViewPoint = undefined
      params.setPointerLabel('Ready')
    }
    if (editPointerId === event.pointerId) {
      editPointerId = undefined
      lastEditPosition = undefined
      params.setPointerLabel(
        params.selectedStrokeCount() > 0
          ? `${params.selectedStrokeCount()} selected`
          : 'Ready',
      )
    }
    if (pointEditPointerId === event.pointerId) {
      pointEditPointerId = undefined
      lastPointEditPosition = undefined
      params.setPointerLabel(
        params.selectedPointCount() > 0
          ? `${params.selectedPointCount()} points selected`
          : 'Ready',
      )
    }
    if (erasePointerId === event.pointerId) {
      erasePointerId = undefined
      lastErasePosition = undefined
      params.setPointerLabel('Ready')
    }
    commitDraftStroke(event)
    if (activePointers.size < 2) {
      lastPinchDistance = undefined
      lastPinchCenter = undefined
    }
  }

  const getViewAction = (event: PointerEvent): ViewAction | undefined => {
    if (params.mode() === 'pan' || event.button === 2) return 'pan'
    if (
      params.mode() === 'orbit' ||
      event.button === 1 ||
      event.altKey ||
      event.metaKey ||
      isStylusBarrelButton(event)
    ) {
      return 'orbit'
    }
    if (event.shiftKey && params.mode() === 'draw') return 'pan'
    return undefined
  }

  const getPointerDistance = () => {
    const pointers = [...activePointers.values()]
    const first = pointers[0]
    const second = pointers[1]
    if (!first || !second) return undefined
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
  }

  const getPointerCenter = () => {
    const pointers = [...activePointers.values()]
    const first = pointers[0]
    const second = pointers[1]
    if (!first || !second) return undefined
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    }
  }

  const isActiveLayerEditable = () => {
    const layer = params.activeLayer()
    return Boolean(layer && layer.visible && !layer.locked)
  }

  const findNearestStroke = (
    position: Vec3,
    maxDistance: number,
  ): StrokeHit | undefined => {
    const drawing = params.activeDrawing()
    if (!drawing) return undefined

    let nearest: StrokeHit | undefined
    for (const stroke of drawing.strokes) {
      const distance = Math.max(0, distanceToStroke(position, stroke) - stroke.radius)
      if (distance > maxDistance) continue
      if (!nearest || distance < nearest.distance) {
        nearest = {
          strokeId: stroke.id,
          distance,
        }
      }
    }
    return nearest
  }

  const findNearestPoint = (
    position: Vec3,
    maxDistance: number,
  ): PointHit | undefined => {
    const drawing = params.activeDrawing()
    if (!drawing) return undefined

    let nearest: PointHit | undefined
    for (const stroke of drawing.strokes) {
      for (let pointIndex = 0; pointIndex < stroke.points.length; pointIndex += 1) {
        const point = stroke.points[pointIndex]
        if (!point) continue
        const distance = distance3(position, point.position)
        if (distance > maxDistance) continue
        if (!nearest || distance < nearest.distance) {
          nearest = {
            pointKey: createStrokePointKey(stroke.id, pointIndex),
            distance,
          }
        }
      }
    }
    return nearest
  }

  return {
    deleteCurrentSelection,
    deleteSelectedPoints,
    deleteSelectedStrokes,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}

function isStylusBarrelButton(event: PointerEvent) {
  return event.pointerType === 'pen' && (event.buttons & 32) !== 0
}

function opacityFromInput(
  event: PointerEvent,
  pressure: number,
  brushStrength: number,
) {
  const pressureOpacity = event.pointerType === 'mouse' ? 1 : Math.max(0.12, pressure)
  return clamp01(brushStrength * pressureOpacity)
}

function radiusFromInput(strokeRadius: number, pressure: number) {
  const radius = strokeRadius * pressure
  if (!Number.isFinite(radius)) return 0.045
  return Math.max(0.002, Math.min(0.4, radius))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}

function distanceToStroke(position: Vec3, stroke: Stroke) {
  if (stroke.points.length === 0) return Number.POSITIVE_INFINITY
  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    return point ? distance3(position, point.position) : Number.POSITIVE_INFINITY
  }

  let minDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    const current = stroke.points[i]
    const next = stroke.points[i + 1]
    if (!current || !next) continue
    minDistance = Math.min(
      minDistance,
      distanceToSegment(position, current.position, next.position),
    )
  }

  return minDistance
}

function distanceToSegment(position: Vec3, start: Vec3, end: Vec3) {
  const segment = sub3(end, start)
  const lengthSquared = dot3(segment, segment)
  if (lengthSquared < 1e-10) return distance3(position, start)

  const rawT = dot3(sub3(position, start), segment) / lengthSquared
  const t = Math.max(0, Math.min(1, rawT))
  return distance3(position, add3(start, scale3(segment, t)))
}
