import {
  cross3,
  dot3,
  scale3,
  add3,
  normalize3,
  sub3,
  type Vec3,
} from './vector'
import {
  invertMat4,
} from './matrixInvert'
import {
  multiplyMat4,
} from './matrixMultiply'
import {
  lookAt,
  perspectiveZO,
} from './matrixCamera'

export type CameraState = {
  lockedNormal?: Vec3
  lockedUp?: Vec3
  mode: '3d' | '2d'
  roll: number
  target: Vec3
  yaw: number
  pitch: number
  distance: number
}

export type CameraMatrices = {
  view: Float32Array
  projection: Float32Array
  viewProjection: Float32Array
  inverseViewProjection: Float32Array
  position: Vec3
}

export function createCameraMatrices(
  camera: CameraState,
  aspect: number,
): CameraMatrices {
  const { position, up } = getCameraOrbitFrame(camera)

  const view = lookAt(position, camera.target, up)
  const projection = perspectiveZO((48 * Math.PI) / 180, aspect, 0.02, 200)
  const viewProjection = multiplyMat4(projection, view)
  const inverseViewProjection = invertMat4(viewProjection)

  return {
    view,
    projection,
    viewProjection,
    inverseViewProjection,
    position,
  }
}

export function getCameraBasis(camera: CameraState) {
  const { position, up: orbitUp } = getCameraOrbitFrame(camera)
  const forward = normalize3(sub3(camera.target, position))
  const right = normalize3(cross3(forward, orbitUp))
  const up = normalize3(cross3(right, forward))
  return { forward, right, up }
}

function getCameraOrbitFrame(camera: CameraState) {
  if (camera.mode === '2d' && camera.lockedNormal && camera.lockedUp) {
    const normal = normalize3(camera.lockedNormal)
    const up = normalize3(rotateAroundAxis(camera.lockedUp, normal, camera.roll))
    return {
      position: add3(camera.target, scale3(normal, camera.distance)),
      up,
    } as const
  }

  const sinYaw = Math.sin(camera.yaw)
  const cosYaw = Math.cos(camera.yaw)
  const sinPitch = Math.sin(camera.pitch)
  const cosPitch = Math.cos(camera.pitch)

  const position: Vec3 = [
    camera.target[0] + camera.distance * cosPitch * sinYaw,
    camera.target[1] - camera.distance * cosPitch * cosYaw,
    camera.target[2] + camera.distance * sinPitch,
  ]
  const up: Vec3 = [
    -sinPitch * sinYaw,
    sinPitch * cosYaw,
    cosPitch,
  ]

  return { position, up } as const
}

function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return add3(
    add3(scale3(vector, cos), scale3(cross3(axis, vector), sin)),
    scale3(axis, dot3(axis, vector) * (1 - cos)),
  )
}
