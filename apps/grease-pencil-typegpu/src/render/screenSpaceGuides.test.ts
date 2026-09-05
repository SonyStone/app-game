import { describe, expect, it } from 'vitest'
import { createDefaultCamera } from './cameraDefaults'
import { getCameraBasis } from './cameraMatrices'
import { transformMat4 } from './matrixTransform'
import { appendWorkplaneGizmo, workplaneGizmoLength } from './meshOverlays'
import {
  appendGuideLine,
  createScreenSpaceGuides,
  worldUnitsPerPixel,
  type ScreenSpaceGuides
} from './screenSpaceGuides'
import { add3, scale3, type Vec3 } from './vector'
import { getWorkplaneBasis } from './workplane'

describe('screen-space guides', () => {
  it.each([0.3, 1, 7.5, 60])('keeps lines thin and gizmos bounded at camera distance %s', (distance) => {
    const camera = { ...createDefaultCamera(), distance, roll: 1.2 }
    const view = createScreenSpaceGuides(camera, 1000, 700)
    const { right, forward } = getCameraBasis(camera)
    const units = worldUnitsPerPixel(view.matrices, view.height, [0, 0, 0])
    const vertices: number[] = []
    // Endpoints at different depths exercise perspective, not just a face-on line.
    appendGuideLine(
      vertices,
      scale3(right, -units * 20),
      add3(scale3(right, units * 20), scale3(forward, distance)),
      1,
      [1, 0, 0, 1],
      view
    )
    const a = projectedVertex(vertices, 6, view),
      b = projectedVertex(vertices, 7, view)
    const c = projectedVertex(vertices, 8, view),
      d = projectedVertex(vertices, 11, view)
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(1, 1)
    expect(Math.hypot(c[0] - d[0], c[1] - d[1])).toBeCloseTo(1, 1)

    const gizmo: number[] = []
    appendWorkplaneGizmo(gizmo, getWorkplaneBasis({ origin: [0, 0, 0], rotation: [0, 0, 0], gridScale: 1 }), view)
    const radius = Math.max(
      ...Array.from({ length: gizmo.length / 7 }, (_, i) => {
        const p = projectedVertex(gizmo, i, view)
        return Math.hypot(p[0] - 500, p[1] - 350)
      })
    )
    expect(radius).toBeGreaterThan(75)
    expect(radius).toBeLessThan(115)
    const endpoint = project(scale3(right, workplaneGizmoLength(units)), view)
    expect(Math.hypot(endpoint[0] - 500, endpoint[1] - 350)).toBeCloseTo(90, 1)
  })

  it('uses depth at the gizmo origin after panning, rather than orbit distance', () => {
    const camera = createDefaultCamera()
    const view = createScreenSpaceGuides(camera, 390, 844)
    const { forward } = getCameraBasis(camera)
    const origin: Vec3 = scale3(forward, camera.distance)
    expect(worldUnitsPerPixel(view.matrices, view.height, origin)).toBeCloseTo(
      worldUnitsPerPixel(view.matrices, view.height, camera.target) * 2,
      5
    )
  })

  it('clips floor lines crossing the near plane and rejects lines entirely behind the camera', () => {
    const camera = createDefaultCamera()
    const view = createScreenSpaceGuides(camera, 1000, 700)
    const { forward, right } = getCameraBasis(camera)
    const behind = add3(view.matrices.position, scale3(forward, -1))
    const vertices: number[] = []
    appendGuideLine(vertices, behind, scale3(right, 1), 1, [1, 1, 1, 1], view)
    expect(vertices.length).toBeGreaterThan(0)
    expect(vertices.every(Number.isFinite)).toBe(true)
    vertices.length = 0
    appendGuideLine(vertices, behind, add3(behind, right), 1, [1, 1, 1, 1], view)
    expect(vertices).toHaveLength(0)
    expect(worldUnitsPerPixel(view.matrices, view.height, behind)).toBe(0)
  })
})

function projectedVertex(vertices: number[], index: number, view: ScreenSpaceGuides) {
  return project([vertices[index * 7], vertices[index * 7 + 1], vertices[index * 7 + 2]], view)
}
function project(position: Vec3, view: ScreenSpaceGuides) {
  const clip = transformMat4(view.matrices.viewProjection, [...position, 1])
  return [((clip[0] / clip[3] + 1) * view.width) / 2, ((1 - clip[1] / clip[3]) * view.height) / 2]
}
