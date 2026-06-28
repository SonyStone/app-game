import type { Vec4 } from './vector'

export function transformMat4(m: Float32Array, v: Vec4): Vec4 {
  const x = v[0]
  const y = v[1]
  const z = v[2]
  const w = v[3]
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ]
}
