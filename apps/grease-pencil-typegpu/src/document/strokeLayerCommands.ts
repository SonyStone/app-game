import type {
  GreaseDocument,
  LayerId,
  Stroke,
} from './model'
import {
  getActiveLayer,
  getLayerDrawingAtFrame,
} from './layerFrameSelectors'
import { replaceDrawing } from './documentReplace'
import { ensureLayerFrame } from './layerFrameMutations'
import { copyStroke } from './strokeClone'

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
