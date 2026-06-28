import type {
  Accessor,
  Setter,
} from 'solid-js'
import {
  setWorkplaneOriginVector,
  type DrawingWorkplane,
  type GreaseDocument,
} from '../../document'
import {
  add3,
  length3,
  scale3,
  sub3,
  type Vec3,
} from '../../render/math'
import { workplaneGizmoLength } from '../../render/meshOverlays'
import { getWorkplaneBasis } from '../../render/workplane'
import type { InteractionViewport } from './viewportPort'

type WorkplaneGizmoParams = {
  renderer: Accessor<InteractionViewport | undefined>
  setDocumentState: Setter<GreaseDocument>
  setPointerLabel: Setter<string>
  workplane: Accessor<DrawingWorkplane>
}

type ScreenPoint = {
  x: number
  y: number
}

type AxisDrag = {
  pointerId: number
  kind: 'axis'
  axis: Vec3
  axisName: 'X' | 'Y' | 'Z'
  pixelsPerWorldUnit: number
  screenAxis: ScreenPoint
  startOrigin: Vec3
  startPointer: ScreenPoint
}

type PlaneDrag = {
  pointerId: number
  kind: 'plane'
  offset: Vec3
}

type GizmoDrag = AxisDrag | PlaneDrag

const CENTER_HIT_RADIUS = 28
const AXIS_HIT_RADIUS = 18

export function createWorkplaneGizmoInteraction(params: WorkplaneGizmoParams) {
  let drag: GizmoDrag | undefined

  const startGizmoDrag = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return false

    const renderer = params.renderer()
    if (!renderer) return false

    const hit = hitTestWorkplaneGizmo(
      renderer,
      params.workplane(),
      event.clientX,
      event.clientY,
    )
    if (!hit) return false

    if (hit.kind === 'plane') {
      const pointerWorld = renderer.screenToWorld(event.clientX, event.clientY)
      if (!pointerWorld) return false

      drag = {
        pointerId: event.pointerId,
        kind: 'plane',
        offset: sub3(params.workplane().origin, pointerWorld),
      }
      params.setPointerLabel('Move grid')
      return true
    }

    drag = {
      pointerId: event.pointerId,
      kind: 'axis',
      axis: hit.axis,
      axisName: hit.axisName,
      pixelsPerWorldUnit: hit.pixelsPerWorldUnit,
      screenAxis: hit.screenAxis,
      startOrigin: [...params.workplane().origin],
      startPointer: { x: event.clientX, y: event.clientY },
    }
    params.setPointerLabel(`Move grid ${hit.axisName}`)
    return true
  }

  const moveGizmoDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return false

    if (drag.kind === 'plane') {
      const pointerWorld = params.renderer()?.screenToWorld(
        event.clientX,
        event.clientY,
      )
      if (!pointerWorld) return true

      setWorkplaneOrigin(add3(pointerWorld, drag.offset))
      return true
    }

    const pointerDelta = {
      x: event.clientX - drag.startPointer.x,
      y: event.clientY - drag.startPointer.y,
    }
    const worldDelta =
      (pointerDelta.x * drag.screenAxis.x + pointerDelta.y * drag.screenAxis.y) /
      drag.pixelsPerWorldUnit
    setWorkplaneOrigin(add3(drag.startOrigin, scale3(drag.axis, worldDelta)))
    return true
  }

  const endGizmoDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return false
    drag = undefined
    params.setPointerLabel('Ready')
    return true
  }

  const isActivePointer = (event: PointerEvent) =>
    drag?.pointerId === event.pointerId

  const setWorkplaneOrigin = (origin: Vec3) => {
    params.setDocumentState((document) =>
      setWorkplaneOriginVector(document, origin),
    )
  }

  return {
    endGizmoDrag,
    isActivePointer,
    moveGizmoDrag,
    startGizmoDrag,
  } as const
}

function hitTestWorkplaneGizmo(
  renderer: InteractionViewport,
  workplane: DrawingWorkplane,
  clientX: number,
  clientY: number,
) {
  const basis = getWorkplaneBasis(workplane)
  const origin = renderer.projectToScreen(basis.origin)
  if (!origin) return

  const pointer = { x: clientX, y: clientY }
  if (screenDistance(pointer, origin) <= CENTER_HIT_RADIUS) {
    return { kind: 'plane' as const }
  }

  const length = workplaneGizmoLength()
  const axisHits = [
    hitTestAxis(renderer, pointer, basis.origin, basis.right, length, 'X'),
    hitTestAxis(renderer, pointer, basis.origin, basis.up, length, 'Y'),
    hitTestAxis(renderer, pointer, basis.origin, basis.normal, length, 'Z'),
  ].filter((hit): hit is NonNullable<typeof hit> => !!hit)

  axisHits.sort((a, b) => a.distance - b.distance)
  return axisHits[0]
}

function hitTestAxis(
  renderer: InteractionViewport,
  pointer: ScreenPoint,
  origin: Vec3,
  axis: Vec3,
  axisLength: number,
  axisName: 'X' | 'Y' | 'Z',
) {
  const start = renderer.projectToScreen(origin)
  const end = renderer.projectToScreen(add3(origin, scale3(axis, axisLength)))
  if (!start || !end) return

  const screenAxis = {
    x: end.x - start.x,
    y: end.y - start.y,
  }
  const screenLength = Math.hypot(screenAxis.x, screenAxis.y)
  if (screenLength < 1e-3) return

  const distance = distanceToScreenSegment(pointer, start, end)
  if (distance > AXIS_HIT_RADIUS) return

  return {
    kind: 'axis' as const,
    axis,
    axisName,
    distance,
    pixelsPerWorldUnit: screenLength / axisLength,
    screenAxis: {
      x: screenAxis.x / screenLength,
      y: screenAxis.y / screenLength,
    },
  }
}

function distanceToScreenSegment(
  point: ScreenPoint,
  start: ScreenPoint,
  end: ScreenPoint,
) {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
  }
  const lengthSquared = segment.x * segment.x + segment.y * segment.y
  if (lengthSquared <= 1e-6) return screenDistance(point, start)

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segment.x + (point.y - start.y) * segment.y) /
        lengthSquared,
    ),
  )
  return screenDistance(point, {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
  })
}

function screenDistance(a: ScreenPoint, b: ScreenPoint) {
  return length3([a.x - b.x, a.y - b.y, 0])
}
