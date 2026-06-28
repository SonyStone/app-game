import type {
  DocumentId,
  DrawingId,
  FrameId,
  LayerId,
  MaterialId,
  StrokeId,
  StrokePointKey,
  WorkplaneId,
} from './model'

export function createStrokePointKey(
  strokeId: StrokeId,
  pointIndex: number,
): StrokePointKey {
  return `${strokeId}:${sanitizePointIndex(pointIndex)}` as StrokePointKey
}

export function createDocumentId() {
  return makeId('document') as DocumentId
}

export function createLayerId() {
  return makeId('layer') as LayerId
}

export function createDrawingId() {
  return makeId('drawing') as DrawingId
}

export function createFrameId() {
  return makeId('frame') as FrameId
}

export function createStrokeId() {
  return makeId('stroke') as StrokeId
}

export function createMaterialId() {
  return makeId('material') as MaterialId
}

export function createWorkplaneId() {
  return makeId('workplane') as WorkplaneId
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function sanitizePointIndex(pointIndex: number) {
  if (!Number.isFinite(pointIndex)) return 0
  return Math.max(0, Math.round(pointIndex))
}
