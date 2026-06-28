import type { GreaseDocument, LayerId } from './model'
import {
  createDrawing,
  createLayer,
} from './documentFactories'
import { replaceLayer } from './documentReplace'
import { pruneUnusedDrawings } from './drawingCleanup'
import { swapLayers } from './layerOrder'

export function addLayer(document: GreaseDocument): GreaseDocument {
  const drawing = createDrawing()
  const layer = createLayer(
    `Layer ${document.layers.length + 1}`,
    document.currentFrame,
    drawing.id,
  )

  return {
    ...document,
    activeLayerId: layer.id,
    layers: [...document.layers, layer],
    drawings: [...document.drawings, drawing],
  }
}

export function removeLayer(
  document: GreaseDocument,
  layerId: LayerId,
): GreaseDocument {
  if (document.layers.length <= 1) return document

  const layers = document.layers.filter((layer) => layer.id !== layerId)
  const activeLayer =
    layers.find((layer) => layer.id === document.activeLayerId) ??
    layers[layers.length - 1]

  if (!activeLayer) return document

  return pruneUnusedDrawings({
    ...document,
    activeLayerId: activeLayer.id,
    layers,
  })
}

export function moveLayerTowardTop(
  document: GreaseDocument,
  layerId: LayerId,
): GreaseDocument {
  const layerIndex = document.layers.findIndex((layer) => layer.id === layerId)
  if (layerIndex < 0 || layerIndex >= document.layers.length - 1) return document

  return {
    ...document,
    layers: swapLayers(document.layers, layerIndex, layerIndex + 1),
  }
}

export function moveLayerTowardBottom(
  document: GreaseDocument,
  layerId: LayerId,
): GreaseDocument {
  const layerIndex = document.layers.findIndex((layer) => layer.id === layerId)
  if (layerIndex <= 0) return document

  return {
    ...document,
    layers: swapLayers(document.layers, layerIndex, layerIndex - 1),
  }
}

export function setActiveLayer(
  document: GreaseDocument,
  layerId: LayerId,
): GreaseDocument {
  if (!document.layers.some((layer) => layer.id === layerId)) return document
  return { ...document, activeLayerId: layerId }
}

export function toggleLayerVisibility(
  document: GreaseDocument,
  layerId: LayerId,
): GreaseDocument {
  return replaceLayer(document, layerId, (layer) => ({
    ...layer,
    visible: !layer.visible,
  }))
}

export function toggleLayerLock(
  document: GreaseDocument,
  layerId: LayerId,
): GreaseDocument {
  return replaceLayer(document, layerId, (layer) => ({
    ...layer,
    locked: !layer.locked,
  }))
}

export function setLayerOpacity(
  document: GreaseDocument,
  layerId: LayerId,
  opacity: number,
): GreaseDocument {
  return replaceLayer(document, layerId, (layer) => ({
    ...layer,
    opacity: clamp01(opacity),
  }))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}
