import { createDrawingId, createFrameId, createLayerId } from './ids'
import type {
  Drawing,
  DrawingId,
  GreaseLayer,
  LayerFrame,
} from './model'
import { sanitizeFrameNumber } from './frameNumbers'

export function createLayer(
  name: string,
  frameNumber: number,
  drawingId: DrawingId,
): GreaseLayer {
  return {
    id: createLayerId(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    frames: [createLayerFrame(frameNumber, drawingId)],
  }
}

export function createDrawing(): Drawing {
  return {
    id: createDrawingId(),
    strokes: [],
  }
}

export function createLayerFrame(
  frameNumber: number,
  drawingId: DrawingId,
): LayerFrame {
  return {
    id: createFrameId(),
    frameNumber: sanitizeFrameNumber(frameNumber),
    drawingId,
    type: 'keyframe',
  }
}
