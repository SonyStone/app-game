import { expect, it } from 'vitest'
import { faces, targets } from '../../../../packages/solid-view-cube/src/cubeGeometry'
import {
  dot,
  interpolateOrientation,
  presetOrientation,
  rollOrientation,
  sameOrientation
} from '../../../../packages/solid-view-cube/src/orientation'
import { getCameraBasis } from './cameraMatrices'
import {
  applyViewOrientation,
  cameraOrientation,
  interpolateViewOrientation
} from './viewCubeCamera'
import { createDefaultCamera } from './viewportCamera'

it('round-trips every preset and roll through Euler camera storage without moving the pivot', () => {
  for (const target of targets)
    for (const angle of [0, 0.4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const camera = createDefaultCamera()
      camera.target = [3, -2, 7]
      const pose = rollOrientation(presetOrientation(target.direction), angle)
      applyViewOrientation(camera, pose)
      expect(sameOrientation(cameraOrientation(camera), pose)).toBe(true)
      expect(camera.target).toEqual([3, -2, 7])
      expect(camera.distance).toBe(7.5)
    }
})

it('the same roll request produces the same screen rotation in 2D and 3D on every plane', () => {
  for (const face of faces) {
    const initial = presetOrientation(face.normal)
    const camera3d = createDefaultCamera()
    applyViewOrientation(camera3d, initial)
    const camera2d = {
      ...createDefaultCamera(),
      mode: '2d' as const,
      lockedNormal: [...initial.direction] as [number, number, number],
      lockedUp: [...initial.up] as [number, number, number]
    }
    const worldRight = getCameraBasis(camera3d).right
    const next = rollOrientation(initial, -Math.PI / 2)
    applyViewOrientation(camera3d, next)
    applyViewOrientation(camera2d, next, true)
    expect(sameOrientation(cameraOrientation(camera2d), cameraOrientation(camera3d))).toBe(true)
    expect(dot(worldRight, cameraOrientation(camera2d).up)).toBeCloseTo(1)
    expect(camera2d.mode).toBe('2d')
  }
})

it('interpolates a 2D-to-3D transition without snapping at the first frame', () => {
  const from = {
    ...createDefaultCamera(),
    mode: '2d' as const,
    lockedNormal: [0, 0, 1] as [number, number, number],
    lockedUp: [1, 0, 0] as [number, number, number],
    roll: 0.7
  }
  const to = createDefaultCamera(),
    current = createDefaultCamera()
  for (const t of [0, 0.1, 0.5, 1]) {
    interpolateViewOrientation(current, from, to, t)
    expect(
      sameOrientation(
        cameraOrientation(current),
        interpolateOrientation(cameraOrientation(from), cameraOrientation(to), t)
      )
    ).toBe(true)
  }
})
