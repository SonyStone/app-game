import {
  add3,
  cross3,
  dot3,
  length3,
  normalize3,
  scale3,
  sub3,
  type Vec3,
  type Vec4,
} from './math'
import { pushVertex } from './meshVertex'

type JoinSide = 1 | -1

export type CornerGeometry = {
  previousDirection: Vec3
  nextDirection: Vec3
  previousNormal: Vec3
  nextNormal: Vec3
  side: JoinSide
}

export function getCornerGeometry(
  previous: Vec3,
  point: Vec3,
  next: Vec3,
  offsetNormal: Vec3,
): CornerGeometry | undefined {
  const previousDelta = sub3(point, previous)
  const nextDelta = sub3(next, point)
  const previousLength = length3(previousDelta)
  const nextLength = length3(nextDelta)
  if (previousLength < 1e-5 || nextLength < 1e-5) return

  const previousDirection = scale3(previousDelta, 1 / previousLength)
  const nextDirection = scale3(nextDelta, 1 / nextLength)
  const turn = dot3(offsetNormal, cross3(previousDirection, nextDirection))
  if (Math.abs(turn) < 1e-5) return

  const previousNormal = normalize3(cross3(offsetNormal, previousDirection))
  const nextNormal = normalize3(cross3(offsetNormal, nextDirection))
  if (length3(previousNormal) < 1e-5 || length3(nextNormal) < 1e-5) return

  return {
    previousDirection,
    nextDirection,
    previousNormal,
    nextNormal,
    side: turn > 0 ? -1 : 1,
  }
}

export function intersectOffsetLines(
  firstPoint: Vec3,
  firstDirection: Vec3,
  secondPoint: Vec3,
  secondDirection: Vec3,
  normal: Vec3,
): Vec3 | undefined {
  const denominator = dot3(normal, cross3(firstDirection, secondDirection))
  if (Math.abs(denominator) < 1e-5) return

  const delta = sub3(secondPoint, firstPoint)
  const t = dot3(normal, cross3(delta, secondDirection)) / denominator
  return add3(firstPoint, scale3(firstDirection, t))
}

export function appendBevelSide(
  vertices: number[],
  point: Vec3,
  previousNormal: Vec3,
  nextNormal: Vec3,
  radius: number,
  side: JoinSide,
  color: Vec4,
  opacity: number,
  zOffset: number,
  offsetNormal: Vec3,
) {
  const safeRadius = Math.max(radius, 0.002)
  const previousEdge = add3(point, scale3(previousNormal, safeRadius * side))
  const nextEdge = add3(point, scale3(nextNormal, safeRadius * side))

  pushVertex(vertices, point, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, previousEdge, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, nextEdge, color, opacity, zOffset, offsetNormal)
}
