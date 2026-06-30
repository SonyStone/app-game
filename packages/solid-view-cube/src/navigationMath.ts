export type Vec3 = [number, number, number]

export type NavigationCubeCamera = {
  lockedNormal?: Vec3
  lockedUp?: Vec3
  mode: '3d' | '2d'
  roll: number
  target: Vec3
  yaw: number
  pitch: number
  distance: number
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function getCameraBasis(camera: NavigationCubeCamera) {
  const { position, up: orbitUp } = getCameraOrbitFrame(camera)
  const forward = normalize3(sub3(camera.target, position))
  const right = normalize3(cross3(forward, orbitUp))
  const up = normalize3(cross3(right, forward))
  return { forward, right, up }
}

function getCameraOrbitFrame(camera: NavigationCubeCamera) {
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
  const forward = normalize3(sub3(camera.target, position))
  const orbitUp: Vec3 = [
    -sinPitch * sinYaw,
    sinPitch * cosYaw,
    cosPitch,
  ]
  const up = normalize3(rotateAroundAxis(orbitUp, forward, camera.roll))

  return { position, up } as const
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale3(vector: Vec3, scalar: number): Vec3 {
  return [
    vector[0] * scalar,
    vector[1] * scalar,
    vector[2] * scalar,
  ]
}

function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function length3(vector: Vec3) {
  return Math.hypot(vector[0], vector[1], vector[2])
}

function normalize3(vector: Vec3): Vec3 {
  const length = length3(vector)
  if (length <= 1e-8) return [0, 0, 0]
  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
  ]
}

function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return add3(
    add3(scale3(vector, cos), scale3(cross3(axis, vector), sin)),
    scale3(axis, dot3(axis, vector) * (1 - cos)),
  )
}
