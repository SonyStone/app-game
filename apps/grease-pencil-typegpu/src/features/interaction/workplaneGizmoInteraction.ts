import type {
  Accessor,
  Setter,
} from 'solid-js'
import {
  setWorkplaneRotationVector as setDocumentWorkplaneRotationVector,
  setWorkplaneOriginVector,
  type Axis,
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
import {
  workplaneGizmoLength,
  workplaneRotationGizmoRadius,
} from '../../render/meshOverlays'
import type {
  WorkplaneGizmoAxisName,
  WorkplaneGizmoHighlight,
} from '../../render/workplaneGizmoTypes'
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

type RotationDrag = {
  pointerId: number
  kind: 'rotation'
  axis: Axis
  axisName: 'X' | 'Y' | 'Z'
  screenOrigin: ScreenPoint
  startPointerAngle: number
  startRotation: Vec3
}

type GizmoDrag = AxisDrag | PlaneDrag | RotationDrag

const CENTER_HIT_RADIUS = 28
const AXIS_HIT_RADIUS = 18
const ROTATION_HIT_RADIUS = 14

export function createWorkplaneGizmoInteraction(params: WorkplaneGizmoParams) {
  let drag: GizmoDrag | undefined
  let hoverHighlight: WorkplaneGizmoHighlight | undefined

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
    if (!hit) {
      setGizmoHighlight(undefined)
      return false
    }

    setGizmoHighlight(highlightFromHit(hit))

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

    if (hit.kind === 'rotation') {
      drag = {
        pointerId: event.pointerId,
        kind: 'rotation',
        axis: axisNameToAxis(hit.axisName),
        axisName: hit.axisName,
        screenOrigin: hit.screenOrigin,
        startPointerAngle: screenAngle(
          { x: event.clientX, y: event.clientY },
          hit.screenOrigin,
        ),
        startRotation: [...params.workplane().rotation],
      }
      params.setPointerLabel(`Rotate grid ${hit.axisName}`)
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

      setGridOrigin(add3(pointerWorld, drag.offset))
      return true
    }

    if (drag.kind === 'rotation') {
      const pointerAngle = screenAngle(
        { x: event.clientX, y: event.clientY },
        drag.screenOrigin,
      )
      const angleDelta = shortestAngle(pointerAngle - drag.startPointerAngle)
      setGridRotation(
        replaceAxisValue(
          drag.startRotation,
          drag.axis,
          axisValue(drag.startRotation, drag.axis) + angleDelta,
        ),
      )
      return true
    }

    const pointerDelta = {
      x: event.clientX - drag.startPointer.x,
      y: event.clientY - drag.startPointer.y,
    }
    const worldDelta =
      (pointerDelta.x * drag.screenAxis.x + pointerDelta.y * drag.screenAxis.y) /
      drag.pixelsPerWorldUnit
    setGridOrigin(add3(drag.startOrigin, scale3(drag.axis, worldDelta)))
    return true
  }

  const endGizmoDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return false
    drag = undefined
    params.setPointerLabel('Ready')
    return true
  }

  const updateGizmoHover = (event: PointerEvent) => {
    if (drag || event.pointerType === 'touch' || event.buttons !== 0) return
    const renderer = params.renderer()
    if (!renderer) return
    const hit = hitTestWorkplaneGizmo(
      renderer,
      params.workplane(),
      event.clientX,
      event.clientY,
    )
    setGizmoHighlight(hit ? highlightFromHit(hit) : undefined)
  }

  const isActivePointer = (event: PointerEvent) =>
    drag?.pointerId === event.pointerId

  const setGridOrigin = (origin: Vec3) => {
    params.setDocumentState((document) =>
      setWorkplaneOriginVector(document, origin),
    )
  }

  const setGridRotation = (rotation: Vec3) => {
    params.setDocumentState((document) =>
      setDocumentWorkplaneRotationVector(document, rotation),
    )
  }

  const setGizmoHighlight = (
    nextHighlight: WorkplaneGizmoHighlight | undefined,
  ) => {
    if (sameHighlight(hoverHighlight, nextHighlight)) return
    hoverHighlight = nextHighlight
    params.renderer()?.setWorkplaneGizmoHighlight(nextHighlight)
  }

  return {
    endGizmoDrag,
    isActivePointer,
    moveGizmoDrag,
    startGizmoDrag,
    updateGizmoHover,
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
  const hits = [
    hitTestAxis(renderer, pointer, basis.origin, basis.right, length, 'X'),
    hitTestAxis(renderer, pointer, basis.origin, basis.up, length, 'Y'),
    hitTestAxis(renderer, pointer, basis.origin, basis.normal, length, 'Z'),
    hitTestRotationRing(
      renderer,
      pointer,
      basis.origin,
      basis.up,
      basis.normal,
      'X',
    ),
    hitTestRotationRing(
      renderer,
      pointer,
      basis.origin,
      basis.normal,
      basis.right,
      'Y',
    ),
    hitTestRotationRing(
      renderer,
      pointer,
      basis.origin,
      basis.right,
      basis.up,
      'Z',
    ),
  ].filter((hit): hit is NonNullable<typeof hit> => !!hit)

  hits.sort((a, b) => a.distance - b.distance)
  return hits[0]
}

function hitTestAxis(
  renderer: InteractionViewport,
  pointer: ScreenPoint,
  origin: Vec3,
  axis: Vec3,
  axisLength: number,
  axisName: WorkplaneGizmoAxisName,
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

function hitTestRotationRing(
  renderer: InteractionViewport,
  pointer: ScreenPoint,
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  axisName: WorkplaneGizmoAxisName,
) {
  const screenOrigin = renderer.projectToScreen(origin)
  if (!screenOrigin) return

  const radius = workplaneRotationGizmoRadius()
  const segmentCount = 48
  let minDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = (index / segmentCount) * Math.PI * 2
    const endAngle = ((index + 1) / segmentCount) * Math.PI * 2
    const start = renderer.projectToScreen(
      ringPoint(origin, axisA, axisB, radius, startAngle),
    )
    const end = renderer.projectToScreen(
      ringPoint(origin, axisA, axisB, radius, endAngle),
    )
    if (!start || !end) continue
    minDistance = Math.min(
      minDistance,
      distanceToScreenSegment(pointer, start, end),
    )
  }

  if (minDistance > ROTATION_HIT_RADIUS) return

  return {
    kind: 'rotation' as const,
    axisName,
    distance: minDistance,
    screenOrigin,
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

function ringPoint(
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  radius: number,
  angle: number,
) {
  return add3(
    origin,
    add3(
      scale3(axisA, Math.cos(angle) * radius),
      scale3(axisB, Math.sin(angle) * radius),
    ),
  )
}

function screenAngle(point: ScreenPoint, origin: ScreenPoint) {
  return Math.atan2(point.y - origin.y, point.x - origin.x)
}

function shortestAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function axisNameToAxis(axisName: WorkplaneGizmoAxisName): Axis {
  switch (axisName) {
    case 'X':
      return 'x'
    case 'Y':
      return 'y'
    case 'Z':
      return 'z'
  }
}

function highlightFromHit(
  hit: NonNullable<ReturnType<typeof hitTestWorkplaneGizmo>>,
): WorkplaneGizmoHighlight {
  switch (hit.kind) {
    case 'plane':
      return { kind: 'plane' }
    case 'axis':
      return { kind: 'axis', axisName: hit.axisName }
    case 'rotation':
      return { kind: 'rotation', axisName: hit.axisName }
  }
}

function sameHighlight(
  a: WorkplaneGizmoHighlight | undefined,
  b: WorkplaneGizmoHighlight | undefined,
) {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'plane' || b.kind === 'plane') return true
  return a.axisName === b.axisName
}

function axisValue(value: Vec3, axis: Axis) {
  switch (axis) {
    case 'x':
      return value[0]
    case 'y':
      return value[1]
    case 'z':
      return value[2]
  }
}

function replaceAxisValue(value: Vec3, axis: Axis, nextValue: number): Vec3 {
  switch (axis) {
    case 'x':
      return [nextValue, value[1], value[2]]
    case 'y':
      return [value[0], nextValue, value[2]]
    case 'z':
      return [value[0], value[1], nextValue]
  }
}
