import { defaultBrush } from '@app-game/paint-core/brush';
import { createSignal } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { BrushSizeGrid } from '../../features/brush-size';
import { ClusterActions } from '../../mockups/tile-cluster/clusterActions';
import { ValueButton } from '../../mockups/tile-cluster/ValueButton';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { ScrubField, Segmented as DesktopSegmented, Toggle } from '../../variants/desktop/controls';
import procreate from '../../variants/procreate/ProcreateStudio.module.css';
import { BrushPreview, SidebarSlider } from '../../variants/procreate/Sidebar';
import sidebar from '../../variants/procreate/Sidebar.module.css';
import { Slider } from '../../variants/procreate/Slider';
import {
  geometricFraction,
  geometricValue,
  linearFraction,
  linearValue,
  minOpacity
} from '../../variants/procreate/sliderScale';
import cluster from '../../variants/puck/cluster.module.css';
import { PillScrubber, Segmented as PuckSegmented, SwitchRow } from '../../variants/puck/controls';
import { placed } from '../../variants/puck/layout';
import { percentSetting, sizeSetting } from '../../variants/puck/values';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, PuckFrame } from '../frames';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Numbers: the ways Paint sets a number, all on the same brush size of 12 px, each specimen keeping its own value.
 * Their popups open in window coordinates; on the canvas `createViewportPopups` keeps them under the pointer.
 */
export function Numbers() {
  return (
    <CanvasGroup
      id="numbers"
      title="Numbers"
      omitted={
        <>
          Open and scrubbing states show when you press a specimen: the components open their grids only from a
          press or a hover, and a frozen open copy would need them to take an `open` prop. The brush size grid opens
          to the left of its button.
        </>
      }
    >
      <CanvasRow title="Brush size, 12 px" note="press, slide and lift; or tap">
        <Specimen id="numbers/size/value-button" label="Value button with a grid (tile cluster)">
          <div class={styles.darkTile}>
            <SizeValue layout="stacked" />
          </div>
        </Specimen>
        <Specimen id="numbers/size/value-button-inline" label="Value button, one line">
          <div class={styles.darkTile}>
            <SizeValue layout="inline" />
          </div>
        </Specimen>
        <Specimen id="numbers/size/size-grid" label="Brush size grid (Studio)">
          <div class={styles.studioBar}>
            <SizeGrid />
          </div>
        </Specimen>
        <Specimen id="numbers/size/scrub" label="Drag field (Krita, Procreate)">
          <div class={styles.studioPanel}>
            <section>
              <SizeScrub />
            </section>
          </div>
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Sliders and switches in the variants" note="brush size, opacity, pressure and smoothing">
        <Specimen id="numbers/variants/puck" label="Puck: pills, switch, segments">
          <PuckControls />
        </Specimen>
        <Specimen id="numbers/variants/procreate-sidebar" label="Procreate: sidebar sliders">
          <ProcreateSidebar />
        </Specimen>
        <Specimen id="numbers/variants/procreate-slider" label="Procreate: popover slider">
          <ProcreateSlider />
        </Specimen>
        <Specimen id="numbers/variants/desktop" label="Desktop: drag fields, toggle, segments">
          <DesktopControls />
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** The Puck variant's controls on a card of its own, as its Brush Studio card stacks them. */
function PuckControls() {
  const [size, setSize] = createSignal(startSize);
  const [opacity, setOpacity] = createSignal(100);
  const [pressure, setPressure] = createSignal(true);
  const [smoothing, setSmoothing] = createSignal<(typeof smoothingOptions)[number]['value']>('studio');
  const card = { x: 0, y: 0, width: 300, height: 214 };

  return (
    <PuckFrame boxes={[card]}>
      <div class={cluster.card} style={{ ...placed(card), gap: '8px' }}>
        <PillScrubber setting={sizeSetting(maxSize)} value={size()} onChange={setSize} />
        <PillScrubber setting={percentSetting('Opacity', 1)} value={opacity()} onChange={setOpacity} />
        <SwitchRow label="Pressure → size" on={pressure()} onToggle={() => setPressure((on) => !on)} />
        <PuckSegmented label="Smoothing" options={smoothingOptions} value={smoothing()} onChange={setSmoothing} />
      </div>
    </PuckFrame>
  );
}

/** The Procreate variant's sidebar: its size and opacity sliders with their previews, on the variant's grey. */
function ProcreateSidebar() {
  const [size, setSize] = createSignal(startSize);
  const [opacity, setOpacity] = createSignal(1);

  return (
    <div class={[procreate.editor, styles.procreateGround]}>
      <div class={sidebar.sidebar} data-side="left" role="toolbar" aria-orientation="vertical" aria-label="Sidebar">
        <SidebarSlider
          label="Brush size"
          value={size()}
          toFraction={(value) => geometricFraction(value, 1, maxSize)}
          fromFraction={(fraction) => geometricValue(fraction, 1, maxSize)}
          side="left"
          valueText={`${Math.round(size())} px`}
          onChange={setSize}
          preview={<BrushPreview diameter={size()} color="#c8553d" opacity={1} label={`${Math.round(size())} px`} />}
        />
        <SidebarSlider
          label="Brush opacity"
          value={opacity()}
          toFraction={(value) => linearFraction(value, minOpacity, 1)}
          fromFraction={(fraction) => Math.round(linearValue(fraction, minOpacity, 1) * 100) / 100}
          side="left"
          valueText={`${Math.round(opacity() * 100)} %`}
          onChange={setOpacity}
          preview={
            <BrushPreview
              diameter={64}
              color="#c8553d"
              opacity={opacity()}
              checkered
              label={`${Math.round(opacity() * 100)}%`}
            />
          }
        />
      </div>
    </div>
  );
}

/** The Procreate variant's slider, as its Layers and Colors popovers use it. */
function ProcreateSlider() {
  const [opacity, setOpacity] = createSignal(100);

  return (
    <div class={[procreate.editor, styles.procreateGround]} style={{ width: '300px' }}>
      <Slider
        label="Opacity"
        value={opacity()}
        min={0}
        max={100}
        valueText={`${opacity()} %`}
        onInput={setOpacity}
        onChange={setOpacity}
      />
    </div>
  );
}

/** The Desktop variant's options bar controls for the brush: drag fields, a toggle and segments. */
function DesktopControls() {
  const [size, setSize] = createSignal(startSize);
  const [opacity, setOpacity] = createSignal(100);
  const [pressure, setPressure] = createSignal(true);
  const [smoothing, setSmoothing] = createSignal<(typeof smoothingOptions)[number]['value']>('studio');

  return (
    <DesktopFrame>
      <div class={styles.desktopBar}>
        <ScrubField
          caption="Size"
          label="Brush size"
          value={size()}
          min={1}
          max={maxSize}
          unit="px"
          scale="log"
          onChange={setSize}
        />
        <ScrubField
          caption="Opacity"
          label="Opacity"
          value={opacity()}
          min={1}
          max={100}
          unit="%"
          onChange={setOpacity}
        />
        <Toggle
          label="Size"
          title="Pressure changes the size"
          on={pressure()}
          onToggle={() => setPressure((on) => !on)}
        />
        <DesktopSegmented label="Smoothing" value={smoothing()} options={smoothingOptions} onChange={setSmoothing} />
      </div>
    </DesktopFrame>
  );
}

/** Smoothing modes as the variants offer them, for the segmented controls. */
const smoothingOptions = [
  { value: 'none', label: 'Off' },
  { value: 'studio', label: 'Studio' },
  { value: 'normal', label: 'Normal' },
  { value: 'smooth', label: 'Smooth' }
] as const;

/**
 * The tile cluster's value button over brush sizes, in either of its layouts. Alone, there is no cluster to hide
 * while a value is picked, so its actions do nothing.
 */
function SizeValue(props: { layout: 'stacked' | 'inline' }) {
  const [size, setSize] = createSignal(startSize);

  return (
    <ClusterActions value={loneCluster}>
      <ValueButton
        label="Size"
        value={size()}
        min={1}
        max={maxSize}
        unit="px"
        scale="log"
        dots
        layout={props.layout}
        onPreview={setSize}
        onPick={setSize}
      />
    </ClusterActions>
  );
}

const loneCluster = { begin: () => {}, pause: () => {}, end: () => {} };

/** Studio's brush size grid. */
function SizeGrid() {
  const [size, setSize] = createSignal(startSize);

  return <BrushSizeGrid size={size()} max={maxSize} onPreview={setSize} onPick={setSize} />;
}

/** The pen's drag field, logarithmic over brush sizes, as the brush panel's size. */
function SizeScrub() {
  const [size, setSize] = createSignal(startSize);

  return (
    <label class={styles.fieldRow}>
      Size
      <ScrubNumber
        label="Brush size"
        value={size()}
        min={1}
        max={maxSize}
        unit="px"
        scale="log"
        onInput={setSize}
        onChange={setSize}
      />
    </label>
  );
}

const startSize = 12;
/** The round brush's largest size in Paint. */
const maxSize = maxBrushSize(defaultBrush());
