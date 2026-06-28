import type { Vec4 } from './math'
import { appendSegment } from './meshSegmentPrimitive'
import { workplanePoint, type WorkplaneBasis } from './workplane'

type GridRenderOptions = {
  alphaScale?: number
  neutral?: boolean
  zOffset?: number
}

export function appendGrid(
  vertices: number[],
  basis: WorkplaneBasis,
  gridScale: number,
  options: GridRenderOptions = {},
) {
  const extent = 10
  const spacing = Math.max(0.1, gridScale)
  const size = extent * spacing
  const alphaScale = options.alphaScale ?? 1
  for (let i = -extent; i <= extent; i += 1) {
    const position = i * spacing
    const isAxis = i === 0
    const alpha = (isAxis ? 0.46 : i % 5 === 0 ? 0.2 : 0.115) * alphaScale
    const width = (isAxis ? 0.012 : 0.006) * spacing
    const lineColor: Vec4 = [0.16, 0.18, 0.2, alpha]
    const xColor: Vec4 = options.neutral
      ? lineColor
      : isAxis
        ? [0.86, 0.18, 0.18, alpha]
        : lineColor
    const yColor: Vec4 = options.neutral
      ? lineColor
      : isAxis
        ? [0.16, 0.4, 0.88, alpha]
        : lineColor
    const zOffset = options.zOffset ?? -0.014 * spacing
    appendSegment(
      vertices,
      workplanePoint(basis, position, -size),
      workplanePoint(basis, position, size),
      width,
      xColor,
      width,
      1,
      zOffset,
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
      zOffset,
      basis.normal,
    )
  }
}
