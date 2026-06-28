import {
  setActiveMaterial,
  setActiveMaterialCapStyle,
  setActiveMaterialFillColor,
  setActiveMaterialFillStyle,
  setActiveMaterialGradientType,
  setActiveMaterialJoinStyle,
  setActiveMaterialMixColor,
  setActiveMaterialStrokeMode,
  setActiveMaterialUseFill,
  setActiveMaterialUseStroke,
  type GreaseMaterial,
  type MaterialId,
} from '../../document'
import { MaterialPanel } from '../../features/materials/MaterialPanel'
import type { DocumentUpdater } from '../useDocumentSession'

type MaterialSectionProps = {
  activeMaterial: GreaseMaterial
  activeMaterialId: MaterialId
  materials: readonly GreaseMaterial[]
  updateDocument: DocumentUpdater
}

export function MaterialSection(props: MaterialSectionProps) {
  return (
    <MaterialPanel
      activeMaterial={props.activeMaterial}
      activeMaterialId={props.activeMaterialId}
      materials={props.materials}
      onSelectMaterial={(materialId) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterial(currentDocument, materialId),
        )
      }
      onSetUseStroke={(useStroke) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialUseStroke(currentDocument, useStroke),
        )
      }
      onSetUseFill={(useFill) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialUseFill(currentDocument, useFill),
        )
      }
      onSetStrokeMode={(strokeMode) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialStrokeMode(currentDocument, strokeMode),
        )
      }
      onSetCapStyle={(capStyle) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialCapStyle(currentDocument, capStyle),
        )
      }
      onSetJoinStyle={(joinStyle) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialJoinStyle(currentDocument, joinStyle),
        )
      }
      onSetFillStyle={(fillStyle) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialFillStyle(currentDocument, fillStyle),
        )
      }
      onSetGradientType={(gradientType) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialGradientType(currentDocument, gradientType),
        )
      }
      onSetFillColor={(fillColor) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialFillColor(currentDocument, fillColor),
        )
      }
      onSetMixColor={(mixColor) =>
        props.updateDocument((currentDocument) =>
          setActiveMaterialMixColor(currentDocument, mixColor),
        )
      }
    />
  )
}
