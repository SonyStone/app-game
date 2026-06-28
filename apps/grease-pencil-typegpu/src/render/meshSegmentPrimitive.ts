import {
  add3,
  cross3,
  length3,
  normalize3,
  scale3,
  sub3,
  type Vec3,
  type Vec4,
} from './math'
import { pushVertex } from './meshVertex'

export function appendSegment(
  vertices: number[],
  start: Vec3,
  end: Vec3,
  startRadius: number,
  color: Vec4,
  endRadius = startRadius,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
  endColor: Vec4 = color,
) {
  const direction = sub3(end, start)
  const length = length3(direction)
  if (length < 1e-5) return

  const normal = normalize3(cross3(offsetNormal, direction))
  if (length3(normal) < 1e-5) return

  const a = add3(start, scale3(normal, startRadius))
  const b = add3(start, scale3(normal, -startRadius))
  const c = add3(end, scale3(normal, endRadius))
  const dPoint = add3(end, scale3(normal, -endRadius))

  pushVertex(vertices, a, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, endColor, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, endColor, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, dPoint, endColor, opacity, zOffset, offsetNormal)
}
