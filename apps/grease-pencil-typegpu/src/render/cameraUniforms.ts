import {
  createCameraMatrices,
  getCameraBasis,
  type CameraState,
} from './cameraMatrices'
import {
  scale3,
  type Vec3,
} from './vector'

export const CAMERA_UNIFORM_FLOATS = 28
export const CAMERA_UNIFORM_BYTES = CAMERA_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT

export type CameraFrameUniforms = {
  data: Float32Array
  billboardNormal: Vec3
}

export function createCameraFrameUniforms(
  camera: CameraState,
  aspect: number,
): CameraFrameUniforms {
  const matrices = createCameraMatrices(camera, aspect)
  const { forward, right, up } = getCameraBasis(camera)
  const billboardNormal = scale3(forward, -1)
  const data = new Float32Array(CAMERA_UNIFORM_FLOATS)
  data.set(matrices.viewProjection, 0)
  data.set(billboardNormal, 16)
  data.set(right, 20)
  data.set(up, 24)

  return {
    billboardNormal,
    data,
  }
}
