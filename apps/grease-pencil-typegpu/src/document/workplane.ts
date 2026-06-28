import { copyVec3 } from './geometry'
import { createWorkplaneId } from './ids'
import type {
  Axis,
  DrawingGrid,
  DrawingWorkplane,
  GreaseDocument,
  WorkplaneId,
} from './model'
import type { Vec3 } from '../shared/vector'

export function setWorkplaneOrigin(
  document: GreaseDocument,
  axis: Axis,
  value: number,
): GreaseDocument {
  return updateActiveWorkplane(document, {
    ...document.workplane,
    origin: replaceAxisValue(
      document.workplane.origin,
      axis,
      sanitizeScalar(value),
    ),
  })
}

export function setWorkplaneOriginVector(
  document: GreaseDocument,
  origin: Vec3,
): GreaseDocument {
  return updateActiveWorkplane(document, {
    ...document.workplane,
    origin: sanitizeVec3(origin),
  })
}

export function setWorkplaneRotation(
  document: GreaseDocument,
  axis: Axis,
  value: number,
): GreaseDocument {
  return updateActiveWorkplane(document, {
    ...document.workplane,
    rotation: replaceAxisValue(
      document.workplane.rotation,
      axis,
      sanitizeScalar(value),
    ),
  })
}

export function setWorkplaneRotationVector(
  document: GreaseDocument,
  rotation: Vec3,
): GreaseDocument {
  return updateActiveWorkplane(document, {
    ...document.workplane,
    rotation: sanitizeVec3(rotation),
  })
}

export function setWorkplaneScale(
  document: GreaseDocument,
  gridScale: number,
): GreaseDocument {
  return updateActiveWorkplane(document, {
    ...document.workplane,
    gridScale: sanitizeGridScale(gridScale),
  })
}

export function resetWorkplane(document: GreaseDocument): GreaseDocument {
  return updateActiveWorkplane(document, createDefaultWorkplane())
}

export function addWorkplane(document: GreaseDocument): GreaseDocument {
  const workplanes = normalizeWorkplanes(document.workplanes, document.workplane)
  const workplane = normalizeWorkplane(document.workplane)
  const nextGrid = createDrawingGrid(
    `Grid ${workplanes.length + 1}`,
    workplane,
  )

  return {
    ...document,
    activeWorkplaneId: nextGrid.id,
    workplane,
    workplanes: [...workplanes, nextGrid],
  }
}

export function removeActiveWorkplane(document: GreaseDocument): GreaseDocument {
  const workplanes = normalizeWorkplanes(document.workplanes, document.workplane)
  if (workplanes.length <= 1) return document

  const activeIndex = Math.max(
    0,
    workplanes.findIndex((grid) => grid.id === document.activeWorkplaneId),
  )
  const nextWorkplanes = workplanes.filter(
    (grid) => grid.id !== document.activeWorkplaneId,
  )
  const nextActive =
    nextWorkplanes[Math.min(activeIndex, nextWorkplanes.length - 1)] ??
    nextWorkplanes[0]
  if (!nextActive) return document

  return {
    ...document,
    activeWorkplaneId: nextActive.id,
    workplane: drawingGridToWorkplane(nextActive),
    workplanes: nextWorkplanes,
  }
}

export function setActiveWorkplane(
  document: GreaseDocument,
  workplaneId: WorkplaneId,
): GreaseDocument {
  const workplanes = normalizeWorkplanes(document.workplanes, document.workplane)
  const active = workplanes.find((grid) => grid.id === workplaneId)
  if (!active) return document

  return {
    ...document,
    activeWorkplaneId: active.id,
    workplane: drawingGridToWorkplane(active),
    workplanes,
  }
}

export function createDefaultWorkplane(): DrawingWorkplane {
  return {
    origin: [0, 0, 0],
    rotation: [0, 0, 0],
    gridScale: 1,
  }
}

export function createDrawingGrid(
  name: string,
  workplane: DrawingWorkplane = createDefaultWorkplane(),
): DrawingGrid {
  return {
    id: createWorkplaneId(),
    name,
    ...normalizeWorkplane(workplane),
  }
}

export function normalizeWorkplane(
  workplane: DrawingWorkplane | undefined,
): DrawingWorkplane {
  if (!workplane) return createDefaultWorkplane()
  return {
    origin: copyVec3(workplane.origin),
    rotation: copyVec3(workplane.rotation),
    gridScale: sanitizeGridScale(workplane.gridScale),
  }
}

export function normalizeDrawingGrid(
  grid: DrawingGrid,
  index: number,
): DrawingGrid {
  return {
    id: grid.id || createWorkplaneId(),
    name: sanitizeGridName(grid.name, index),
    ...normalizeWorkplane(grid),
  }
}

export function normalizeWorkplanes(
  workplanes: readonly DrawingGrid[] | undefined,
  activeWorkplane: DrawingWorkplane | undefined,
): DrawingGrid[] {
  if (workplanes && workplanes.length > 0) {
    return workplanes.map((grid, index) => normalizeDrawingGrid(grid, index))
  }

  return [createDrawingGrid('Grid 1', normalizeWorkplane(activeWorkplane))]
}

export function drawingGridToWorkplane(grid: DrawingGrid): DrawingWorkplane {
  return {
    origin: copyVec3(grid.origin),
    rotation: copyVec3(grid.rotation),
    gridScale: sanitizeGridScale(grid.gridScale),
  }
}

function updateActiveWorkplane(
  document: GreaseDocument,
  workplane: DrawingWorkplane,
): GreaseDocument {
  const nextWorkplane = normalizeWorkplane(workplane)
  const workplanes = normalizeWorkplanes(document.workplanes, document.workplane)
  const fallbackGrid = workplanes[0] ?? createDrawingGrid('Grid 1', nextWorkplane)
  const activeWorkplaneId = workplanes.some(
    (grid) => grid.id === document.activeWorkplaneId,
  )
    ? document.activeWorkplaneId
    : fallbackGrid.id
  const normalizedWorkplanes =
    workplanes.length > 0 ? workplanes : [fallbackGrid]
  const nextWorkplanes = normalizedWorkplanes.map((grid) =>
    grid.id === activeWorkplaneId
      ? {
          ...grid,
          ...nextWorkplane,
        }
      : grid,
  )

  return {
    ...document,
    activeWorkplaneId,
    workplane: nextWorkplane,
    workplanes: nextWorkplanes,
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
    default: {
      const exhaustive: never = axis
      return exhaustive
    }
  }
}

function sanitizeVec3(value: Vec3): Vec3 {
  return [
    sanitizeScalar(value[0]),
    sanitizeScalar(value[1]),
    sanitizeScalar(value[2]),
  ]
}

function sanitizeScalar(value: number) {
  if (!Number.isFinite(value)) return 0
  return value
}

function sanitizeGridScale(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0.1, Math.min(10, value))
}

function sanitizeGridName(value: string | undefined, index: number) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 40) : `Grid ${index + 1}`
}
