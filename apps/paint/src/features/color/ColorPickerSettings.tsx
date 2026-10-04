import type { ColorSample } from '@app-game/paint-core/colorSample';
import { For } from 'solid-js';
import styles from './ColorPickerSettings.module.css';

/** Choices of what the canvas color picker samples: the view or the active layer, and the averaged square's size. */
export function ColorPickerSettings(props: {
  source: ColorSample['source'];
  size: ColorSample['size'];
  onChange: (patch: Partial<Omit<ColorSample, 'exact'>>) => void;
}) {
  return (
    <section class={styles.settings} aria-labelledby="color-picker-sampling">
      <h3 id="color-picker-sampling">Pick from canvas</h3>
      <div role="radiogroup" aria-label="Sample from">
        <For each={sources}>
          {(source) => (
            <button
              role="radio"
              aria-checked={props.source === source.value ? 'true' : 'false'}
              title={source.title}
              onClick={() => props.onChange({ source: source.value })}
            >
              {source.label}
            </button>
          )}
        </For>
      </div>
      <div role="radiogroup" aria-label="Sample size">
        <For each={sizes}>
          {(size) => (
            <button
              role="radio"
              aria-checked={props.size === size.value ? 'true' : 'false'}
              title={size.title}
              onClick={() => props.onChange({ size: size.value })}
            >
              {size.label}
            </button>
          )}
        </For>
      </div>
    </section>
  );
}

const sources = [
  { value: 'view', label: 'All layers', title: 'Pick the color shown, all layers and the paper included' },
  { value: 'layer', label: 'Active layer', title: "Pick the active layer's paint only" }
] as const satisfies readonly { value: ColorSample['source']; label: string; title: string }[];

const sizes = [
  { value: 1, label: '1 px', title: 'Pick one pixel' },
  { value: 3, label: '3×3', title: 'Average 3 × 3 pixels' },
  { value: 5, label: '5×5', title: 'Average 5 × 5 pixels' }
] as const satisfies readonly { value: ColorSample['size']; label: string; title: string }[];
