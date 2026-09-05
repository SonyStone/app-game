import { add3, dot3, scale3, sub3, type Vec3 } from './vector'
import type { WorkplaneBasis } from './workplane'

/** Plane squares sit outside the open center, between 26 and 44 screen-scaled units. */
export function gizmoPlanes(basis: WorkplaneBasis, units: number) {
  return [
    plane('XY', basis.right, basis.up, basis.normal, 'Z'),
    plane('XZ', basis.right, basis.normal, basis.up, 'Y'),
    plane('YZ', basis.up, basis.normal, basis.right, 'X')
  ] as const

  function plane(name: GizmoPlaneName, a: Vec3, b: Vec3, normal: Vec3, colorAxis: 'X' | 'Y' | 'Z') {
    const point = (x: number, y: number) => add3(basis.origin, add3(scale3(a, x * units), scale3(b, y * units)))
    return { name, normal, colorAxis, corners: [point(26, 26), point(44, 26), point(44, 44), point(26, 44)] as const }
  }
}

/** Local translation planes, independent of the current camera orientation. */
export type GizmoPlaneName = 'XY' | 'XZ' | 'YZ'

/** Front hemisphere only; a face-on ring remains a complete silhouette. Shared by drawing and picking. */
export function frontGizmoRing(origin: Vec3, a: Vec3, b: Vec3, radius: number, cameraPosition: Vec3) {
  const view = sub3(cameraPosition, origin)
  const x = dot3(view, a),
    y = dot3(view, b)
  const faceOn = Math.hypot(x, y) < Math.hypot(...view) * 1e-6
  const start = faceOn ? 0 : Math.atan2(y, x) - Math.PI / 2
  const sweep = faceOn ? Math.PI * 2 : Math.PI
  const count = faceOn ? 96 : 48
  const point = (angle: number) =>
    add3(origin, add3(scale3(a, Math.cos(angle) * radius), scale3(b, Math.sin(angle) * radius)))
  return Array.from({ length: count }, (_, i) => {
    const from = start + (sweep * i) / count,
      to = start + (sweep * (i + 1)) / count
    return { start: point(from), end: point(to), angle: (from + to) / 2 }
  })
}
