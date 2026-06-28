import type {
  GreaseMaterial,
  MaterialStrokeMode,
  RenderLayer,
  Stroke,
  StrokeCapStyle,
  StrokeJoinStyle,
  StrokePoint,
} from '../document'
import { clamp, type Vec4 } from './math'
import type { StrokeRenderStyle } from './meshTypes'

export function getStrokeMaterial(
  stroke: Stroke,
  materials: readonly GreaseMaterial[],
): GreaseMaterial | undefined {
  return materials.find((material) => material.id === stroke.materialId)
}

export function getStrokeMaterialFromLayers(
  stroke: Stroke,
  layers: readonly RenderLayer[],
): GreaseMaterial | undefined {
  for (const layer of layers) {
    const material = getStrokeMaterial(stroke, layer.materials)
    if (material) return material
  }
}

export function strokeCapStyle(
  style: Pick<StrokeRenderStyle, 'material'>,
): StrokeCapStyle {
  return style.material?.capStyle ?? 'round'
}

export function strokeJoinStyle(
  style: Pick<StrokeRenderStyle, 'material'>,
): StrokeJoinStyle {
  return style.material?.joinStyle ?? 'round'
}

export function materialStrokeMode(
  style: Pick<StrokeRenderStyle, 'material'>,
): MaterialStrokeMode {
  return style.material?.strokeMode ?? 'line'
}

export function strokeRadius(
  stroke: Stroke,
  point: StrokePoint,
  style: Pick<StrokeRenderStyle, 'radiusOffset'>,
) {
  const radius = Number.isFinite(point.radius)
    ? point.radius
    : stroke.radius * point.pressure
  return Math.max(0.002, radius + (style.radiusOffset ?? 0))
}

export function pointColor(
  color: Vec4,
  point: StrokePoint,
  style: Pick<StrokeRenderStyle, 'ignorePointOpacity' | 'ignoreVertexColor'>,
): Vec4 {
  const vertexColor = style.ignoreVertexColor
    ? color
    : blendVertexColor(color, point.vertexColor)
  if (style.ignorePointOpacity) return vertexColor
  return applyOpacity(vertexColor, pointOpacity(point))
}

export function applyOpacity(color: Vec4, opacity: number): Vec4 {
  const safeOpacity = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1
  if (safeOpacity >= 0.999) return color
  return [color[0], color[1], color[2], color[3] * safeOpacity]
}

export function averagePointOpacity(
  stroke: Stroke,
  style: Pick<StrokeRenderStyle, 'ignorePointOpacity'>,
) {
  if (style.ignorePointOpacity || stroke.points.length === 0) return 1

  let total = 0
  for (const point of stroke.points) total += pointOpacity(point)
  return total / stroke.points.length
}

export function interpolate(start: number, end: number, mix: number) {
  return start + (end - start) * mix
}

export function interpolateColor(start: Vec4, end: Vec4, mix: number): Vec4 {
  return [
    interpolate(start[0], end[0], mix),
    interpolate(start[1], end[1], mix),
    interpolate(start[2], end[2], mix),
    interpolate(start[3], end[3], mix),
  ]
}

function blendVertexColor(color: Vec4, vertexColor: Vec4): Vec4 {
  const mix = Number.isFinite(vertexColor[3]) ? clamp(vertexColor[3], 0, 1) : 0
  if (mix <= 0.001) return color

  return [
    interpolate(color[0], vertexColor[0], mix),
    interpolate(color[1], vertexColor[1], mix),
    interpolate(color[2], vertexColor[2], mix),
    color[3],
  ]
}

function pointOpacity(point: StrokePoint) {
  if (!Number.isFinite(point.opacity)) return 1
  return clamp(point.opacity, 0, 1)
}
