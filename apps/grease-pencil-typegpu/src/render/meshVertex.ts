import {
  add3,
  scale3,
  type Vec3,
  type Vec4,
} from './math'

export function pushVertex(
  vertices: number[],
  position: Vec3,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const offsetPosition = add3(position, scale3(offsetNormal, zOffset))
  vertices.push(
    offsetPosition[0],
    offsetPosition[1],
    offsetPosition[2],
    color[0],
    color[1],
    color[2],
    color[3] * opacity,
  )
}
