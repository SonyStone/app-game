import type { Vec4 } from '../shared/vector'
import {
  copyVec3,
  copyVec4,
} from './geometry'
import type {
  Stroke,
  StrokePoint,
} from './model'

export function copyStrokePoint(
  point: StrokePoint,
  fallbackStrokeRadius = 0.045,
  fallbackVertexColor: Vec4 = [0, 0, 0, 1],
): StrokePoint {
  return {
    position: copyVec3(point.position),
    pressure: point.pressure,
    radius: sanitizePointRadius(point.radius ?? fallbackStrokeRadius * point.pressure),
    opacity: clamp01(point.opacity),
    vertexColor: copyVec4(point.vertexColor ?? fallbackVertexColor),
    time: point.time,
  }
}

export function pointRadius(stroke: Pick<Stroke, 'radius'>, point: StrokePoint) {
  return sanitizePointRadius(point.radius || stroke.radius * point.pressure)
}

export function sanitizeStrokeRadius(value: number) {
  if (!Number.isFinite(value)) return 0.045
  return Math.max(0.002, Math.min(0.4, value))
}

export function sanitizePointRadius(value: number) {
  return sanitizeStrokeRadius(value)
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}
