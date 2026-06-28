import {
  addWorkplane,
  removeActiveWorkplane,
  resetWorkplane,
  setActiveWorkplane,
  setWorkplaneOrigin,
  setWorkplaneRotation,
  setWorkplaneScale,
  type DrawingGrid,
  type DrawingWorkplane,
  type WorkplaneId,
} from '../../document'
import { WorkplanePanel } from '../../features/workplane/WorkplanePanel'
import type { DocumentUpdater } from '../useDocumentSession'

type WorkplaneSectionProps = {
  activeWorkplaneId: WorkplaneId
  updateDocument: DocumentUpdater
  workplane: DrawingWorkplane
  workplanes: readonly DrawingGrid[]
}

export function WorkplaneSection(props: WorkplaneSectionProps) {
  return (
    <WorkplanePanel
      activeWorkplaneId={props.activeWorkplaneId}
      workplane={props.workplane}
      workplanes={props.workplanes}
      onAddWorkplane={() => props.updateDocument(addWorkplane)}
      onRemoveActiveWorkplane={() => props.updateDocument(removeActiveWorkplane)}
      onReset={() => props.updateDocument(resetWorkplane)}
      onSetActiveWorkplane={(workplaneId) =>
        props.updateDocument((currentDocument) =>
          setActiveWorkplane(currentDocument, workplaneId),
        )
      }
      onSetOrigin={(axis, value) =>
        props.updateDocument((currentDocument) =>
          setWorkplaneOrigin(currentDocument, axis, value),
        )
      }
      onSetRotation={(axis, value) =>
        props.updateDocument((currentDocument) =>
          setWorkplaneRotation(currentDocument, axis, value),
        )
      }
      onSetScale={(value) =>
        props.updateDocument((currentDocument) =>
          setWorkplaneScale(currentDocument, value),
        )
      }
    />
  )
}
