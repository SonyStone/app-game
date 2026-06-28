import type {
  Drawing,
  DrawingId,
  GreaseDocument,
  GreaseLayer,
  LayerFrame,
  LayerId,
} from './model'

export function getActiveLayer(document: GreaseDocument): GreaseLayer | undefined {
  return document.layers.find((layer) => layer.id === document.activeLayerId)
}

export function getDrawingById(
  document: GreaseDocument,
  drawingId: DrawingId,
): Drawing | undefined {
  return document.drawings.find((drawing) => drawing.id === drawingId)
}

export function getLayerFrameAt(
  layer: GreaseLayer,
  frameNumber: number,
): LayerFrame | undefined {
  let bestFrame: LayerFrame | undefined

  for (const frame of layer.frames) {
    if (frame.frameNumber > frameNumber) continue
    if (!bestFrame || frame.frameNumber > bestFrame.frameNumber) {
      bestFrame = frame
    }
  }

  return bestFrame
}

export function getLayerExactFrame(
  layer: GreaseLayer,
  frameNumber: number,
): LayerFrame | undefined {
  return layer.frames.find((frame) => frame.frameNumber === frameNumber)
}

export function getLayerDrawingAtFrame(
  document: GreaseDocument,
  layerId: LayerId,
  frameNumber = document.currentFrame,
): Drawing | undefined {
  const layer = document.layers.find((item) => item.id === layerId)
  if (!layer) return undefined

  const frame = getLayerFrameAt(layer, frameNumber)
  if (!frame) return undefined

  return getDrawingById(document, frame.drawingId)
}
