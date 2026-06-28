import type {
  Drawing,
  DrawingId,
  GreaseDocument,
  GreaseLayer,
  LayerFrame,
  LayerId,
  OnionSkinSettings,
  RenderLayer,
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

export function getRenderLayers(document: GreaseDocument): RenderLayer[] {
  const layers: RenderLayer[] = []
  if (document.onionSkin.enabled) {
    layers.push(...getOnionSkinRenderLayers(document))
  }

  document.layers.forEach((layer, layerIndex) => {
    if (!layer.visible) return

    const drawing = getLayerDrawingAtFrame(document, layer.id)
    if (!drawing || drawing.strokes.length === 0) return

    layers.push({
      id: layer.id,
      opacity: layer.opacity,
      strokes: drawing.strokes,
      zOffset: 0.001 + layerIndex * 0.001,
      materials: document.materials,
    })
  })

  return layers
}

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

function getOnionSkinRenderLayers(document: GreaseDocument): RenderLayer[] {
  const onionLayers: RenderLayer[] = []
  const settings = document.onionSkin

  document.layers.forEach((layer, layerIndex) => {
    if (!layer.visible) return

    const currentFrame = getLayerFrameAt(layer, document.currentFrame)
    const previousFrames = getNeighborFrames(
      layer,
      document.currentFrame,
      'previous',
      settings.previousFrames,
    )
    const nextFrames = getNeighborFrames(
      layer,
      document.currentFrame,
      'next',
      settings.nextFrames,
    )

    previousFrames.forEach((frame, frameIndex) => {
      if (frame.drawingId === currentFrame?.drawingId) return

      const drawing = getDrawingById(document, frame.drawingId)
      if (!drawing || drawing.strokes.length === 0) return

      onionLayers.push({
        id: layer.id,
        opacity: onionOpacity(settings, frameIndex),
        strokes: drawing.strokes,
        zOffset: -0.026 - layerIndex * 0.002 - frameIndex * 0.003,
        tintColor: settings.previousColor,
        materials: document.materials,
      })
    })

    nextFrames.forEach((frame, frameIndex) => {
      if (frame.drawingId === currentFrame?.drawingId) return

      const drawing = getDrawingById(document, frame.drawingId)
      if (!drawing || drawing.strokes.length === 0) return

      onionLayers.push({
        id: layer.id,
        opacity: onionOpacity(settings, frameIndex),
        strokes: drawing.strokes,
        zOffset: -0.017 - layerIndex * 0.002 - frameIndex * 0.003,
        tintColor: settings.nextColor,
        materials: document.materials,
      })
    })
  })

  return onionLayers
}

function getNeighborFrames(
  layer: GreaseLayer,
  frameNumber: number,
  direction: 'previous' | 'next',
  count: number,
) {
  if (count <= 0) return []

  const frames = sortFrames(layer.frames)
  if (direction === 'previous') {
    return frames
      .filter((frame) => frame.frameNumber < frameNumber)
      .slice(-count)
      .reverse()
  }

  return frames
    .filter((frame) => frame.frameNumber > frameNumber)
    .slice(0, count)
}

function onionOpacity(settings: OnionSkinSettings, frameIndex: number) {
  return settings.opacity * Math.max(0.3, 1 - frameIndex * 0.28)
}

function sortFrames(frames: readonly LayerFrame[]) {
  return [...frames].sort((a, b) => a.frameNumber - b.frameNumber)
}
