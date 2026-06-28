import type {
  MaterialStrokeMode,
  Stroke,
  StrokeCapStyle,
} from '../document'
import type {
  Vec3,
  Vec4,
} from './math'
import { appendDisc } from './meshDiscPrimitive'
import { appendSquarePoint } from './meshSquarePrimitive'
import {
  pointColor,
  strokeRadius,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'

export function appendSinglePointStroke(
  vertices: number[],
  position: Vec3,
  radius: number,
  color: Vec4,
  opacity: number,
  zOffset: number,
  offsetNormal: Vec3,
  capStyle: StrokeCapStyle,
) {
  if (capStyle === 'flat') return

  if (capStyle === 'square') {
    appendSquarePoint(vertices, position, radius, color, opacity, zOffset, offsetNormal)
    return
  }

  appendDisc(vertices, position, radius, color, opacity, zOffset, offsetNormal)
}

export function appendStrokeSamples(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  strokeMode: Exclude<MaterialStrokeMode, 'line'>,
) {
  for (const point of stroke.points) {
    const radius = strokeRadius(stroke, point, style)
    const sampleColor = pointColor(color, point, style)

    switch (strokeMode) {
      case 'dot':
        appendDisc(
          vertices,
          point.position,
          radius,
          sampleColor,
          style.opacity,
          style.zOffset,
          style.offsetNormal,
        )
        break
      case 'square':
        appendSquarePoint(
          vertices,
          point.position,
          radius,
          sampleColor,
          style.opacity,
          style.zOffset,
          style.offsetNormal,
        )
        break
      default:
        assertUnhandledSampleMode(strokeMode)
    }
  }
}

function assertUnhandledSampleMode(strokeMode: never): never {
  throw new Error(`Unhandled stroke sample mode: ${strokeMode}`)
}
