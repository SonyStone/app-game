import type { Vec4 } from './math'
import { appendGuideLine, type ScreenSpaceGuides } from './screenSpaceGuides'
import { add3, scale3 } from './vector'
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
  view: ScreenSpaceGuides,
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
    const width = isAxis ? 1.25 : 0.75
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
    const point = (x: number, y: number) =>
      add3(workplanePoint(basis, x, y), scale3(basis.normal, zOffset))
    appendGuideLine(vertices, point(position, -size), point(position, size), width, xColor, view)
    appendGuideLine(vertices, point(-size, position), point(size, position), width, yColor, view)
  }
}
