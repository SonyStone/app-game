import { createSignal, flush, For, onSettled, untrack } from 'solid-js';
import { LayersPanel } from '../../features/layers';
import { createStudio } from '../../mockups/puck-gallery/kit/createStudio';
import { createSolo, Mixer } from '../../mockups/puck-gallery/variants/pads/Mixer';
import { LayersPanel as DesktopLayersPanel } from '../../variants/desktop/LayersPanel';
import { LayerOptions } from '../../variants/infinite/LayerOptions';
import { LayerPanel as InfiniteLayerPanel } from '../../variants/infinite/LayerPanel';
import { LayersPopover } from '../../variants/procreate/LayersPopover';
import { LayersCard } from '../../variants/puck/LayersCard';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, InfiniteFrame, puckBoxes, PuckFrame } from '../frames';
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
          as a drawing always keeps one layer; the engine's layer thumbnails, as no engine runs here (the Infinite
          Painter panel shows drawn ones). The Pads mixer keeps the Puck gallery's own still life, as its thumbnails
          draw from it.
        </>
      }
    >
      <CanvasRow title="Panels" note="the same four layers">
        <Specimen id="layers/panels/studio" label="Studio" part="studio-layers">
          <StudioLayers layers={fourLayers} />
        </Specimen>
        <Specimen id="layers/panels/procreate" label="Procreate" part="procreate-layers">
          <ProcreateFrame width={procreateLayersWidth} label="Layers">
            <SeededLayers layers={fourLayers}>
              {(layers) => <LayersPopover state={layers.state()} ready onAction={layers.onAction} />}
            </SeededLayers>
          </ProcreateFrame>
        </Specimen>
        <Specimen id="layers/panels/puck" label="Puck" part="puck-layers">
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
        <Specimen id="layers/panels/desktop" label="Desktop" part="desktop-layers">
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

      <CanvasRow
        title="Infinite Painter"
        note="the same four layers, the shadows in Multiply at 59 %; thumbnails drawn for the canvas"
      >
        <Specimen id="layers/infinite/collapsed" label="Layer panel, collapsed">
          <InfiniteLayers expanded={false} />
        </Specimen>
        <Specimen id="layers/infinite/expanded" label="Layer panel, expanded">
          <InfiniteLayers expanded />
        </Specimen>
        <Specimen id="layers/infinite/options" label="Layer options">
          <InfiniteFrame>
            <SeededLayers layers={fourLayers}>
              {(layers) => (
                <LayerOptions
                  layer={withBadges(layers.state().layers)[1]!}
                  bottom={false}
                  only={false}
                  onAction={layers.onAction}
                  onClose={() => {}}
                />
              )}
            </SeededLayers>
          </InfiniteFrame>
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

/**
 * The Infinite Painter variant's layer panel on the four layers, in a frame as high as the panel's place below the top
 * bar. The seeded document holds no pixels, so each layer gets a small drawing as its thumbnail; a slide sideways
 * collapses or expands the panel, as in the variant.
 */
function InfiniteLayers(props: { expanded: boolean }) {
  const [expanded, setExpanded] = createSignal(untrack(() => props.expanded));
  const thumbnails = new Map<string, string>();

  return (
    <InfiniteFrame width={260} height={420}>
      <SeededLayers layers={fourLayers}>
        {(layers) => (
          <div class={styles.infiniteLayers}>
            <InfiniteLayerPanel
              layers={withBadges(layers.state().layers)}
              activeId={layers.state().activeId}
              thumbnail={(id) => {
                const index = layers.state().layers.findIndex((layer) => layer.id === id);
                if (!thumbnails.has(id)) {
                  thumbnails.set(id, sampleThumbnail(index));
                }

                return thumbnails.get(id);
              }}
              expanded={expanded()}
              onExpanded={setExpanded}
              ready
              onAction={layers.onAction}
            />
          </div>
        )}
      </SeededLayers>
    </InfiniteFrame>
  );
}

/** The seeded layers with the second from the bottom, the shadows, in Multiply at 59 %, for the thumbnail badges. */
function withBadges<T extends { blend: string; opacity: number }>(layers: readonly T[]): T[] {
  return layers.map((layer, index) => (index === 1 ? { ...layer, blend: 'multiply', opacity: 0.59 } : layer));
}

/** A small drawing for layer `index` as a PNG data URL: a different shape and color per layer. */
function sampleThumbnail(index: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  const colors = ['#e7a35c', '#5b4a7a', '#2f2f35', '#d8573c'];
  context.fillStyle = context.strokeStyle = colors[index % colors.length]!;
  context.lineWidth = 9;
  context.lineCap = 'round';
  context.beginPath();
  if (index === 0) {
    context.ellipse(48, 52, 34, 30, 0, 0, Math.PI * 2);
    context.fill();
  } else if (index === 2) {
    context.moveTo(18, 70);
    context.bezierCurveTo(30, 20, 62, 20, 78, 68);
    context.stroke();
  } else {
    context.arc(30 + index * 12, 40 + index * 6, 14, 0, Math.PI * 2);
    context.fill();
  }

  return canvas.toDataURL();
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
