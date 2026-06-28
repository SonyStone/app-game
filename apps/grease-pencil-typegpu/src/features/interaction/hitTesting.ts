import {
  createStrokePointKey,
  type Drawing,
  type Stroke,
  type StrokePointKey,
} from '../../document'
import {
  add3,
  distance3,
  dot3,
  scale3,
  sub3,
  type Vec3,
} from '../../shared/vector'

export type StrokeHit = {
  strokeId: Stroke['id']
  distance: number
}

export type PointHit = {
  pointKey: StrokePointKey
  distance: number
}

export function findNearestStroke(
  drawing: Drawing | undefined,
  position: Vec3,
  maxDistance: number,
): StrokeHit | undefined {
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

export function findNearestPoint(
  drawing: Drawing | undefined,
  position: Vec3,
  maxDistance: number,
): PointHit | undefined {
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
