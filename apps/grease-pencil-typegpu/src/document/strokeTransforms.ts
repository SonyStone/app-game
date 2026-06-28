import type { Vec3 } from '../shared/vector'
import { addVec3 } from './geometry'
import { createStrokePointKey } from './ids'
import type {
  Stroke,
  StrokePointKey,
} from './model'

export function translateStroke(stroke: Stroke, delta: Vec3): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      position: addVec3(point.position, delta),
    })),
  }
}

export function translateStrokePoints(
  stroke: Stroke,
  pointKeys: ReadonlySet<StrokePointKey>,
  delta: Vec3,
) {
  let changed = false
  const points = stroke.points.map((point, pointIndex) => {
    if (!pointKeys.has(createStrokePointKey(stroke.id, pointIndex))) return point
    changed = true
    return {
      ...point,
      position: addVec3(point.position, delta),
    }
  })

  return changed ? { ...stroke, points } : stroke
}

export function deleteStrokePoints(
  stroke: Stroke,
  pointKeys: ReadonlySet<StrokePointKey>,
): { stroke?: Stroke; changed: boolean } {
  const nextPoints = stroke.points.filter(
    (_point, pointIndex) =>
      !pointKeys.has(createStrokePointKey(stroke.id, pointIndex)),
  )
  if (nextPoints.length === stroke.points.length) {
    return { stroke, changed: false }
  }
  if (nextPoints.length === 0) {
    return { changed: true }
  }
  return {
    stroke: {
      ...stroke,
      points: nextPoints,
    },
    changed: true,
  }
}
