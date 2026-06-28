import type {
  GreaseDocument,
  GreaseLayer,
  LayerFrame,
  OnionSkinSettings,
  RenderLayer,
} from './model'
import {
  getDrawingById,
  getLayerFrameAt,
} from './layerFrameSelectors'

export function getOnionSkinRenderLayers(
  document: GreaseDocument,
): RenderLayer[] {
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

    appendTintedFrames(
      onionLayers,
      document,
      layer,
      layerIndex,
      previousFrames,
      currentFrame,
      settings,
      'previous',
    )
    appendTintedFrames(
      onionLayers,
      document,
      layer,
      layerIndex,
      nextFrames,
      currentFrame,
      settings,
      'next',
    )
  })

  return onionLayers
}

function appendTintedFrames(
  onionLayers: RenderLayer[],
  document: GreaseDocument,
  layer: GreaseLayer,
  layerIndex: number,
  frames: readonly LayerFrame[],
  currentFrame: LayerFrame | undefined,
  settings: OnionSkinSettings,
  direction: 'previous' | 'next',
) {
  frames.forEach((frame, frameIndex) => {
    if (frame.drawingId === currentFrame?.drawingId) return

    const drawing = getDrawingById(document, frame.drawingId)
    if (!drawing || drawing.strokes.length === 0) return

    onionLayers.push({
      id: layer.id,
      opacity: onionOpacity(settings, frameIndex),
      strokes: drawing.strokes,
      zOffset: onionZOffset(direction, layerIndex, frameIndex),
      tintColor: direction === 'previous'
        ? settings.previousColor
        : settings.nextColor,
      materials: document.materials,
    })
  })
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

function onionZOffset(
  direction: 'previous' | 'next',
  layerIndex: number,
  frameIndex: number,
) {
  const baseOffset = direction === 'previous' ? -0.026 : -0.017
  return baseOffset - layerIndex * 0.002 - frameIndex * 0.003
}

function sortFrames(frames: readonly LayerFrame[]) {
  return [...frames].sort((a, b) => a.frameNumber - b.frameNumber)
}
