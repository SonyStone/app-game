import type { DrawingWorkplane } from '../document'
import {
  add3,
  clamp,
  createCameraMatrices,
  dot3,
  getCameraBasis,
  normalize3,
  scale3,
  sub3,
  type CameraState,
  type Vec3,
} from './math'
import { transformMat4 } from './matrixTransform'
import { getWorkplaneBasis } from './workplane'

const TAU = Math.PI * 2
const VIEW_ROTATE_SPEED = 0.006

export type ScreenPoint = {
  x: number
  y: number
  depth: number
}

export function createDefaultCamera(): CameraState {
  return {
    mode: '3d',
    roll: 0,
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
  if (camera.mode === '2d') {
    rotateCameraView(camera, deltaX)
    return
  }

  camera.yaw = wrapAngle(camera.yaw - deltaX * 0.006)
  camera.pitch = wrapAngle(camera.pitch + deltaY * 0.005)
}

export function rotateCameraView(camera: CameraState, delta: number) {
  camera.roll = wrapAngle(camera.roll - delta * VIEW_ROTATE_SPEED)
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

export function lockCameraToWorkplane(
  camera: CameraState,
  workplane: DrawingWorkplane,
  snapTarget = false,
) {
  const basis = getWorkplaneBasis(workplane)
  if (snapTarget || camera.mode !== '2d') {
    camera.target = [...basis.origin]
    camera.roll = 0
  }
  camera.mode = '2d'
  camera.lockedNormal = normalize3(basis.normal)
  camera.lockedUp = normalize3(basis.up)
  camera.pitch = Math.asin(clamp(camera.lockedNormal[2], -1, 1))
  camera.yaw = Math.atan2(camera.lockedNormal[0], -camera.lockedNormal[1])
}

export function unlockCameraFromWorkplane(camera: CameraState) {
  if (camera.mode === '2d' && camera.lockedNormal) {
    camera.pitch = Math.asin(clamp(camera.lockedNormal[2], -1, 1))
    camera.yaw = Math.atan2(camera.lockedNormal[0], -camera.lockedNormal[1])
  }
  camera.mode = '3d'
  camera.lockedNormal = undefined
  camera.lockedUp = undefined
  camera.roll = 0
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

export function worldToScreen(
  canvas: HTMLCanvasElement,
  camera: CameraState,
  width: number,
  height: number,
  position: Vec3,
): ScreenPoint | undefined {
  const rect = canvas.getBoundingClientRect()
  const clip = transformMat4(
    createCameraMatrices(camera, width / height).viewProjection,
    [position[0], position[1], position[2], 1],
  )
  if (Math.abs(clip[3]) < 1e-6) return

  const ndcX = clip[0] / clip[3]
  const ndcY = clip[1] / clip[3]
  const ndcZ = clip[2] / clip[3]
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !Number.isFinite(ndcZ)) {
    return
  }

  return {
    x: rect.left + ((ndcX + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndcY) / 2) * rect.height,
    depth: ndcZ,
  }
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
