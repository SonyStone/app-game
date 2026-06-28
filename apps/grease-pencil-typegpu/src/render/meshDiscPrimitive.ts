import {
  add3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'
import { pushVertex } from './meshVertex'
import { discBasis } from './workplane'

export function appendDisc(
  vertices: number[],
  center: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const segments = 14
  const safeRadius = Math.max(radius, 0.002)
  const basis = discBasis(offsetNormal)
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    pushVertex(vertices, center, color, opacity, zOffset, offsetNormal)
    pushVertex(
      vertices,
      add3(
        center,
        add3(
          scale3(basis.right, Math.cos(a) * safeRadius),
          scale3(basis.up, Math.sin(a) * safeRadius),
        ),
      ),
      color,
      opacity,
      zOffset,
      offsetNormal,
    )
    pushVertex(
      vertices,
      add3(
        center,
        add3(
          scale3(basis.right, Math.cos(b) * safeRadius),
          scale3(basis.up, Math.sin(b) * safeRadius),
        ),
      ),
      color,
      opacity,
      zOffset,
      offsetNormal,
    )
  }
}
