import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { ClusterActions } from '../../mockups/tile-cluster/clusterActions';
import { createDebugOptions, defaultOptions } from '../../mockups/tile-cluster/debugOptions';
import { DebugSidebar } from '../../mockups/tile-cluster/DebugSidebar';
import mockup from '../../mockups/tile-cluster/mockup.module.css';
import { PuckRing } from '../../mockups/tile-cluster/PuckRing';
import { RingEditor } from '../../mockups/tile-cluster/RingEditor';
import { createRingLayout, defaultRingLayout } from '../../mockups/tile-cluster/ringLayout';
import {
  ColorTile,
  LayersTile,
  PresetsTile,
  SelectionTile,
  SettingsTile,
  ToolsTile,
  type MockLayer
} from '../../mockups/tile-cluster/tiles';
import { defaultSettings, toolSections, type SettingValue, type ToolId } from '../../mockups/tile-cluster/toolSettings';
import styles from '../ComponentCanvas.module.css';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * The tile cluster mockup's parts: its tiles of tools, color, settings, presets, selection and layers, the Puck ring
 * around which they sit, the ring's editor and the debug sidebar, each on the mockup's dark stage. The tiles take the
 * mockup's state as props, so each specimen keeps its own.
 */
export function TileCluster() {
  return (
    <CanvasGroup
      id="tile-cluster"
      title="Tile cluster"
      omitted={
        <>
          Not here: the launcher button, which shows only while it follows the pen over the mockup's drawing; the whole
          cluster as it opens around the ring is the mockup page (see Whole UIs).
        </>
      }
    >
      <CanvasRow title="Tiles" note="as wide as their places around the ring">
        <Specimen id="tile-cluster/tiles/tools" label="Tools">
          <TileStage>
            <ToolsSpecimen />
          </TileStage>
        </Specimen>
        <Specimen id="tile-cluster/tiles/color" label="Color">
          <TileStage>
            <ColorSpecimen />
          </TileStage>
        </Specimen>
        <Specimen id="tile-cluster/tiles/settings" label="Brush settings">
          <TileStage>
            <SettingsSpecimen />
          </TileStage>
        </Specimen>
        <Specimen id="tile-cluster/tiles/presets" label="Presets">
          <TileStage>
            <PresetsSpecimen />
          </TileStage>
        </Specimen>
        <Specimen id="tile-cluster/tiles/selection" label="Selection">
          <TileStage>
            <SelectionTile class={styles.tileWide!} />
          </TileStage>
        </Specimen>
        <Specimen id="tile-cluster/tiles/layers" label="Layers">
          <TileStage>
            <LayersSpecimen />
          </TileStage>
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Ring" note="the Puck ring the tiles sit around">
        <Specimen id="tile-cluster/ring/rest" label="Ring">
          <RingSpecimen />
        </Specimen>
        <Specimen id="tile-cluster/ring/heading" label="Ring, a flick heading for a sector">
          <RingSpecimen heading={2} />
        </Specimen>
        <Specimen id="tile-cluster/ring/editor" label="Ring editor">
          <div class={[mockup.stage, styles.tileStage, styles.tileEditor]}>
            <RingEditor ring={createRingLayout()} onClose={() => {}} />
          </div>
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Debug">
        <Specimen id="tile-cluster/debug/sidebar" label="Debug sidebar">
          <div class={[mockup.stage, styles.tileStage, styles.tileDebug]}>
            <DebugSidebar
              debug={createDebugOptions()}
              status="Pen: hovering"
              onClear={() => {}}
              onEditRing={() => {}}
            />
          </div>
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/**
 * The mockup's dark stage, with its tokens, around one tile, and the cluster's action reporting, which hides the
 * cluster during a drag in the mockup and does nothing here.
 */
function TileStage(props: { children: JSX.Element }) {
  return (
    <ClusterActions value={{ begin: () => {}, pause: () => {}, end: () => {} }}>
      <div class={[mockup.stage, styles.tileStage]} style={{ '--nav': `${ringOuter * 2}px` }}>
        {props.children}
      </div>
    </ClusterActions>
  );
}

function ToolsSpecimen() {
  const [tool, setTool] = createSignal<ToolId>('brush');
  const [flipped, setFlipped] = createSignal(false);

  return (
    <ToolsTile
      class={styles.tileTools!}
      tool={tool()}
      flipped={flipped()}
      onTool={setTool}
      onFit={() => {}}
      onFlip={() => setFlipped((on) => !on)}
    />
  );
}

function ColorSpecimen() {
  const [color, setColor] = createSignal('#2d5a7b');
  const [previous, setPrevious] = createSignal('#d9773c');

  return (
    <ColorTile
      class={styles.tileWide!}
      color={color()}
      previous={previous()}
      recent={['#2d5a7b', '#d9773c', '#1f1f24', '#e8dcc4', '#7a9a6b', '#b8413a', '#f2c14e', '#5b6ea8']}
      onChange={setColor}
      onCommit={() => {}}
      onChoose={(chosen) => {
        setPrevious(color());
        setColor(chosen);
      }}
    />
  );
}

/** The brush's settings tile, previewing and changing values of its own. */
function SettingsSpecimen() {
  const [values, setValues] = createSignal<Record<string, SettingValue>>(defaultSettings.brush);
  const set = (key: string, value: SettingValue) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <SettingsTile
      class={styles.tileWide!}
      sections={toolSections.brush}
      values={values()}
      onChange={set}
      onPreview={set}
    />
  );
}

function PresetsSpecimen() {
  const [preset, setPreset] = createSignal('gouache');

  return <PresetsTile class={styles.tileSide!} preset={preset()} color="#2d5a7b" onPreset={setPreset} />;
}

/** The layers tile on the canvas's four test layers, as the mockup's mock layers. */
function LayersSpecimen() {
  const [layers, setLayers] = createSignal<readonly MockLayer[]>(mockLayers);
  const [active, setActive] = createSignal('ink');

  return (
    <LayersTile
      class={styles.tileSide!}
      layers={layers()}
      active={active()}
      onSelect={setActive}
      onUpdate={(id, change) =>
        setLayers((list) => list.map((layer) => (layer.id === id ? { ...layer, ...change } : layer)))
      }
      onAction={() => {}}
    />
  );
}

/** The Puck ring with its default sectors at the mockup's default size; `heading` lights a sector as a flick does. */
function RingSpecimen(props: { heading?: number }) {
  return (
    <div class={[mockup.stage, styles.tileStage, styles.tileRingBox]}>
      <div class={styles.tileRingAnchor}>
        <PuckRing
          layout={defaultRingLayout}
          inner={defaultOptions.ringDead}
          outer={ringOuter}
          heading={props.heading}
          strength={props.heading === undefined ? 0 : 0.8}
        />
      </div>
    </div>
  );
}

/** The ring's outer radius at the mockup's default dead circle and ring width. */
const ringOuter = defaultOptions.ringDead + defaultOptions.ringWidth;

/** The canvas's four test layers as the mockup's mock layers, with painted thumbnails. */
const mockLayers: readonly MockLayer[] = [
  mockLayer('sketch', 'Sketch', { visible: false, blend: 'Multiply', opacity: 45 }, '#9aa0a6'),
  mockLayer('ink', 'Ink', { locked: true }, '#1f1f24'),
  mockLayer('shadows', 'Shadows', { blend: 'Multiply', opacity: 65 }, '#5b6ea8'),
  mockLayer('flats', 'Flat colors', {}, '#d9773c')
];

/** A visible, unlocked, normal mock layer at full opacity, changed by `patch`, its thumbnail a dab of `color`. */
function mockLayer(id: string, name: string, patch: Partial<MockLayer>, color: string): MockLayer {
  return { id, name, visible: true, locked: false, blend: 'Normal', opacity: 100, thumb: thumb(color), ...patch };
}

function thumb(color: string) {
  return `radial-gradient(circle at 40% 45%, ${color} 0 30%, #f4f2ee 32%)`;
}
