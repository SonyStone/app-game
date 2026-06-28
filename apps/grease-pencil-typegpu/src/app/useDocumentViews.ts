import {
  createMemo,
  type Accessor,
} from 'solid-js'
import {
  countDocumentPoints,
  countDocumentStrokes,
  countLayerVisibleStrokes,
  getActiveLayer,
  getActiveMaterial,
  getLayerDrawingAtFrame,
  getRenderLayers,
  type GreaseDocument,
  type LayerId,
} from '../document'

type DocumentViewsParams = {
  documentState: Accessor<GreaseDocument>
}

export function useDocumentViews(params: DocumentViewsParams) {
  const activeLayer = createMemo(() => getActiveLayer(params.documentState()))
  const activeDrawing = createMemo(() => {
    const layer = activeLayer()
    if (!layer) return undefined
    return getLayerDrawingAtFrame(params.documentState(), layer.id)
  })
  const renderLayers = createMemo(() => getRenderLayers(params.documentState()))
  const workplane = createMemo(() => params.documentState().workplane)
  const onionSkin = createMemo(() => params.documentState().onionSkin)
  const activeMaterial = createMemo(() => getActiveMaterial(params.documentState()))
  const materials = createMemo(() => params.documentState().materials)
  const layersTopFirst = createMemo(() => [...params.documentState().layers].reverse())
  const strokeCount = createMemo(() => countDocumentStrokes(params.documentState()))
  const pointCount = createMemo(() => countDocumentPoints(params.documentState()))

  const canMoveLayerTowardTop = (layerId: LayerId) => {
    const document = params.documentState()
    const layerIndex = document.layers.findIndex((layer) => layer.id === layerId)
    return layerIndex >= 0 && layerIndex < document.layers.length - 1
  }

  const canMoveLayerTowardBottom = (layerId: LayerId) => {
    return params.documentState().layers.findIndex((layer) => layer.id === layerId) > 0
  }

  const countVisibleStrokes = (layerId: LayerId) => {
    return countLayerVisibleStrokes(params.documentState(), layerId)
  }

  return {
    activeDrawing,
    activeLayer,
    activeMaterial,
    canMoveLayerTowardBottom,
    canMoveLayerTowardTop,
    countVisibleStrokes,
    layersTopFirst,
    materials,
    onionSkin,
    pointCount,
    renderLayers,
    strokeCount,
    workplane,
  } as const
}
