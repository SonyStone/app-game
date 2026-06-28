import {
  resetWorkplane,
  setWorkplaneOrigin,
  setWorkplaneRotation,
  setWorkplaneScale,
  type DrawingWorkplane,
} from '../../document'
import { WorkplanePanel } from '../../features/workplane/WorkplanePanel'
import type { DocumentUpdater } from '../useDocumentSession'

type WorkplaneSectionProps = {
  updateDocument: DocumentUpdater
  workplane: DrawingWorkplane
}

export function WorkplaneSection(props: WorkplaneSectionProps) {
  return (
    <WorkplanePanel
      workplane={props.workplane}
      onReset={() => props.updateDocument(resetWorkplane)}
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
