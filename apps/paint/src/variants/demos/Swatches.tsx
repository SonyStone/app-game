import { For } from 'solid-js';
import styles from './FeatureDemo.module.css';

/** A row of fixed colors to paint with; the one matching `color` is marked. */
export function Swatches(props: { color: string; onPick: (color: string) => void }) {
  return (
    <div class={styles.swatches} role="radiogroup" aria-label="Color">
      <For each={swatches}>
        {(swatch) => (
          <button
            role="radio"
            aria-label={swatch}
            aria-checked={props.color.toLowerCase() === swatch ? 'true' : 'false'}
            style={{ background: swatch }}
            onClick={() => props.onPick(swatch)}
          />
        )}
      </For>
    </div>
  );
}

/** The demo colors: warm and cool picks that read well on line art. */
const swatches = ['#e8b04b', '#d9534f', '#5b9bd5', '#7fb069', '#a17cc9', '#f2e9dc'];
