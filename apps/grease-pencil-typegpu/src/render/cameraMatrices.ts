import {
  cross3,
  normalize3,
  sub3,
  clamp,
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
  const pitch = clamp(camera.pitch, 0.12, 1.45)
  const cosPitch = Math.cos(pitch)
  const position: Vec3 = [
    camera.target[0] + camera.distance * cosPitch * Math.sin(camera.yaw),
    camera.target[1] - camera.distance * cosPitch * Math.cos(camera.yaw),
    camera.target[2] + camera.distance * Math.sin(pitch),
  ]

  const view = lookAt(position, camera.target, [0, 0, 1])
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
  const matrices = createCameraMatrices(camera, 1)
  const forward = normalize3(sub3(camera.target, matrices.position))
  const right = normalize3(cross3(forward, [0, 0, 1]))
  const up = normalize3(cross3(right, forward))
  return { forward, right, up }
}
