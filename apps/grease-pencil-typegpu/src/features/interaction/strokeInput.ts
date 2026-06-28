import type { GreaseMaterial, StrokePoint } from '../../document'
import type { Vec3 } from '../../shared/vector'
import { copyVec4 } from '../shared/color'
import { pointerPressure } from './drawingInput'

export function isStylusBarrelButton(event: PointerEvent) {
  return event.pointerType === 'pen' && (event.buttons & 32) !== 0
}

export function strokePointFromInput(
  event: PointerEvent,
  material: GreaseMaterial,
  brushStrength: number,
  position: Vec3,
): StrokePoint {
  const pressure = pointerPressure(event)
  return {
    position,
    pressure,
    radius: radiusFromInput(material.strokeRadius, pressure),
    opacity: opacityFromInput(event, pressure, brushStrength),
    vertexColor: copyVec4(material.strokeColor),
    time: performance.now(),
  }
}

function opacityFromInput(
  event: PointerEvent,
  pressure: number,
  brushStrength: number,
) {
  const pressureOpacity = event.pointerType === 'mouse' ? 1 : Math.max(0.12, pressure)
  return clamp01(brushStrength * pressureOpacity)
}

function radiusFromInput(strokeRadius: number, pressure: number) {
  const radius = strokeRadius * pressure
  if (!Number.isFinite(radius)) return 0.045
  return Math.max(0.002, Math.min(0.4, radius))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}
