import { copyVec3 } from './geometry'
import type { Axis, DrawingWorkplane, GreaseDocument } from './model'
import type { Vec3 } from '../shared/vector'

export function setWorkplaneOrigin(
  document: GreaseDocument,
  axis: Axis,
  value: number,
): GreaseDocument {
  return {
    ...document,
    workplane: {
      ...document.workplane,
      origin: replaceAxisValue(document.workplane.origin, axis, sanitizeScalar(value)),
    },
  }
}

export function setWorkplaneRotation(
  document: GreaseDocument,
  axis: Axis,
  value: number,
): GreaseDocument {
  return {
    ...document,
    workplane: {
      ...document.workplane,
      rotation: replaceAxisValue(
        document.workplane.rotation,
        axis,
        sanitizeScalar(value),
      ),
    },
  }
}

export function setWorkplaneScale(
  document: GreaseDocument,
  gridScale: number,
): GreaseDocument {
  return {
    ...document,
    workplane: {
      ...document.workplane,
      gridScale: sanitizeGridScale(gridScale),
    },
  }
}

export function resetWorkplane(document: GreaseDocument): GreaseDocument {
  return {
    ...document,
    workplane: createDefaultWorkplane(),
  }
}

export function createDefaultWorkplane(): DrawingWorkplane {
  return {
    origin: [0, 0, 0],
    rotation: [0, 0, 0],
    gridScale: 1,
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

function sanitizeScalar(value: number) {
  if (!Number.isFinite(value)) return 0
  return value
}

function sanitizeGridScale(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0.1, Math.min(10, value))
}
