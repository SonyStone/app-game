import {
  add3,
  distance3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'
import { pushVertex } from './meshVertex'
import {
  appendBevelSide,
  getCornerGeometry,
  intersectOffsetLines,
} from './strokeJoinGeometry'

const MITER_LIMIT = 4

export function appendBevelJoin(
  vertices: number[],
  previous: Vec3,
  point: Vec3,
  next: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const corner = getCornerGeometry(previous, point, next, offsetNormal)
  if (!corner) return

  appendBevelSide(
    vertices,
    point,
    corner.previousNormal,
    corner.nextNormal,
    radius,
    corner.side,
    color,
    opacity,
    zOffset,
    offsetNormal,
  )
}

export function appendMiterJoin(
  vertices: number[],
  previous: Vec3,
  point: Vec3,
  next: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const corner = getCornerGeometry(previous, point, next, offsetNormal)
  if (!corner) return

  const safeRadius = Math.max(radius, 0.002)
  const previousEdge = add3(
    point,
    scale3(corner.previousNormal, safeRadius * corner.side),
  )
  const nextEdge = add3(
    point,
    scale3(corner.nextNormal, safeRadius * corner.side),
  )
  const miterPoint = intersectOffsetLines(
    previousEdge,
    corner.previousDirection,
    nextEdge,
    corner.nextDirection,
    offsetNormal,
  )
  if (!miterPoint || distance3(point, miterPoint) > safeRadius * MITER_LIMIT) {
    appendBevelSide(
      vertices,
      point,
      corner.previousNormal,
      corner.nextNormal,
      radius,
      corner.side,
      color,
      opacity,
      zOffset,
      offsetNormal,
    )
    return
  }

  pushVertex(vertices, previousEdge, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, miterPoint, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, nextEdge, color, opacity, zOffset, offsetNormal)
}
