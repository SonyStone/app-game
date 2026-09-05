import { describe, expect, it } from 'vitest'
import type { DrawingWorkplane } from '../../document'
import { createDefaultCamera } from '../../render/cameraDefaults'
import { createCameraMatrices, type CameraState } from '../../render/cameraMatrices'
import { transformMat4 } from '../../render/matrixTransform'
import { workplaneRotationGizmoRadius } from '../../render/meshOverlays'
import { worldUnitsPerPixel } from '../../render/screenSpaceGuides'
import { add3, cross3, dot3, scale3, type Vec3 } from '../../render/vector'
import { getWorkplaneBasis } from '../../render/workplane'
import type { WorkplaneGizmoAxisName } from '../../render/workplaneGizmoTypes'
import { createGizmoRotationDrag, rotateWorkplaneLocally } from './gizmoRotation'

const viewport = { left: 25, top: 70, width: 900, height: 700 }
const workplane: DrawingWorkplane = { origin: [0, 0, 0], rotation: [0.4, -0.3, 0.7], gridScale: 1 }

describe('gizmo rotation', () => {
  for (const axis of ['X', 'Y', 'Z'] as const) {
    it.each([false, true])(
      `${axis} follows its ring across the angle seam with camera roll, reverse view=%s`,
      (reverse) => {
        const camera = { ...createDefaultCamera(), roll: 1.2 }
        if (reverse) {
          camera.yaw += Math.PI
          camera.pitch *= -1
        }
        const point = ringProjector(camera, axis)
        const drag = createGizmoRotationDrag(camera, viewport, workplane, axis, point(3), 3)
        const rotation = drag(point(3.4))
        assertRotatedBasis(rotation, axis, 0.4)
      }
    )
  }

  it('accumulates complete turns without jumping at ±π', () => {
    const camera = createDefaultCamera()
    const point = ringProjector(camera, 'Z')
    const drag = createGizmoRotationDrag(camera, viewport, workplane, 'Z', point(0.3), 0.3)
    let rotation: Vec3 = workplane.rotation
    for (let i = 1; i <= 40; i++) rotation = drag(point(0.3 + i * 0.2))
    assertRotatedBasis(rotation, 'Z', 8)
  })

  it('uses a projected tangent for an edge-on ring, with the correct direction', () => {
    const plane = { ...workplane, rotation: [0, 0, 0] as Vec3 }
    const camera = { ...createDefaultCamera(), yaw: 0, pitch: 0, roll: 0.8 }
    const point = ringProjector(camera, 'Z', plane)
    const drag = createGizmoRotationDrag(camera, viewport, plane, 'Z', point(0.6), 0.6)
    const rotation = drag(point(0.61))
    expect(rotation.every(Number.isFinite)).toBe(true)
    expect(rotation[2]).toBeCloseTo(0.01, 3)
  })

  it('preserves the local axis when composing rotations at the Euler singularity', () => {
    const plane = { ...workplane, rotation: [0.6, Math.PI / 2, 0.3] as Vec3 }
    const start = getWorkplaneBasis(plane)
    const result = getWorkplaneBasis({ ...plane, rotation: rotateWorkplaneLocally(plane, 'X', 0.4) })
    expectVector(result.right, start.right)
    expectVector(result.up, add3(scale3(start.up, Math.cos(0.4)), scale3(start.normal, Math.sin(0.4))))
  })
})

function ringProjector(camera: CameraState, axis: WorkplaneGizmoAxisName, plane = workplane) {
  const basis = getWorkplaneBasis(plane)
  const [a, b] =
    axis === 'X' ? [basis.up, basis.normal] : axis === 'Y' ? [basis.normal, basis.right] : [basis.right, basis.up]
  const matrices = createCameraMatrices(camera, viewport.width / viewport.height)
  const radius = workplaneRotationGizmoRadius(worldUnitsPerPixel(matrices, viewport.height, plane.origin))
  return (angle: number) => {
    const world = add3(plane.origin, add3(scale3(a, radius * Math.cos(angle)), scale3(b, radius * Math.sin(angle))))
    const p = transformMat4(matrices.viewProjection, [...world, 1])
    return {
      x: viewport.left + ((p[0] / p[3] + 1) * viewport.width) / 2,
      y: viewport.top + ((1 - p[1] / p[3]) * viewport.height) / 2
    }
  }
}

function assertRotatedBasis(rotation: Vec3, axis: WorkplaneGizmoAxisName, angle: number) {
  const start = getWorkplaneBasis(workplane)
  const result = getWorkplaneBasis({ ...workplane, rotation })
  const normal = axis === 'X' ? start.right : axis === 'Y' ? start.up : start.normal
  for (const key of ['right', 'up', 'normal'] as const) {
    const v = start[key]
    const expected = add3(
      add3(scale3(v, Math.cos(angle)), scale3(cross3(normal, v), Math.sin(angle))),
      scale3(normal, dot3(normal, v) * (1 - Math.cos(angle)))
    )
    expectVector(result[key], expected)
  }
}
// Float32 camera inversion contributes sub-pixel error to the ray/plane intersection.
function expectVector(actual: Vec3, expected: Vec3) {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
}
