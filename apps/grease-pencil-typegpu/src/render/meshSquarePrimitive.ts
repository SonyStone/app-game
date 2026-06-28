import {
  add3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'
import { pushVertex } from './meshVertex'
import { discBasis } from './workplane'

export function appendSquarePoint(
  vertices: number[],
  center: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const safeRadius = Math.max(radius, 0.002)
  const basis = discBasis(offsetNormal)
  const right = scale3(basis.right, safeRadius)
  const up = scale3(basis.up, safeRadius)
  const a = add3(center, add3(right, up))
  const b = add3(center, add3(scale3(right, -1), up))
  const c = add3(center, add3(right, scale3(up, -1)))
  const dPoint = add3(center, add3(scale3(right, -1), scale3(up, -1)))

  pushVertex(vertices, a, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, dPoint, color, opacity, zOffset, offsetNormal)
}
