import type { Vec3 } from '../shared/vector'
import { isFiniteVec3 } from './geometry'
import type {
  GreaseDocument,
  Stroke,
} from './model'
import {
  getActiveLayer,
  getLayerDrawingAtFrame,
} from './layerFrameSelectors'
import { eraseStrokeSegment } from './strokeEraser'
import { replaceDrawing } from './documentReplace'

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
