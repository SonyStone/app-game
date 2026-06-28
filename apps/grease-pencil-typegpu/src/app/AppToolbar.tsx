import {
  clearActiveDrawing,
  deleteActiveFrame,
  duplicateHeldFrame,
  insertBlankFrame,
  setActiveMaterialStrokeColor,
  setActiveMaterialStrokeRadius,
  setCurrentFrame,
  undoActiveDrawing,
  type GreaseMaterial,
} from '../document'
import { BrushControls } from '../features/brush/BrushControls'
import { StrokeColorStrip } from '../features/brush/StrokeColorStrip'
import { EditCommandBar } from '../features/editing/EditCommandBar'
import { FrameControls } from '../features/timeline/FrameControls'
import { ToolModeBar } from '../features/tools/ToolModeBar'
import type { ToolMode } from '../shared/toolMode'
import type { DocumentUpdater } from './useDocumentSession'

type AppToolbarProps = {
  activeMaterial: GreaseMaterial
  brushStrength: number
  canDeleteSelection: boolean
  currentFrame: number
  eraserRadius: number
  mode: ToolMode
  onDeleteSelection: () => void
  onSetBrushStrength: (brushStrength: number) => void
  onSetEraserRadius: (eraserRadius: number) => void
  onSetMode: (mode: ToolMode) => void
  updateDocument: DocumentUpdater
}

export function AppToolbar(props: AppToolbarProps) {
  return (
    <header class="app-toolbar">
      <ToolModeBar mode={props.mode} onSetMode={props.onSetMode} />

      <StrokeColorStrip
        activeStrokeColor={props.activeMaterial.strokeColor}
        onSetStrokeColor={(strokeColor) =>
          props.updateDocument((currentDocument) =>
            setActiveMaterialStrokeColor(currentDocument, strokeColor),
          )
        }
      />

      <BrushControls
        strokeRadius={props.activeMaterial.strokeRadius}
        brushStrength={props.brushStrength}
        eraserRadius={props.eraserRadius}
        onSetStrokeRadius={(strokeRadius) =>
          props.updateDocument((currentDocument) =>
            setActiveMaterialStrokeRadius(currentDocument, strokeRadius),
          )
        }
        onSetBrushStrength={props.onSetBrushStrength}
        onSetEraserRadius={props.onSetEraserRadius}
      />

      <FrameControls
        currentFrame={props.currentFrame}
        onSetCurrentFrame={(frameNumber) =>
          props.updateDocument((currentDocument) =>
            setCurrentFrame(currentDocument, frameNumber),
          )
        }
        onPreviousFrame={() =>
          props.updateDocument((currentDocument) =>
            setCurrentFrame(currentDocument, currentDocument.currentFrame - 1),
          )
        }
        onNextFrame={() =>
          props.updateDocument((currentDocument) =>
            setCurrentFrame(currentDocument, currentDocument.currentFrame + 1),
          )
        }
        onInsertBlankFrame={() => props.updateDocument(insertBlankFrame)}
        onDuplicateHeldFrame={() => props.updateDocument(duplicateHeldFrame)}
        onDeleteActiveFrame={() => props.updateDocument(deleteActiveFrame)}
      />

      <EditCommandBar
        canDeleteSelection={props.canDeleteSelection}
        onDeleteSelection={props.onDeleteSelection}
        onUndo={() => props.updateDocument(undoActiveDrawing)}
        onClear={() => props.updateDocument(clearActiveDrawing)}
      />
    </header>
  )
}
