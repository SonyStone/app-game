import type { Vec3, Vec4 } from '../render/math'
import {
  addVec3,
  copyVec3,
  copyVec4,
  distanceBetweenSegments,
  distanceToSegment,
  isFiniteVec3,
  lengthSquared3,
} from './geometry'
import { createStrokeId, createStrokePointKey } from './ids'
import {
  getActiveLayer,
  getLayerDrawingAtFrame,
} from './selectors'
import {
  copyStroke,
  ensureLayerFrame,
  replaceDrawing,
} from './structure'
import type {
  GreaseDocument,
  GreaseMaterial,
  LayerId,
  Stroke,
  StrokeId,
  StrokePoint,
  StrokePointKey,
} from './model'

export function createStroke(
  material: GreaseMaterial,
  points: StrokePoint[],
  options: { closed?: boolean } = {},
): Stroke {
  return {
    id: createStrokeId(),
    materialId: material.id,
    color: copyVec4(material.strokeColor),
    radius: material.strokeRadius,
    closed: options.closed ?? false,
    points: points.map((point) =>
      copyStrokePoint(point, material.strokeRadius, material.strokeColor),
    ),
  }
}

export function appendStrokeToLayerFrame(
  document: GreaseDocument,
  layerId: LayerId,
  frameNumber: number,
  stroke: Stroke,
): GreaseDocument {
  const targetLayer = document.layers.find((layer) => layer.id === layerId)
  if (!targetLayer || targetLayer.locked || !targetLayer.visible) return document

  const ensured = ensureLayerFrame(document, layerId, frameNumber)

  return {
    ...ensured.document,
    drawings: ensured.document.drawings.map((drawing) =>
      drawing.id === ensured.frame.drawingId
        ? { ...drawing, strokes: [...drawing.strokes, copyStroke(stroke)] }
        : drawing,
    ),
  }
}

export function undoActiveDrawing(document: GreaseDocument): GreaseDocument {
  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const drawing = getLayerDrawingAtFrame(document, activeLayer.id)
  if (!drawing || drawing.strokes.length === 0) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: drawing.strokes.slice(0, -1),
  })
}

export function clearActiveDrawing(document: GreaseDocument): GreaseDocument {
  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const ensured = ensureLayerFrame(document, activeLayer.id, document.currentFrame)

  return replaceDrawing(ensured.document, ensured.frame.drawingId, {
    id: ensured.frame.drawingId,
    strokes: [],
  })
}

export function deleteStrokesFromActiveDrawing(
  document: GreaseDocument,
  strokeIds: ReadonlySet<StrokeId>,
): GreaseDocument {
  if (strokeIds.size === 0) return document

  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const drawing = getLayerDrawingAtFrame(document, activeLayer.id)
  if (!drawing) return document

  const nextStrokes = drawing.strokes.filter((stroke) => !strokeIds.has(stroke.id))
  if (nextStrokes.length === drawing.strokes.length) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: nextStrokes,
  })
}

export function translateStrokesInActiveDrawing(
  document: GreaseDocument,
  strokeIds: ReadonlySet<StrokeId>,
  delta: Vec3,
): GreaseDocument {
  if (strokeIds.size === 0 || !isFiniteVec3(delta) || lengthSquared3(delta) < 1e-12) {
    return document
  }

  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const drawing = getLayerDrawingAtFrame(document, activeLayer.id)
  if (!drawing) return document

  let changed = false
  const nextStrokes = drawing.strokes.map((stroke) => {
    if (!strokeIds.has(stroke.id)) return stroke
    changed = true
    return translateStroke(stroke, delta)
  })

  if (!changed) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: nextStrokes,
  })
}

export function translatePointsInActiveDrawing(
  document: GreaseDocument,
  pointKeys: ReadonlySet<StrokePointKey>,
  delta: Vec3,
): GreaseDocument {
  if (pointKeys.size === 0 || !isFiniteVec3(delta) || lengthSquared3(delta) < 1e-12) {
    return document
  }

  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const drawing = getLayerDrawingAtFrame(document, activeLayer.id)
  if (!drawing) return document

  let changed = false
  const nextStrokes = drawing.strokes.map((stroke) => {
    const nextStroke = translateStrokePoints(stroke, pointKeys, delta)
    if (nextStroke !== stroke) changed = true
    return nextStroke
  })

  if (!changed) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: nextStrokes,
  })
}

export function deletePointsFromActiveDrawing(
  document: GreaseDocument,
  pointKeys: ReadonlySet<StrokePointKey>,
): GreaseDocument {
  if (pointKeys.size === 0) return document

  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const drawing = getLayerDrawingAtFrame(document, activeLayer.id)
  if (!drawing) return document

  let changed = false
  const nextStrokes: Stroke[] = []
  for (const stroke of drawing.strokes) {
    const nextPoints = stroke.points.filter(
      (_point, pointIndex) =>
        !pointKeys.has(createStrokePointKey(stroke.id, pointIndex)),
    )
    if (nextPoints.length !== stroke.points.length) changed = true
    if (nextPoints.length > 0) {
      nextStrokes.push({
        ...stroke,
        points: nextPoints,
      })
    }
  }

  if (!changed) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: nextStrokes,
  })
}

export function eraseStrokeSegmentFromActiveDrawing(
  document: GreaseDocument,
  start: Vec3,
  end: Vec3,
  radius: number,
): GreaseDocument {
  if (!isFiniteVec3(start) || !isFiniteVec3(end) || !Number.isFinite(radius)) {
    return document
  }

  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const drawing = getLayerDrawingAtFrame(document, activeLayer.id)
  if (!drawing) return document

  const safeRadius = Math.max(0.001, radius)
  let changed = false
  const nextStrokes: Stroke[] = []
  for (const stroke of drawing.strokes) {
    const erased = eraseStrokeSegment(stroke, start, end, safeRadius)
    if (erased.changed) changed = true
    nextStrokes.push(...erased.strokes)
  }

  if (!changed) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: nextStrokes,
  })
}

function translateStroke(stroke: Stroke, delta: Vec3): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      position: addVec3(point.position, delta),
    })),
  }
}

function translateStrokePoints(
  stroke: Stroke,
  pointKeys: ReadonlySet<StrokePointKey>,
  delta: Vec3,
) {
  let changed = false
  const points = stroke.points.map((point, pointIndex) => {
    if (!pointKeys.has(createStrokePointKey(stroke.id, pointIndex))) return point
    changed = true
    return {
      ...point,
      position: addVec3(point.position, delta),
    }
  })

  return changed ? { ...stroke, points } : stroke
}

function eraseStrokeSegment(
  stroke: Stroke,
  start: Vec3,
  end: Vec3,
  radius: number,
): { strokes: Stroke[]; changed: boolean } {
  if (stroke.points.length === 0) return { strokes: [], changed: false }

  const erasedPoints = stroke.points.map((point) =>
    distanceToSegment(point.position, start, end) <=
    radius + pointRadius(stroke, point),
  )

  for (let pointIndex = 0; pointIndex < stroke.points.length - 1; pointIndex += 1) {
    const current = stroke.points[pointIndex]
    const next = stroke.points[pointIndex + 1]
    if (!current || !next) continue

    const segmentRadius =
      radius +
      Math.max(
        pointRadius(stroke, current),
        pointRadius(stroke, next),
      )
    if (
      distanceBetweenSegments(current.position, next.position, start, end) <=
      segmentRadius
    ) {
      erasedPoints[pointIndex] = true
      erasedPoints[pointIndex + 1] = true
    }
  }

  if (!erasedPoints.some(Boolean)) {
    return { strokes: [stroke], changed: false }
  }

  const strokes: Stroke[] = []
  let currentPoints: StrokePoint[] = []
  for (let pointIndex = 0; pointIndex < stroke.points.length; pointIndex += 1) {
    const point = stroke.points[pointIndex]
    if (!point) continue

    if (erasedPoints[pointIndex]) {
      pushStrokeSegment(strokes, stroke, currentPoints)
      currentPoints = []
      continue
    }

    currentPoints.push(point)
  }
  pushStrokeSegment(strokes, stroke, currentPoints)

  return { strokes, changed: true }
}

function pushStrokeSegment(
  strokes: Stroke[],
  sourceStroke: Stroke,
  points: readonly StrokePoint[],
) {
  if (points.length === 0) return

  strokes.push({
    id: strokes.length === 0 ? sourceStroke.id : createStrokeId(),
    materialId: sourceStroke.materialId,
    color: copyVec4(sourceStroke.color),
    radius: sourceStroke.radius,
    closed: false,
    points: points.map((point) =>
      copyStrokePoint(point, sourceStroke.radius, sourceStroke.color),
    ),
  })
}

function copyStrokePoint(
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

function pointRadius(stroke: Pick<Stroke, 'radius'>, point: StrokePoint) {
  return sanitizePointRadius(point.radius || stroke.radius * point.pressure)
}

function sanitizeStrokeRadius(value: number) {
  if (!Number.isFinite(value)) return 0.045
  return Math.max(0.002, Math.min(0.4, value))
}

function sanitizePointRadius(value: number) {
  return sanitizeStrokeRadius(value)
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}
