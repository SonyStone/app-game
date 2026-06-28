import type { DrawingWorkplane } from '../document'
import {
  add3,
  clamp,
  createCameraMatrices,
  dot3,
  getCameraBasis,
  scale3,
  sub3,
  type CameraState,
  type Vec3,
} from './math'
import { transformMat4 } from './matrixTransform'
import { getWorkplaneBasis } from './workplane'

const TAU = Math.PI * 2

export function createDefaultCamera(): CameraState {
  return {
    target: [0, 0, 0],
    yaw: 0.68,
    pitch: 0.74,
    distance: 7.5,
  }
}

export function orbitCamera(
  camera: CameraState,
  deltaX: number,
  deltaY: number,
) {
  camera.yaw = wrapAngle(camera.yaw - deltaX * 0.006)
  camera.pitch = wrapAngle(camera.pitch + deltaY * 0.005)
}

export function panCamera(
  camera: CameraState,
  deltaX: number,
  deltaY: number,
) {
  const { right, up } = getCameraBasis(camera)
  const scale = camera.distance * 0.00135
  camera.target = add3(
    camera.target,
    add3(scale3(right, -deltaX * scale), scale3(up, deltaY * scale)),
  )
}

export function zoomCamera(camera: CameraState, delta: number) {
  camera.distance = clamp(
    camera.distance * (1 + delta * 0.001),
    1.6,
    48,
  )
}

export function cameraViewProjection(camera: CameraState, aspect: number) {
  return createCameraMatrices(camera, aspect).viewProjection
}

export function screenToWorkplane(
  canvas: HTMLCanvasElement,
  camera: CameraState,
  workplane: DrawingWorkplane,
  width: number,
  height: number,
  clientX: number,
  clientY: number,
): Vec3 | undefined {
  const basis = getWorkplaneBasis(workplane)
  const rect = canvas.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * 2 - 1
  const y = 1 - ((clientY - rect.top) / rect.height) * 2
  const matrices = createCameraMatrices(camera, width / height)
  const near = transformMat4(matrices.inverseViewProjection, [x, y, 0, 1])
  const far = transformMat4(matrices.inverseViewProjection, [x, y, 1, 1])
  if (Math.abs(near[3]) < 1e-6 || Math.abs(far[3]) < 1e-6) return

  const nearPoint: Vec3 = [near[0] / near[3], near[1] / near[3], near[2] / near[3]]
  const farPoint: Vec3 = [far[0] / far[3], far[1] / far[3], far[2] / far[3]]
  const ray = sub3(farPoint, nearPoint)
  const denominator = dot3(ray, basis.normal)
  if (Math.abs(denominator) < 1e-6) return

  const t = dot3(sub3(basis.origin, nearPoint), basis.normal) / denominator
  return add3(nearPoint, scale3(ray, t))
}

export function offsetFromWorkplane(
  workplane: DrawingWorkplane,
  position: Vec3,
  distance: number,
): Vec3 {
  return add3(position, scale3(getWorkplaneBasis(workplane).normal, distance))
}

function wrapAngle(angle: number) {
  const wrapped = ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI
  return wrapped === -Math.PI ? Math.PI : wrapped
}
