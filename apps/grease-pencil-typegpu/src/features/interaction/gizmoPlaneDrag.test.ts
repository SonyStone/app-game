import { expect, it } from 'vitest'
import { createDefaultCamera } from '../../render/cameraDefaults'
import { createCameraMatrices } from '../../render/cameraMatrices'
import { gizmoPlanes } from '../../render/gizmoGeometry'
import { transformMat4 } from '../../render/matrixTransform'
import { add3, dot3, sub3, type Vec3 } from '../../render/vector'
import { getWorkplaneBasis } from '../../render/workplane'
import { createGizmoPlaneDrag } from './gizmoPlaneDrag'

it.each(['XY', 'XZ', 'YZ'])('moves in the local %s plane without drift or normal displacement', (name) => {
  const origin: Vec3 = [1, 2, 0.5]
  const basis = getWorkplaneBasis({ origin, rotation: [0.3, -0.4, 0.8], gridScale: 1 })
  const plane = gizmoPlanes(basis, 0.01).find((plane) => plane.name === name)!
  const viewport = { left: 24, top: 31, width: 900, height: 700 }
  const camera = { ...createDefaultCamera(), target: origin, roll: 1.1 }
  const matrix = createCameraMatrices(camera, viewport.width / viewport.height).viewProjection
  const screen = (point: Vec3) => {
    const p = transformMat4(matrix, [...point, 1])
    return {
      x: viewport.left + ((p[0] / p[3] + 1) * viewport.width) / 2,
      y: viewport.top + ((1 - p[1] / p[3]) * viewport.height) / 2
    }
  }
  const start = plane.corners[0],
    end = plane.corners[2]
  const move = createGizmoPlaneDrag(camera, viewport, origin, plane.normal, screen(start))!
  expect(move).toBeDefined()
  const expected = add3(origin, sub3(end, start))
  const result = move(screen(end))!
  result.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
  expect(dot3(sub3(result, origin), plane.normal)).toBeCloseTo(0, 5)
  const returned = move(screen(start))!
  returned.forEach((value, i) => expect(value).toBeCloseTo(origin[i], 5))
})
