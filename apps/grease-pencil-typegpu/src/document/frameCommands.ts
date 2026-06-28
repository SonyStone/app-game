import type { GreaseDocument } from './model'
import {
  getActiveLayer,
  getLayerExactFrame,
  getLayerFrameAt,
} from './layerFrameSelectors'
import {
  createDrawing,
  createLayerFrame,
} from './documentFactories'
import { pruneUnusedDrawings } from './drawingCleanup'
import { sanitizeFrameNumber } from './frameNumbers'
import { ensureLayerFrame } from './layerFrameMutations'

export function setCurrentFrame(
  document: GreaseDocument,
  frameNumber: number,
): GreaseDocument {
  return {
    ...document,
    currentFrame: sanitizeFrameNumber(frameNumber),
  }
}

export function insertBlankFrame(document: GreaseDocument): GreaseDocument {
  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document
  if (getLayerExactFrame(activeLayer, document.currentFrame)) return document

  return ensureLayerFrame(document, activeLayer.id, document.currentFrame).document
}

export function duplicateHeldFrame(document: GreaseDocument): GreaseDocument {
  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document
  if (getLayerExactFrame(activeLayer, document.currentFrame)) return document

  const sourceFrame = getLayerFrameAt(activeLayer, document.currentFrame)
  if (!sourceFrame) return insertBlankFrame(document)

  return ensureLayerFrame(
    document,
    activeLayer.id,
    document.currentFrame,
    sourceFrame.drawingId,
  ).document
}

export function deleteActiveFrame(document: GreaseDocument): GreaseDocument {
  const activeLayer = getActiveLayer(document)
  if (!activeLayer || activeLayer.locked) return document

  const exactFrame = getLayerExactFrame(activeLayer, document.currentFrame)
  if (!exactFrame) return document

  const replacementDrawing =
    activeLayer.frames.length <= 1 ? createDrawing() : undefined

  const nextLayers = document.layers.map((layer) => {
    if (layer.id !== activeLayer.id) return layer

    const frames = layer.frames.filter((frame) => frame.id !== exactFrame.id)
    if (frames.length > 0) {
      return { ...layer, frames }
    }

    if (!replacementDrawing) return layer

    return {
      ...layer,
      frames: [createLayerFrame(document.currentFrame, replacementDrawing.id)],
    }
  })

  const nextDocument = {
    ...document,
    layers: nextLayers,
    drawings: replacementDrawing
      ? [...document.drawings, replacementDrawing]
      : document.drawings,
  }

  return pruneUnusedDrawings(nextDocument)
}
