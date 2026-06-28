import type {
  GreaseDocument,
  RenderLayer,
} from './model'
import { getLayerDrawingAtFrame } from './layerFrameSelectors'
import { getOnionSkinRenderLayers } from './onionSkinRenderLayers'

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
