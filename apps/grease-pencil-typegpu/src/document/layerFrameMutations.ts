import {
  getDrawingById,
  getLayerExactFrame,
} from './layerFrameSelectors'
import type {
  DrawingId,
  GreaseDocument,
  LayerFrame,
  LayerId,
} from './model'
import {
  createDrawing,
  createLayerFrame,
} from './documentFactories'
import { sortFrames } from './frameNumbers'
import { copyDrawingWithNewId } from './strokeClone'

export function ensureLayerFrame(
  document: GreaseDocument,
  layerId: LayerId,
  frameNumber: number,
  sourceDrawingId?: DrawingId,
): { document: GreaseDocument; frame: LayerFrame } {
  const layer = document.layers.find((item) => item.id === layerId)
  const existingFrame = layer ? getLayerExactFrame(layer, frameNumber) : undefined
  if (existingFrame) return { document, frame: existingFrame }

  const sourceDrawing = sourceDrawingId
    ? getDrawingById(document, sourceDrawingId)
    : undefined
  const drawing = sourceDrawing ? copyDrawingWithNewId(sourceDrawing) : createDrawing()
  const frame = createLayerFrame(frameNumber, drawing.id)

  return {
    document: {
      ...document,
      layers: document.layers.map((item) =>
        item.id === layerId
          ? { ...item, frames: sortFrames([...item.frames, frame]) }
          : item,
      ),
      drawings: [...document.drawings, drawing],
    },
    frame,
  }
}
