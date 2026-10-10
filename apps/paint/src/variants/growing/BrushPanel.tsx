import { For, Show } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './panels.module.css';
import { StrokePreview } from './StrokePreview';

/**
 * The brushes the brush or the eraser can paint with, each as its name over a sample stroke: Paint's own brushes
 * first, then imported and saved ones. Choosing one applies it and keeps the list open, so brushes can be compared.
 * `+` imports ABR brushes. For the eraser, a switch above the list makes it erase with the current brush instead.
 */
export function BrushPanel(props: {
  title: string;
  presets: readonly BrushPreset[];
  /** The preset in use; none while the eraser erases with the brush. */
  preset: string | undefined;
  /** Brushes cannot be chosen now, for example during an upload. */
  disabled: boolean;
  onChoose: (id: string) => void;
  onImport: () => void;
  /** The eraser's mode switch; omitted for the brush. */
  eraseWithBrush?: { on: boolean; available: boolean; onToggle: () => void };
}) {
  const groups = () =>
    [
      { name: 'Basic', presets: props.presets.filter((preset) => preset.builtIn) },
      { name: 'Imported and saved', presets: props.presets.filter((preset) => !preset.builtIn) }
    ].filter((group) => group.presets.length > 0);

  return (
    <>
      <header class={styles.header}>
        <h2>{props.title}</h2>
        <button
          class={styles.iconButton}
          aria-label="Import ABR brushes"
          title="Import Photoshop brushes (.abr)"
          disabled={props.disabled}
          onClick={() => props.onImport()}
        >
          <SketchIcon name="plus" size={18} />
        </button>
      </header>
      <Show when={props.eraseWithBrush}>
        {(mode) => (
          <button
            class={styles.switchRow}
            role="switch"
            aria-checked={mode().on ? 'true' : 'false'}
            disabled={!mode().available}
            onClick={() => mode().onToggle()}
          >
            <span>Erase with the current brush</span>
            <span class={styles.switch} />
          </button>
        )}
      </Show>
      <div class={styles.scroll}>
        <For each={groups()}>
          {(group) => (
            <>
              <h3 class={styles.subheading}>{group.name}</h3>
              <div class={styles.brushes} role="listbox" aria-label={`${group.name} brushes`}>
                <For each={group.presets} keyed={(preset) => preset.id}>
                  {(preset) => (
                    <button
                      class={styles.brush}
                      role="option"
                      aria-selected={preset().id === props.preset ? 'true' : 'false'}
                      disabled={props.disabled}
                      onClick={() => props.onChoose(preset().id)}
                    >
                      <span>{preset().name}</span>
                      <StrokePreview settings={preset().settings} height={26} />
                    </button>
                  )}
                </For>
              </div>
            </>
          )}
        </For>
      </div>
    </>
  );
}
