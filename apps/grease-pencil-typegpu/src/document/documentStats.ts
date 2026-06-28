import type {
  GreaseDocument,
  LayerId,
} from './model'
import { getLayerDrawingAtFrame } from './layerFrameSelectors'

export function countDocumentStrokes(document: GreaseDocument) {
  return document.drawings.reduce(
    (total, drawing) => total + drawing.strokes.length,
    0,
  )
}

export function countDocumentPoints(document: GreaseDocument) {
  return document.drawings.reduce(
    (total, drawing) =>
      total +
      drawing.strokes.reduce(
        (strokeTotal, stroke) => strokeTotal + stroke.points.length,
        0,
      ),
    0,
  )
}

export function countLayerVisibleStrokes(
  document: GreaseDocument,
  layerId: LayerId,
) {
  return getLayerDrawingAtFrame(document, layerId)?.strokes.length ?? 0
}
