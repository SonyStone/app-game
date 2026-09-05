import { expect, it } from 'vitest'
import { frontGizmoRing } from './gizmoGeometry'
import { dot3, sub3, type Vec3 } from './vector'

it('keeps only the camera-facing arc, including after looking from the opposite side', () => {
  const origin: Vec3 = [1, 2, 3]
  for (const camera of [
    [4, -3, 6],
    [-4, 3, -6]
  ] as Vec3[]) {
    const segments = frontGizmoRing(origin, [1, 0, 0], [0, 1, 0], 2, camera)
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      for (const point of [segment.start, segment.end]) {
        expect(dot3(sub3(point, origin), sub3(camera, origin))).toBeGreaterThanOrEqual(-1e-10)
      }
    }
    expect(segments[0].start).not.toEqual(segments.at(-1)!.end)
  }
})

it('keeps the entire silhouette of a face-on ring', () => {
  const ring = frontGizmoRing([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, [0, 0, 10])
  ring.at(-1)!.end.forEach((value, i) => expect(value).toBeCloseTo(ring[0].start[i], 8))
})
