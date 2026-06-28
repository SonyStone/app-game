import type {
  DrawingGrid,
  DrawingWorkplane,
  GreaseLayer,
  LayerFrame,
  LayerFrameType,
  OnionSkinSettings,
} from './model'
import type {
  StoredDrawing,
  StoredStroke,
  StoredStrokePoint,
} from './storageTypes'
import {
  isRecord,
  isVec3,
  isVec4,
} from './storagePrimitiveValidation'

export function isDrawingWorkplane(value: unknown): value is DrawingWorkplane {
  if (!isRecord(value)) return false
  return (
    isVec3(value.origin) &&
    isVec3(value.rotation) &&
    typeof value.gridScale === 'number'
  )
}

export function isDrawingGrid(value: unknown): value is DrawingGrid {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isDrawingWorkplane(value)
  )
}

export function isOnionSkinSettings(value: unknown): value is OnionSkinSettings {
  if (!isRecord(value)) return false
  return (
    typeof value.enabled === 'boolean' &&
    typeof value.previousFrames === 'number' &&
    typeof value.nextFrames === 'number' &&
    typeof value.opacity === 'number' &&
    isVec4(value.previousColor) &&
    isVec4(value.nextColor)
  )
}

export function isGreaseLayer(value: unknown): value is GreaseLayer {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.opacity === 'number' &&
    Array.isArray(value.frames) &&
    value.frames.every(isLayerFrame)
  )
}

export function isStoredDrawing(value: unknown): value is StoredDrawing {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    Array.isArray(value.strokes) &&
    value.strokes.every(isStoredStroke)
  )
}

function isLayerFrame(value: unknown): value is LayerFrame {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.frameNumber === 'number' &&
    typeof value.drawingId === 'string' &&
    isLayerFrameType(value.type)
  )
}

function isStoredStroke(value: unknown): value is StoredStroke {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    (!('materialId' in value) || typeof value.materialId === 'string') &&
    isVec4(value.color) &&
    typeof value.radius === 'number' &&
    (!('closed' in value) || typeof value.closed === 'boolean') &&
    Array.isArray(value.points) &&
    value.points.every(isStoredStrokePoint)
  )
}

function isStoredStrokePoint(value: unknown): value is StoredStrokePoint {
  if (!isRecord(value)) return false
  return (
    isVec3(value.position) &&
    typeof value.pressure === 'number' &&
    (!('radius' in value) || typeof value.radius === 'number') &&
    (!('opacity' in value) || typeof value.opacity === 'number') &&
    (!('vertexColor' in value) || isVec4(value.vertexColor)) &&
    typeof value.time === 'number'
  )
}

function isLayerFrameType(value: unknown): value is LayerFrameType {
  return (
    value === 'keyframe' ||
    value === 'breakdown' ||
    value === 'extreme' ||
    value === 'jitter' ||
    value === 'moving-hold'
  )
}
