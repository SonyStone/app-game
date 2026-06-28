import {
  setOnionSkinEnabled,
  setOnionSkinNextFrames,
  setOnionSkinOpacity,
  setOnionSkinPreviousFrames,
  type OnionSkinSettings,
} from '../../document'
import { OnionSkinPanel } from '../../features/onionSkin/OnionSkinPanel'
import type { DocumentUpdater } from '../useDocumentSession'

type OnionSkinSectionProps = {
  onionSkin: OnionSkinSettings
  updateDocument: DocumentUpdater
}

export function OnionSkinSection(props: OnionSkinSectionProps) {
  return (
    <OnionSkinPanel
      onionSkin={props.onionSkin}
      onSetEnabled={(enabled) =>
        props.updateDocument((currentDocument) =>
          setOnionSkinEnabled(currentDocument, enabled),
        )
      }
      onSetPreviousFrames={(previousFrames) =>
        props.updateDocument((currentDocument) =>
          setOnionSkinPreviousFrames(currentDocument, previousFrames),
        )
      }
      onSetNextFrames={(nextFrames) =>
        props.updateDocument((currentDocument) =>
          setOnionSkinNextFrames(currentDocument, nextFrames),
        )
      }
      onSetOpacity={(opacity) =>
        props.updateDocument((currentDocument) =>
          setOnionSkinOpacity(currentDocument, opacity),
        )
      }
    />
  )
}
