import type { Vec3 } from '../shared/vector'
import {
  isFiniteVec3,
  lengthSquared3,
} from './geometry'
import type {
  GreaseDocument,
  Stroke,
  StrokeId,
  StrokePointKey,
} from './model'
import {
  getActiveLayer,
  getLayerDrawingAtFrame,
} from './layerFrameSelectors'
import {
  deleteStrokePoints,
  translateStroke,
  translateStrokePoints,
} from './strokeTransforms'
import { replaceDrawing } from './documentReplace'

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
  if (strokeIds.size === 0 || !canApplyDelta(delta)) return document

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
  if (pointKeys.size === 0 || !canApplyDelta(delta)) return document

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
    const result = deleteStrokePoints(stroke, pointKeys)
    if (result.changed) changed = true
    if (result.stroke) nextStrokes.push(result.stroke)
  }

  if (!changed) return document

  return replaceDrawing(document, drawing.id, {
    ...drawing,
    strokes: nextStrokes,
  })
}

function canApplyDelta(delta: Vec3) {
  return isFiniteVec3(delta) && lengthSquared3(delta) >= 1e-12
}
