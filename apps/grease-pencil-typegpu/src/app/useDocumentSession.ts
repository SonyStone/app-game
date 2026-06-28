import {
  createSignal,
  type Accessor,
} from 'solid-js'
import {
  type GreaseDocument,
  type Stroke,
} from '../document'
import type { ToolMode } from '../shared/toolMode'
import { useDocumentSelection } from './useDocumentSelection'
import { useDocumentViews } from './useDocumentViews'
import { useStoredDocument } from './useStoredDocument'

export type DocumentUpdater = (
  updater: (document: GreaseDocument) => GreaseDocument,
) => void

export function useDocumentSession(mode: Accessor<ToolMode>) {
  const { documentState, setDocumentState } = useStoredDocument()
  const [draftStroke, setDraftStroke] = createSignal<Stroke>()
  const views = useDocumentViews({ documentState })
  const selection = useDocumentSelection({
    activeDrawing: views.activeDrawing,
    mode,
  })

  const updateDocument: DocumentUpdater = (updater) => {
    setDraftStroke(undefined)
    setDocumentState(updater)
  }

  return {
    activeDrawing: views.activeDrawing,
    activeLayer: views.activeLayer,
    activeMaterial: views.activeMaterial,
    activeWorkplaneId: views.activeWorkplaneId,
    canMoveLayerTowardBottom: views.canMoveLayerTowardBottom,
    canMoveLayerTowardTop: views.canMoveLayerTowardTop,
    countVisibleStrokes: views.countVisibleStrokes,
    documentState,
    draftStroke,
    layersTopFirst: views.layersTopFirst,
    materials: views.materials,
    onionSkin: views.onionSkin,
    pointCount: views.pointCount,
    pointOverlays: selection.pointOverlays,
    renderLayers: views.renderLayers,
    selectedPointCount: selection.selectedPointCount,
    selectedPointKeys: selection.selectedPointKeys,
    selectedStrokeCount: selection.selectedStrokeCount,
    selectedStrokeIds: selection.selectedStrokeIds,
    setDocumentState,
    setDraftStroke,
    setSelectedPointKeys: selection.setSelectedPointKeys,
    setSelectedStrokeIds: selection.setSelectedStrokeIds,
    strokeCount: views.strokeCount,
    updateDocument,
    workplane: views.workplane,
    workplanes: views.workplanes,
  } as const
}
