import type { StrokePoint } from '../../document'
import {
  add3,
  clamp,
  distance3,
  normalize3,
  scale3,
  sub3,
  type Vec3,
} from '../../shared/vector'

export function shouldAppendPoint(points: StrokePoint[], point: StrokePoint) {
  const previous = points[points.length - 1]
  if (!previous) return true
  return distance3(previous.position, point.position) > 0.015
}

export function pointerPressure(event: PointerEvent) {
  if (event.pointerType === 'mouse') return event.buttons ? 0.72 : 0.5
  return clamp(event.pressure || 0.5, 0.08, 1)
}

export function smoothPoint(previous: Vec3, next: Vec3): Vec3 {
  const delta = sub3(next, previous)
  const direction = normalize3(delta)
  const distance = Math.min(distance3(previous, next), 0.08)
  return add3(previous, scale3(direction, distance))
}
