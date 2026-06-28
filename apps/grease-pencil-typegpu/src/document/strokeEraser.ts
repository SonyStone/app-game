import type { Vec3 } from '../shared/vector'
import {
  copyVec4,
  distanceBetweenSegments,
  distanceToSegment,
} from './geometry'
import { createStrokeId } from './ids'
import type {
  Stroke,
  StrokePoint,
} from './model'
import {
  copyStrokePoint,
  pointRadius,
} from './strokePoints'

export type ErasedStrokeSegment = {
  strokes: Stroke[]
  changed: boolean
}

export function eraseStrokeSegment(
  stroke: Stroke,
  start: Vec3,
  end: Vec3,
  radius: number,
): ErasedStrokeSegment {
  if (stroke.points.length === 0) return { strokes: [], changed: false }

  const erasedPoints = stroke.points.map((point) =>
    distanceToSegment(point.position, start, end) <=
    radius + pointRadius(stroke, point),
  )

  for (let pointIndex = 0; pointIndex < stroke.points.length - 1; pointIndex += 1) {
    const current = stroke.points[pointIndex]
    const next = stroke.points[pointIndex + 1]
    if (!current || !next) continue

    const segmentRadius =
      radius +
      Math.max(
        pointRadius(stroke, current),
        pointRadius(stroke, next),
      )
    if (
      distanceBetweenSegments(current.position, next.position, start, end) <=
      segmentRadius
    ) {
      erasedPoints[pointIndex] = true
      erasedPoints[pointIndex + 1] = true
    }
  }

  if (!erasedPoints.some(Boolean)) {
    return { strokes: [stroke], changed: false }
  }

  const strokes: Stroke[] = []
  let currentPoints: StrokePoint[] = []
  for (let pointIndex = 0; pointIndex < stroke.points.length; pointIndex += 1) {
    const point = stroke.points[pointIndex]
    if (!point) continue

    if (erasedPoints[pointIndex]) {
      pushStrokeSegment(strokes, stroke, currentPoints)
      currentPoints = []
      continue
    }

    currentPoints.push(point)
  }
  pushStrokeSegment(strokes, stroke, currentPoints)

  return { strokes, changed: true }
}

function pushStrokeSegment(
  strokes: Stroke[],
  sourceStroke: Stroke,
  points: readonly StrokePoint[],
) {
  if (points.length === 0) return

  strokes.push({
    id: strokes.length === 0 ? sourceStroke.id : createStrokeId(),
    materialId: sourceStroke.materialId,
    color: copyVec4(sourceStroke.color),
    radius: sourceStroke.radius,
    closed: false,
    points: points.map((point) =>
      copyStrokePoint(point, sourceStroke.radius, sourceStroke.color),
    ),
  })
}
