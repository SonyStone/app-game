import { createDocument, type LayerAction, type LayerInfo } from '@app-game/paint-core/document';
import { createSignal, flush, For, onSettled, untrack } from 'solid-js';
import { LayersPanel } from '../../features/layers';
import { createStudio } from '../../mockups/puck-gallery/kit/createStudio';
import { createSolo, Mixer } from '../../mockups/puck-gallery/variants/pads/Mixer';
import styles from '../ComponentCanvas.module.css';
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
          as a drawing always keeps one layer; layer thumbnails, which the engine does not report. The Procreate
          variant's layers come with the UI variants. The Pads mixer keeps the Puck gallery's own still life, as its
          thumbnails draw from it.
        </>
      }
    >
      <CanvasRow title="Panels" note="the same four layers">
        <Specimen id="layers/panels/studio" label="Studio">
          <StudioLayers layers={fourLayers} />
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
  const drawing = seededDocument(untrack(() => props.layers));
  const [state, setState] = createSignal(drawing.state());
  const run = (change: () => void) => {
    try {
      change();
    } catch {
      // Merging needs the engine's pixels; the panel stays as it was.
    }

    setState(drawing.state());
  };

  return (
    <div class={styles.studioPanel}>
      <LayersPanel
        state={state()}
        ready
        onAction={(action: LayerAction) => run(() => drawing.changeLayer(action))}
        onLinearBlending={(linear) => run(() => drawing.setLinearBlending(linear))}
      />
    </div>
  );
}

/** A layer of the test data, bottom first, as a paint-core layer without its id. */
type LayerSeed = Pick<LayerInfo, 'name'> & Partial<Pick<LayerInfo, 'visible' | 'alphaLock' | 'clipping'>>;

/** A paint-core document holding `layers`, bottom first, with the top one selected. */
function seededDocument(layers: readonly LayerSeed[]) {
  const drawing = createDocument();
  for (const [index, seed] of layers.entries()) {
    if (index > 0) {
      drawing.changeLayer({ type: 'add' });
    }

    // The seed's properties only: an undefined `visible` would hide the layer.
    drawing.changeLayer({ type: 'update', id: drawing.state().activeId, patch: { ...seed } });
  }

  return drawing;
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

/** The four layers every panel shows, bottom first. */
const fourLayers: readonly LayerSeed[] = [
  { name: 'Flat colors' },
  { name: 'Shadows', clipping: true },
  { name: 'Ink', alphaLock: true },
  { name: 'Sketch', visible: false }
];

const layerCounts = [
  { id: 'one', label: 'One layer', layers: [{ name: 'Layer 1' }] },
  { id: 'four', label: 'Four layers', layers: fourLayers },
  {
    id: 'many',
    label: 'Twenty-four layers (scrolls)',
    layers: Array.from({ length: 24 }, (_, index) => ({ name: `Layer ${index + 1}`, visible: index % 7 !== 3 }))
  }
] as const;
