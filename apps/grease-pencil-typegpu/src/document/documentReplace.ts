import type {
  Drawing,
  DrawingId,
  GreaseDocument,
  GreaseLayer,
  LayerId,
} from './model'

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
