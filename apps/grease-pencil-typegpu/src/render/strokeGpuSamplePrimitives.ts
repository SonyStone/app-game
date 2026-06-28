import type {
  MaterialStrokeMode,
  Stroke,
} from '../document'
import type { Vec4 } from './math'
import {
  pointColor,
  strokeRadius,
} from './meshStyle'
import type { StrokeRenderStyle } from './meshTypes'
import {
  appendPointPrimitive,
  type StrokeGpuPrimitives,
} from './strokeGpuPrimitiveTypes'

export function appendStrokeSamplePrimitives(
  primitives: StrokeGpuPrimitives,
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  strokeMode: Exclude<MaterialStrokeMode, 'line'>,
) {
  for (const point of stroke.points) {
    const target = strokeMode === 'dot' ? primitives.discs : primitives.squares
    appendPointPrimitive(
      target,
      point.position,
      strokeRadius(stroke, point, style),
      pointColor(color, point, style),
      style.opacity,
      style.zOffset,
    )
  }
}
