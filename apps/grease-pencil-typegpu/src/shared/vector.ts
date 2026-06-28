export type Vec3 = [number, number, number]
export type Vec4 = [number, number, number, number]

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale3(v: Vec3, scalar: number): Vec3 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar]
}

export function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function length3(v: Vec3) {
  return Math.hypot(v[0], v[1], v[2])
}

export function normalize3(v: Vec3): Vec3 {
  const length = length3(v)
  if (length <= 1e-8) return [0, 0, 0]
  return [v[0] / length, v[1] / length, v[2] / length]
}

export function distance3(a: Vec3, b: Vec3) {
  return length3(sub3(a, b))
}
