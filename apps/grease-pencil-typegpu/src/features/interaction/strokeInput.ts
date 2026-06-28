import type { GreaseMaterial, StrokePoint } from '../../document'
import type { Vec3 } from '../../shared/vector'
import { copyVec4 } from '../shared/color'
import { pointerPressure } from './drawingInput'

export type StrokeInputSample = {
  position: Vec3
  pressure: number
  pointerType: string
  time: number
}

export function isStylusBarrelButton(event: PointerEvent) {
  return event.pointerType === 'pen' && (event.buttons & 32) !== 0
}

export function strokeInputSampleFromEvent(
  event: PointerEvent,
  position: Vec3,
): StrokeInputSample {
  return {
    position,
    pressure: pointerPressure(event),
    pointerType: event.pointerType,
    time: event.timeStamp,
  }
}

export function strokePointFromInput(
  event: PointerEvent,
  material: GreaseMaterial,
  brushStrength: number,
  position: Vec3,
): StrokePoint {
  return strokePointFromSample(
    strokeInputSampleFromEvent(event, position),
    material,
    brushStrength,
  )
}

export function strokePointFromSample(
  sample: StrokeInputSample,
  material: GreaseMaterial,
  brushStrength: number,
): StrokePoint {
  const pressure = clamp01(sample.pressure)
  return {
    position: sample.position,
    pressure,
    radius: radiusFromInput(material.strokeRadius, pressure),
    opacity: opacityFromInput(sample.pointerType, pressure, brushStrength),
    vertexColor: copyVec4(material.strokeColor),
    time: Number.isFinite(sample.time) ? sample.time : performance.now(),
  }
}

function opacityFromInput(
  pointerType: string,
  pressure: number,
  brushStrength: number,
) {
  const pressureOpacity = pointerType === 'mouse' ? 1 : Math.max(0.12, pressure)
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
