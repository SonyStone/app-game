import type { Vec4 } from '../shared/vector'
import {
  copyVec3,
  copyVec4,
} from './geometry'
import type {
  Drawing,
  MaterialId,
  Stroke,
  StrokePoint,
} from './model'
import {
  clamp01,
  sanitizePointRadius,
  sanitizeStrokeRadius,
} from './storageScalarNormalize'
import type {
  StoredDrawing,
  StoredStroke,
  StoredStrokePoint,
} from './storageTypes'

export function normalizeDrawing(
  drawing: StoredDrawing,
  fallbackMaterialId: MaterialId,
): Drawing {
  return {
    id: drawing.id,
    strokes: drawing.strokes.map((stroke) =>
      normalizeStroke(stroke, fallbackMaterialId),
    ),
  }
}

function normalizeStroke(
  stroke: StoredStroke,
  fallbackMaterialId: MaterialId,
): Stroke {
  const radius = sanitizeStrokeRadius(stroke.radius)
  const color = copyVec4(stroke.color)
  return {
    id: stroke.id,
    materialId: stroke.materialId ?? fallbackMaterialId,
    color,
    radius,
    closed: stroke.closed ?? false,
    points: stroke.points.map((point) => copyStrokePoint(point, radius, color)),
  }
}

function copyStrokePoint(
  point: StoredStrokePoint,
  fallbackStrokeRadius = 0.045,
  fallbackVertexColor: Vec4 = [0, 0, 0, 1],
): StrokePoint {
  return {
    position: copyVec3(point.position),
    pressure: point.pressure,
    radius: pointRadiusFromStoredPoint(point, fallbackStrokeRadius),
    opacity: clamp01(point.opacity ?? 1),
    vertexColor: normalizePointVertexColor(point.vertexColor, fallbackVertexColor),
    time: point.time,
  }
}

function pointRadiusFromStoredPoint(
  point: StoredStrokePoint,
  fallbackStrokeRadius: number,
) {
  return sanitizePointRadius(point.radius ?? fallbackStrokeRadius * point.pressure)
}

function normalizePointVertexColor(
  vertexColor: Vec4 | undefined,
  fallbackVertexColor: Vec4,
) {
  return copyVec4(vertexColor ?? fallbackVertexColor)
}
