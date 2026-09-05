import { Show } from 'solid-js';
import type {
  DrawingGrid,
  DrawingWorkplane,
  GreaseLayer,
  GreaseMaterial,
  LayerId,
  MaterialId,
  OnionSkinSettings,
  WorkplaneId
} from '../document';
import { deleteActiveFrame, duplicateHeldFrame, insertBlankFrame, setCurrentFrame } from '../document';
import { FrameControls } from '../features/timeline/FrameControls';
import { SketchIcon } from '../shared/SketchIcon';
import { sketchPanels, type SketchPanel } from '../shared/sketchPanel';
import { LayerSection } from './sidebar/LayerSection';
import { MaterialSection } from './sidebar/MaterialSection';
import { OnionSkinSection } from './sidebar/OnionSkinSection';
import { WorkplaneSection } from './sidebar/WorkplaneSection';
import type { DocumentUpdater } from './useDocumentSession';

type AppSidebarProps = {
  panel: SketchPanel | undefined;
  currentFrame: number;
  onClose: () => void;
  activeLayerId: LayerId;
  activeMaterial: GreaseMaterial;
  activeMaterialId: MaterialId;
  activeWorkplaneId: WorkplaneId;
  canMoveLayerTowardBottom: (layerId: LayerId) => boolean;
  canMoveLayerTowardTop: (layerId: LayerId) => boolean;
  countVisibleStrokes: (layerId: LayerId) => number;
  layersTopFirst: readonly GreaseLayer[];
  materials: readonly GreaseMaterial[];
  onionSkin: OnionSkinSettings;
  updateDocument: DocumentUpdater;
  workplane: DrawingWorkplane;
  workplanes: readonly DrawingGrid[];
};

/** A single scrollable inspector, presented as a bottom sheet on phones. */
export function AppSidebar(props: AppSidebarProps) {
  return (
    <Show when={props.panel}>
      <aside
        class="layer-panel"
        id="sketch-inspector"
        aria-label={`${sketchPanels.find((panel) => panel.id === props.panel)?.label} settings`}
      >
        <div class="inspector-heading">
          <div>
            <h2>{sketchPanels.find((panel) => panel.id === props.panel)?.label}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="Close panel" onClick={props.onClose}>
            <SketchIcon name="close" />
          </button>
        </div>
        <div class="inspector-content">
          <Show when={props.panel === 'layers'}>
            <LayerSection
              activeLayerId={props.activeLayerId}
              layersTopFirst={props.layersTopFirst}
              canMoveLayerTowardTop={props.canMoveLayerTowardTop}
              canMoveLayerTowardBottom={props.canMoveLayerTowardBottom}
              countVisibleStrokes={props.countVisibleStrokes}
              updateDocument={props.updateDocument}
            />
            <p class="inspector-note">Draw on the selected layer. Use opacity to build up your sketch.</p>
          </Show>
          <Show when={props.panel === 'brush'}>
            <MaterialSection
              activeMaterial={props.activeMaterial}
              activeMaterialId={props.activeMaterialId}
              materials={props.materials}
              updateDocument={props.updateDocument}
            />
          </Show>
          <Show when={props.panel === 'scene'}>
            <WorkplaneSection
              activeWorkplaneId={props.activeWorkplaneId}
              workplane={props.workplane}
              workplanes={props.workplanes}
              updateDocument={props.updateDocument}
            />
            <p class="inspector-note">Each grid is a drawing plane in 3D space. Paper view faces the selected grid.</p>
          </Show>
          <Show when={props.panel === 'animation'}>
            <div class="panel-header">Drawing frames</div>
            <FrameControls
              currentFrame={props.currentFrame}
              onSetCurrentFrame={(frame) => props.updateDocument((document) => setCurrentFrame(document, frame))}
              onPreviousFrame={() =>
                props.updateDocument((document) => setCurrentFrame(document, document.currentFrame - 1))
              }
              onNextFrame={() =>
                props.updateDocument((document) => setCurrentFrame(document, document.currentFrame + 1))
              }
              onInsertBlankFrame={() => props.updateDocument(insertBlankFrame)}
              onDuplicateHeldFrame={() => props.updateDocument(duplicateHeldFrame)}
              onDeleteActiveFrame={() => props.updateDocument(deleteActiveFrame)}
            />
            <OnionSkinSection onionSkin={props.onionSkin} updateDocument={props.updateDocument} />
            <p class="inspector-note">Onion skin shows nearby frames as a guide while you draw.</p>
          </Show>
        </div>
      </aside>
    </Show>
  );
}
