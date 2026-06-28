import type {
  DrawingWorkplane,
  GreaseLayer,
  GreaseMaterial,
  LayerId,
  MaterialId,
  OnionSkinSettings,
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
  canMoveLayerTowardBottom: (layerId: LayerId) => boolean
  canMoveLayerTowardTop: (layerId: LayerId) => boolean
  countVisibleStrokes: (layerId: LayerId) => number
  layersTopFirst: readonly GreaseLayer[]
  materials: readonly GreaseMaterial[]
  onionSkin: OnionSkinSettings
  updateDocument: DocumentUpdater
  workplane: DrawingWorkplane
}

export function AppSidebar(props: AppSidebarProps) {
  return (
    <aside class="layer-panel">
      <WorkplaneSection
        workplane={props.workplane}
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
