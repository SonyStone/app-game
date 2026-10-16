import { createSignal, flush, For, onSettled } from 'solid-js';
import { LayersPanel } from '../../features/layers';
import { createStudio } from '../../mockups/puck-gallery/kit/createStudio';
import { createSolo, Mixer } from '../../mockups/puck-gallery/variants/pads/Mixer';
import { LayersPanel as DesktopLayersPanel } from '../../variants/desktop/LayersPanel';
import { LayersPopover } from '../../variants/procreate/LayersPopover';
import { LayersCard } from '../../variants/puck/LayersCard';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, PuckFrame, puckBoxes } from '../frames';
import { ProcreateFrame } from '../ProcreateFrame';
import { fourLayers, SeededLayers, type LayerSeed } from '../seededLayers';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Layers panels: each panel on the same four layers (one hidden, one with locked transparency, one clipped to the
 * layer below), then Studio's panel with one, four and many layers. Studio's panel edits a real paint-core document
 * kept in memory, so that its commands behave as in Paint, apart from merging, which needs the engine's pixels.
 */
export function LayersPanels() {
  return (
    <CanvasGroup
      id="layers"
      title="Layers"
      omitted={
        <>
          Not here: groups and masks, which Paint's document does not have (clipping is the nearest); an empty panel,
          as a drawing always keeps one layer; layer thumbnails, which the engine does not report. The Pads mixer
          keeps the Puck gallery's own still life, as its thumbnails draw from it.
        </>
      }
    >
      <CanvasRow title="Panels" note="the same four layers">
        <Specimen id="layers/panels/studio" label="Studio">
          <StudioLayers layers={fourLayers} />
        </Specimen>
        <Specimen id="layers/panels/procreate" label="Procreate">
          <ProcreateFrame width={procreateLayersWidth} label="Layers">
            <SeededLayers layers={fourLayers}>
              {(layers) => <LayersPopover state={layers.state()} ready onAction={layers.onAction} />}
            </SeededLayers>
          </ProcreateFrame>
        </Specimen>
        <Specimen id="layers/panels/puck" label="Puck">
          <PuckFrame boxes={[puckBoxes.layers]}>
            <SeededLayers layers={fourLayers}>
              {(layers) => (
                <LayersCard
                  box={puckBoxes.layers}
                  layers={layers.state().layers}
                  activeId={layers.state().activeId}
                  ready
                  onAction={layers.onAction}
                  done={() => {}}
                  onEscape={() => {}}
                />
              )}
            </SeededLayers>
          </PuckFrame>
        </Specimen>
        <Specimen id="layers/panels/desktop" label="Desktop">
          <DesktopFrame width={284}>
            <SeededLayers layers={fourLayers}>
              {(layers) => (
                <DesktopLayersPanel
                  layers={layers.state().layers}
                  activeId={layers.state().activeId}
                  ready
                  onAction={layers.onAction}
                />
              )}
            </SeededLayers>
          </DesktopFrame>
        </Specimen>
        <Specimen id="layers/panels/pads-mixer" label="Mixer (Puck gallery: Pads)">
          <PadsMixer />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Studio: how many layers">
        <For each={layerCounts}>
          {(count) => (
            <Specimen id={`layers/studio-count/${count.id}`} label={count.label}>
              <StudioLayers layers={count.layers} />
            </Specimen>
          )}
        </For>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Studio's layers panel in its panel frame, editing a document of `layers` (bottom first) of its own. */
function StudioLayers(props: { layers: readonly LayerSeed[] }) {
  return (
    <div class={styles.studioPanel}>
      <SeededLayers layers={props.layers}>
        {(layers) => (
          <LayersPanel
            state={layers.state()}
            ready
            onAction={layers.onAction}
            onLinearBlending={layers.onLinearBlending}
          />
        )}
      </SeededLayers>
    </div>
  );
}

/**
 * The Pads variant's layer mixer on a Puck gallery studio of its own, reduced to four layers like the others: the
 * hidden sketch and the locked paper stay.
 */
function PadsMixer() {
  const studio = createStudio();
  // The studio takes writes once the component has mounted, not while it is created. Deleting reads the selection,
  // so each selection settles first, outside the reactive scope, where `flush` may run.
  onSettled(() =>
    queueMicrotask(() => {
      for (const id of ['light', 'shade']) {
        studio.selectLayer(id);
        flush();
        studio.deleteLayer();
      }

      studio.selectLayer('ink');
    })
  );
  const solo = createSolo(studio);
  const [cursor, setCursor] = createSignal(false);

  return (
    <div class={styles.padsFrame}>
      <Mixer studio={studio} solo={solo} faderCursor={cursor()} onFader={() => setCursor(true)} />
    </div>
  );
}

/** The Procreate variant's Layers popover width. */
const procreateLayersWidth = 340;


const layerCounts = [
  { id: 'one', label: 'One layer', layers: [{ name: 'Layer 1' }] },
  { id: 'four', label: 'Four layers', layers: fourLayers },
  {
    id: 'many',
    label: 'Twenty-four layers (scrolls)',
    layers: Array.from({ length: 24 }, (_, index) => ({ name: `Layer ${index + 1}`, visible: index % 7 !== 3 }))
  }
] as const;
