import {
  cross3,
  dot3,
  normalize3,
  sub3,
  type Vec3,
} from './vector'

export function lookAt(eye: Vec3, target: Vec3, up: Vec3) {
  const zAxis = normalize3(sub3(eye, target))
  const xAxis = normalize3(cross3(up, zAxis))
  const yAxis = cross3(zAxis, xAxis)

  const out = new Float32Array(16)
  out[0] = xAxis[0]
  out[1] = yAxis[0]
  out[2] = zAxis[0]
  out[3] = 0
  out[4] = xAxis[1]
  out[5] = yAxis[1]
  out[6] = zAxis[1]
  out[7] = 0
  out[8] = xAxis[2]
  out[9] = yAxis[2]
  out[10] = zAxis[2]
  out[11] = 0
  out[12] = -dot3(xAxis, eye)
  out[13] = -dot3(yAxis, eye)
  out[14] = -dot3(zAxis, eye)
  out[15] = 1
  return out
}

export function perspectiveZO(
  fovy: number,
  aspect: number,
  near: number,
  far: number,
) {
  const f = 1 / Math.tan(fovy / 2)
  const out = new Float32Array(16)
  out[0] = f / aspect
  out[5] = f
  out[10] = far / (near - far)
  out[11] = -1
  out[14] = (far * near) / (near - far)
  return out
}
