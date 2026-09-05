import { createGizmoPlaneDrag } from './gizmoPlaneDrag'
import { gizmoPlanes, frontGizmoRing } from '../../render/gizmoGeometry'
import { createCameraMatrices } from '../../render/cameraMatrices'
import { createGizmoRotationDrag } from './gizmoRotation'
import type { CameraState } from '../../render/cameraMatrices'
import type {
  Accessor,
  Setter,
} from 'solid-js'
import {
  setWorkplaneRotationVector as setDocumentWorkplaneRotationVector,
  setWorkplaneOriginVector,
  type DrawingWorkplane,
  type GreaseDocument,
} from '../../document'
import {
  add3,
  length3,
  scale3,
  type Vec3,
} from '../../render/math'
import {
  workplaneGizmoLength,
  workplaneRotationGizmoRadius,
} from '../../render/meshOverlays'
import type {
  WorkplaneGizmoAxisName,
  WorkplaneGizmoMode,
  WorkplaneGizmoHighlight,
} from '../../render/workplaneGizmoTypes'
import { getWorkplaneBasis } from '../../render/workplane'
import type { InteractionViewport } from './viewportPort'

type WorkplaneGizmoParams = {
  camera: Accessor<CameraState>
  canvas: Accessor<HTMLCanvasElement>
  mode: Accessor<WorkplaneGizmoMode>
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
  move: NonNullable<ReturnType<typeof createGizmoPlaneDrag>>
}

type RotationDrag = {
  pointerId: number
  kind: 'rotation'
  rotate: ReturnType<typeof createGizmoRotationDrag>
}

type GizmoDrag = AxisDrag | PlaneDrag | RotationDrag

const CENTER_HIT_RADIUS = 12
const AXIS_HIT_RADIUS = 10
const ROTATION_HIT_RADIUS = 8

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
      params.mode(),
      createCameraMatrices(params.camera(), 1).position,
    )
    if (!hit) {
      setGizmoHighlight(undefined)
      return false
    }

    setGizmoHighlight(highlightFromHit(hit))

    if (hit.kind === 'plane') {
      const move = createGizmoPlaneDrag(
        params.camera(), params.canvas().getBoundingClientRect(), params.workplane().origin,
        hit.normal, { x: event.clientX, y: event.clientY },
      )
      if (!move) return false
      drag = { pointerId: event.pointerId, kind: 'plane', move }
      params.setPointerLabel(`Move grid ${hit.plane}`)
      return true
    }

    if (hit.kind === 'rotation') {
      drag = {
        pointerId: event.pointerId,
        kind: 'rotation',
        rotate: createGizmoRotationDrag(
          params.camera(), params.canvas().getBoundingClientRect(), params.workplane(),
          hit.axisName, { x: event.clientX, y: event.clientY }, hit.ringAngle,
        ),
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
      const origin = drag.move({ x: event.clientX, y: event.clientY })
      if (origin) setGridOrigin(origin)
      return true
    }

    if (drag.kind === 'rotation') {
      setGridRotation(drag.rotate({ x: event.clientX, y: event.clientY }))
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
      params.mode(),
      createCameraMatrices(params.camera(), 1).position,
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

/** Hit testing uses only the handles displayed by the selected manipulator mode. */
export function hitTestWorkplaneGizmo(
  renderer: InteractionViewport,
  workplane: DrawingWorkplane,
  clientX: number,
  clientY: number,
  mode: WorkplaneGizmoMode,
  cameraPosition: Vec3,
) {
  const basis = getWorkplaneBasis(workplane)
  const origin = renderer.projectToScreen(basis.origin)
  if (!origin) return

  const pointer = { x: clientX, y: clientY }
  if (screenDistance(pointer, origin) <= CENTER_HIT_RADIUS) return

  const units = renderer.worldUnitsPerPixel(basis.origin)
  if (units <= 0) return
  const length = workplaneGizmoLength(units)
  if (mode === 'translate') {
    for (const plane of gizmoPlanes(basis, units)) {
      const points = plane.corners.map(point => renderer.projectToScreen(point))
      if (points.some(point => !point)) continue
      if (hitsPlaneSquare(pointer, points as ScreenPoint[])) return { kind: 'plane' as const, plane: plane.name, normal: plane.normal }
    }
  }
  const hits = (mode === 'translate' ? [
    hitTestAxis(renderer, pointer, basis.origin, basis.right, length, 'X'),
    hitTestAxis(renderer, pointer, basis.origin, basis.up, length, 'Y'),
    hitTestAxis(renderer, pointer, basis.origin, basis.normal, length, 'Z'),
  ] : [
    hitTestRotationRing(
      renderer,
      pointer,
      basis.origin,
      basis.up,
      basis.normal,
      'X',
      cameraPosition,
    ),
    hitTestRotationRing(
      renderer,
      pointer,
      basis.origin,
      basis.normal,
      basis.right,
      'Y',
      cameraPosition,
    ),
    hitTestRotationRing(
      renderer,
      pointer,
      basis.origin,
      basis.right,
      basis.up,
      'Z',
      cameraPosition,
    ),
  ]).filter((hit): hit is NonNullable<typeof hit> => !!hit)

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

  const inner = renderer.projectToScreen(add3(origin, scale3(axis, axisLength * 20 / 90)))
  if (!inner) return
  const distance = distanceToScreenSegment(pointer, inner, end)
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
  cameraPosition: Vec3,
) {
  const screenOrigin = renderer.projectToScreen(origin)
  if (!screenOrigin) return

  const radius = workplaneRotationGizmoRadius(renderer.worldUnitsPerPixel(origin))
  let minDistance = Number.POSITIVE_INFINITY
  let ringAngle = 0
  for (const segment of frontGizmoRing(origin, axisA, axisB, radius, cameraPosition)) {
    const start = renderer.projectToScreen(segment.start)
    const end = renderer.projectToScreen(segment.end)
    if (!start || !end) continue
    const distance = distanceToScreenSegment(pointer, start, end)
    if (distance < minDistance) {
      minDistance = distance
      ringAngle = segment.angle
    }
  }

  if (minDistance > ROTATION_HIT_RADIUS) return

  return {
    kind: 'rotation' as const,
    axisName,
    distance: minDistance,
    ringAngle,
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

function highlightFromHit(
  hit: NonNullable<ReturnType<typeof hitTestWorkplaneGizmo>>,
): WorkplaneGizmoHighlight {
  switch (hit.kind) {
    case 'plane':
      return { kind: 'plane', plane: hit.plane }
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
  if (a.kind === 'plane' && b.kind === 'plane') return a.plane === b.plane
  if (a.kind === 'plane' || b.kind === 'plane') return false
  return a.axisName === b.axisName
}

/** Ignore collapsed edge-on squares and allow a small border tolerance without expanding into the center. */
function hitsPlaneSquare(pointer: ScreenPoint, points: ScreenPoint[]) {
  let area = 0
  const sides: number[] = []
  let edgeDistance = Infinity
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4]
    area += a.x * b.y - b.x * a.y
    sides.push((b.x - a.x) * (pointer.y - a.y) - (b.y - a.y) * (pointer.x - a.x))
    edgeDistance = Math.min(edgeDistance, distanceToScreenSegment(pointer, a, b))
  }
  if (Math.abs(area) < 40) return false
  return sides.every(side => side >= 0) || sides.every(side => side <= 0) || edgeDistance <= 3
}
