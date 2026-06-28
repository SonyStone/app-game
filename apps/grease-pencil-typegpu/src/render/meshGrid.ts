import type { Vec4 } from './math'
import { appendSegment } from './meshSegmentPrimitive'
import { workplanePoint, type WorkplaneBasis } from './workplane'

export function appendGrid(
  vertices: number[],
  basis: WorkplaneBasis,
  gridScale: number,
) {
  const extent = 10
  const spacing = Math.max(0.1, gridScale)
  const size = extent * spacing
  for (let i = -extent; i <= extent; i += 1) {
    const position = i * spacing
    const isAxis = i === 0
    const alpha = isAxis ? 0.46 : i % 5 === 0 ? 0.2 : 0.115
    const width = (isAxis ? 0.012 : 0.006) * spacing
    const xColor: Vec4 = isAxis
      ? [0.86, 0.18, 0.18, alpha]
      : [0.16, 0.18, 0.2, alpha]
    const yColor: Vec4 = isAxis
      ? [0.16, 0.4, 0.88, alpha]
      : [0.16, 0.18, 0.2, alpha]
    appendSegment(
      vertices,
      workplanePoint(basis, position, -size),
      workplanePoint(basis, position, size),
      width,
      xColor,
      width,
      1,
      -0.014 * spacing,
      basis.normal,
    )
    appendSegment(
      vertices,
      workplanePoint(basis, -size, position),
      workplanePoint(basis, size, position),
      width,
      yColor,
      width,
      1,
      -0.014 * spacing,
      basis.normal,
    )
  }
}
