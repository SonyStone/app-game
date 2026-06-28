import {
  addLayer,
  moveLayerTowardBottom,
  moveLayerTowardTop,
  removeLayer,
  setActiveLayer,
  setLayerOpacity,
  toggleLayerLock,
  toggleLayerVisibility,
  type GreaseLayer,
  type LayerId,
} from '../../document'
import { LayerPanel } from '../../features/layers/LayerPanel'
import type { DocumentUpdater } from '../useDocumentSession'

type LayerSectionProps = {
  activeLayerId: LayerId
  canMoveLayerTowardBottom: (layerId: LayerId) => boolean
  canMoveLayerTowardTop: (layerId: LayerId) => boolean
  countVisibleStrokes: (layerId: LayerId) => number
  layersTopFirst: readonly GreaseLayer[]
  updateDocument: DocumentUpdater
}

export function LayerSection(props: LayerSectionProps) {
  return (
    <LayerPanel
      activeLayerId={props.activeLayerId}
      layersTopFirst={props.layersTopFirst}
      canMoveLayerTowardTop={props.canMoveLayerTowardTop}
      canMoveLayerTowardBottom={props.canMoveLayerTowardBottom}
      countVisibleStrokes={props.countVisibleStrokes}
      onAddLayer={() => props.updateDocument(addLayer)}
      onSelectLayer={(layerId) =>
        props.updateDocument((currentDocument) =>
          setActiveLayer(currentDocument, layerId),
        )
      }
      onMoveLayerTowardTop={(layerId) =>
        props.updateDocument((currentDocument) =>
          moveLayerTowardTop(currentDocument, layerId),
        )
      }
      onMoveLayerTowardBottom={(layerId) =>
        props.updateDocument((currentDocument) =>
          moveLayerTowardBottom(currentDocument, layerId),
        )
      }
      onToggleVisibility={(layerId) =>
        props.updateDocument((currentDocument) =>
          toggleLayerVisibility(currentDocument, layerId),
        )
      }
      onToggleLock={(layerId) =>
        props.updateDocument((currentDocument) =>
          toggleLayerLock(currentDocument, layerId),
        )
      }
      onRemoveLayer={(layerId) =>
        props.updateDocument((currentDocument) =>
          removeLayer(currentDocument, layerId),
        )
      }
      onSetLayerOpacity={(layerId, opacity) =>
        props.updateDocument((currentDocument) =>
          setLayerOpacity(currentDocument, layerId, opacity),
        )
      }
    />
  )
}
