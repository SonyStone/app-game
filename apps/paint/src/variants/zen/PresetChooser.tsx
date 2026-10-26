import { For } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { DabPresetStroke as PresetStroke } from '../../features/brush-library/DabPresetStroke';
import { shapeNames, type ToolShape as Shape } from './tools';
import { ToolShape } from './ToolShape';
import styles from './ZenStudio.module.css';

/**
 * What a long press on one of the fan's brushes opens: every brush preset in the library as its name over a sample
 * stroke, to paint with in that slot, and the slot's own default tool first. The slot's current preset is marked.
 */
export function PresetChooser(props: {
  shape: Shape;
  presets: readonly BrushPreset[];
  /** The slot's preset; the default tool counts as none. */
  current?: string;
  color: string;
  /** Reads a preset's tip images; see `BrushLibrary.resources`. */
  resources: Parameters<typeof PresetStroke>[0]['resources'];
  disabled: boolean;
  onDefault: () => void;
  onChoose: (preset: BrushPreset) => void;
}) {
  return (
    <ul class={styles.presets} aria-label={`Brush for the ${shapeNames[props.shape]}`}>
      <li>
        <button
          class={styles.preset}
          aria-current={props.current === undefined ? 'true' : undefined}
          disabled={props.disabled}
          onClick={() => props.onDefault()}
        >
          <span class={styles.presetName}>
            <ToolShape shape={props.shape} ink={props.color} size={22} />
            {shapeNames[props.shape]}
          </span>
        </button>
      </li>
      <For each={props.presets} keyed={(preset) => preset.id}>
        {(preset) => (
          <li>
            <button
              class={styles.preset}
              aria-current={props.current === preset().id ? 'true' : undefined}
              disabled={props.disabled}
              onClick={() => props.onChoose(preset())}
            >
              <span class={styles.presetName}>{preset().name}</span>
              <PresetStroke preset={preset()} resources={props.resources} color={props.color} height={26} />
            </button>
          </li>
        )}
      </For>
    </ul>
  );
}
