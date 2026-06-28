import type { DrawingWorkplane } from '../document'
import { add3, cross3, normalize3, scale3, type Vec3 } from './math'

export type WorkplaneBasis = {
  origin: Vec3
  right: Vec3
  up: Vec3
  normal: Vec3
}

export function getWorkplaneBasis(workplane: DrawingWorkplane): WorkplaneBasis {
  const right = normalize3(rotateByEuler([1, 0, 0], workplane.rotation))
  const up = normalize3(rotateByEuler([0, 1, 0], workplane.rotation))
  const normal = normalize3(cross3(right, up))

  return {
    origin: workplane.origin,
    right,
    up,
    normal,
  }
}

export function workplanePoint(
  basis: WorkplaneBasis,
  x: number,
  y: number,
): Vec3 {
  return add3(
    basis.origin,
    add3(scale3(basis.right, x), scale3(basis.up, y)),
  )
}

export function discBasis(normal: Vec3): Pick<WorkplaneBasis, 'right' | 'up'> {
  const fallback: Vec3 = Math.abs(normal[2]) > 0.98 ? [0, 1, 0] : [0, 0, 1]
  const right = normalize3(cross3(fallback, normal))
  const up = normalize3(cross3(normal, right))
  return { right, up }
}

function rotateByEuler(vector: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation
  const cosX = Math.cos(rx)
  const sinX = Math.sin(rx)
  const cosY = Math.cos(ry)
  const sinY = Math.sin(ry)
  const cosZ = Math.cos(rz)
  const sinZ = Math.sin(rz)

  const x1 = vector[0]
  const y1 = vector[1] * cosX - vector[2] * sinX
  const z1 = vector[1] * sinX + vector[2] * cosX

  const x2 = x1 * cosY + z1 * sinY
  const y2 = y1
  const z2 = -x1 * sinY + z1 * cosY

  return [
    x2 * cosZ - y2 * sinZ,
    x2 * sinZ + y2 * cosZ,
    z2,
  ]
}
