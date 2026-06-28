import type {
  DrawingGrid,
  DrawingWorkplane,
  GreaseLayer,
  GreaseMaterial,
  LayerId,
  MaterialId,
  OnionSkinSettings,
  WorkplaneId,
} from '../document'
import { LayerSection } from './sidebar/LayerSection'
import { MaterialSection } from './sidebar/MaterialSection'
import { OnionSkinSection } from './sidebar/OnionSkinSection'
import { WorkplaneSection } from './sidebar/WorkplaneSection'
import type { DocumentUpdater } from './useDocumentSession'

type AppSidebarProps = {
  activeLayerId: LayerId
  activeMaterial: GreaseMaterial
  activeMaterialId: MaterialId
  activeWorkplaneId: WorkplaneId
  canMoveLayerTowardBottom: (layerId: LayerId) => boolean
  canMoveLayerTowardTop: (layerId: LayerId) => boolean
  countVisibleStrokes: (layerId: LayerId) => number
  layersTopFirst: readonly GreaseLayer[]
  materials: readonly GreaseMaterial[]
  onionSkin: OnionSkinSettings
  updateDocument: DocumentUpdater
  workplane: DrawingWorkplane
  workplanes: readonly DrawingGrid[]
}

export function AppSidebar(props: AppSidebarProps) {
  return (
    <aside class="layer-panel">
      <WorkplaneSection
        activeWorkplaneId={props.activeWorkplaneId}
        workplane={props.workplane}
        workplanes={props.workplanes}
        updateDocument={props.updateDocument}
      />

      <OnionSkinSection
        onionSkin={props.onionSkin}
        updateDocument={props.updateDocument}
      />

      <MaterialSection
        activeMaterial={props.activeMaterial}
        activeMaterialId={props.activeMaterialId}
        materials={props.materials}
        updateDocument={props.updateDocument}
      />

      <LayerSection
        activeLayerId={props.activeLayerId}
        layersTopFirst={props.layersTopFirst}
        canMoveLayerTowardTop={props.canMoveLayerTowardTop}
        canMoveLayerTowardBottom={props.canMoveLayerTowardBottom}
        countVisibleStrokes={props.countVisibleStrokes}
        updateDocument={props.updateDocument}
      />
    </aside>
  )
}
