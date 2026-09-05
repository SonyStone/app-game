import { createCameraMatrices, type CameraState } from '../../render/cameraMatrices'
import { transformMat4 } from '../../render/matrixTransform'
import { add3, dot3, scale3, sub3, type Vec3 } from '../../render/vector'

type Point = { x: number; y: number }

/** Freezes the selected local plane at pointer-down so moving the workplane cannot cause drift. */
export function createGizmoPlaneDrag(
  camera: CameraState,
  viewport: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  origin: Vec3,
  normal: Vec3,
  pointer: Point
) {
  const matrices = createCameraMatrices(camera, viewport.width / viewport.height)
  const start = intersect(pointer)
  if (!start) return
  return (point: Point) => {
    const current = intersect(point)
    return current ? add3(origin, sub3(current, start)) : undefined
  }

  function intersect(point: Point) {
    const x = ((point.x - viewport.left) / viewport.width) * 2 - 1
    const y = 1 - ((point.y - viewport.top) / viewport.height) * 2
    const near = transformMat4(matrices.inverseViewProjection, [x, y, 0, 1])
    const far = transformMat4(matrices.inverseViewProjection, [x, y, 1, 1])
    const start: Vec3 = [near[0] / near[3], near[1] / near[3], near[2] / near[3]]
    const ray = sub3([far[0] / far[3], far[1] / far[3], far[2] / far[3]], start)
    const denominator = dot3(ray, normal)
    if (Math.abs(denominator) < Math.hypot(...ray) * 1e-5) return
    const t = dot3(sub3(origin, start), normal) / denominator
    if (t < 0) return
    return add3(start, scale3(ray, t))
  }
}
