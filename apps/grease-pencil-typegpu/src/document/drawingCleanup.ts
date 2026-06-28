import type {
  DrawingId,
  GreaseDocument,
} from './model'

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
