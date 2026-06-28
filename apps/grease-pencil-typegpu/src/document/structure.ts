import { copyVec3, copyVec4 } from './geometry'
import { createDrawingId, createFrameId, createLayerId, createStrokeId } from './ids'
import { getDrawingById, getLayerExactFrame } from './selectors'
import type {
  Drawing,
  DrawingId,
  GreaseDocument,
  GreaseLayer,
  LayerFrame,
  LayerId,
  Stroke,
  StrokePoint,
} from './model'

export const DEFAULT_FRAME_NUMBER = 1

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

export function replaceLayer(
  document: GreaseDocument,
  layerId: LayerId,
  updater: (layer: GreaseLayer) => GreaseLayer,
): GreaseDocument {
  return {
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === layerId ? updater(layer) : layer,
    ),
  }
}

export function replaceDrawing(
  document: GreaseDocument,
  drawingId: DrawingId,
  nextDrawing: Drawing,
): GreaseDocument {
  return {
    ...document,
    drawings: document.drawings.map((drawing) =>
      drawing.id === drawingId ? nextDrawing : drawing,
    ),
  }
}

export function pruneUnusedDrawings(document: GreaseDocument): GreaseDocument {
  const usedDrawingIds = new Set<DrawingId>()
  for (const layer of document.layers) {
    for (const frame of layer.frames) {
      usedDrawingIds.add(frame.drawingId)
    }
  }

  return {
    ...document,
    drawings: document.drawings.filter((drawing) => usedDrawingIds.has(drawing.id)),
  }
}

export function swapLayers(
  layers: readonly GreaseLayer[],
  firstIndex: number,
  secondIndex: number,
) {
  const firstLayer = layers[firstIndex]
  const secondLayer = layers[secondIndex]
  if (!firstLayer || !secondLayer) return [...layers]

  const nextLayers = [...layers]
  nextLayers[firstIndex] = secondLayer
  nextLayers[secondIndex] = firstLayer
  return nextLayers
}

export function sortFrames(frames: readonly LayerFrame[]) {
  return [...frames].sort((a, b) => a.frameNumber - b.frameNumber)
}

export function copyDrawingWithNewId(drawing: Drawing): Drawing {
  return {
    id: createDrawingId(),
    strokes: drawing.strokes.map(copyStroke),
  }
}

export function sanitizeFrameNumber(frameNumber: number) {
  if (!Number.isFinite(frameNumber)) return DEFAULT_FRAME_NUMBER
  return Math.max(1, Math.round(frameNumber))
}

export function copyStroke(stroke: Stroke): Stroke {
  return {
    id: createStrokeId(),
    materialId: stroke.materialId,
    color: copyVec4(stroke.color),
    radius: stroke.radius,
    closed: stroke.closed,
    points: stroke.points.map(copyStrokePoint),
  }
}

function copyStrokePoint(point: StrokePoint): StrokePoint {
  return {
    ...point,
    position: copyVec3(point.position),
    vertexColor: copyVec4(point.vertexColor),
  }
}
