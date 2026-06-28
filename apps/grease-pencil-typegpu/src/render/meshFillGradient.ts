import type { Stroke } from '../document'
import {
  clamp,
  dot3,
  type Vec3,
  type Vec4,
} from './math'
import {
  applyOpacity,
  interpolateColor,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import {
  discBasis,
  type WorkplaneBasis,
} from './workplane'

type FillGradient = {
  basis: Pick<WorkplaneBasis, 'right' | 'up'>
  minX: number
  maxX: number
  centerX: number
  centerY: number
  radius: number
  mixColor: Vec4
  gradientType: 'linear' | 'radial'
}

export function createFillGradient(
  stroke: Stroke,
  style: StrokeRenderStyle,
): FillGradient | undefined {
  const material = style.material
  if (style.color || material?.fillStyle !== 'gradient') return

  const basis = discBasis(style.offsetNormal)
  const first = stroke.points[0]
  if (!first) return

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of stroke.points) {
    const x = dot3(point.position, basis.right)
    const y = dot3(point.position, basis.up)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const centerX = (minX + maxX) * 0.5
  const centerY = (minY + maxY) * 0.5
  const radius = Math.max((maxX - minX) * 0.5, (maxY - minY) * 0.5, 1e-5)
  return {
    basis,
    minX,
    maxX,
    centerX,
    centerY,
    radius,
    mixColor: material.mixColor,
    gradientType: material.gradientType,
  }
}

export function fillColorAtPoint(
  color: Vec4,
  position: Vec3,
  opacity: number,
  gradient: FillGradient | undefined,
) {
  if (!gradient) return applyOpacity(color, opacity)

  const factor =
    gradient.gradientType === 'radial'
      ? radialGradientFactor(position, gradient)
      : linearGradientFactor(position, gradient)
  return applyOpacity(interpolateColor(color, gradient.mixColor, factor), opacity)
}

function linearGradientFactor(position: Vec3, gradient: FillGradient) {
  const width = gradient.maxX - gradient.minX
  if (width <= 1e-5) return 0
  const x = dot3(position, gradient.basis.right)
  return clamp((x - gradient.minX) / width, 0, 1)
}

function radialGradientFactor(position: Vec3, gradient: FillGradient) {
  const x = dot3(position, gradient.basis.right)
  const y = dot3(position, gradient.basis.up)
  const distance = Math.hypot(x - gradient.centerX, y - gradient.centerY)
  return clamp(distance / gradient.radius, 0, 1)
}
