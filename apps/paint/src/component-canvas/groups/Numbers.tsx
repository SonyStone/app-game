import { defaultBrush } from '@app-game/paint-core/brush';
import { createSignal } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { BrushSizeGrid } from '../../features/brush-size';
import { ClusterActions } from '../../mockups/tile-cluster/clusterActions';
import { ValueButton } from '../../mockups/tile-cluster/ValueButton';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import styles from '../ComponentCanvas.module.css';
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
    </CanvasGroup>
  );
}

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

const loneCluster = { begin: () => {}, end: () => {} };

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
