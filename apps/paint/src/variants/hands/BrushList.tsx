import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './BrushList.module.css';
import sheet from './Sheet.module.css';
import { StrokePreview } from './StrokePreview';

/**
 * The brushes tab: every preset as a large row with its name over a sample stroke, in sets (built-in, imported, the
 * user's own), the one in use marked. Choosing a preset paints with it and keeps the sheet open. `children` go above
 * the sets, such as the eraser's mode and the Mixer Brush's commands.
 */
export function BrushList(props: {
  presets: readonly BrushPreset[];
  /** The preset the active brush tool paints with. */
  preset: string;
  /** Brushes cannot be chosen now, for example during a preset upload. */
  disabled: boolean;
  onChoose: (id: string) => void;
  /** Opens the ABR brush importer. */
  onImport: () => void;
  children?: JSX.Element;
}) {
  const sets = () =>
    [
      { name: 'Basic', presets: props.presets.filter((preset) => preset.builtIn) },
      { name: 'Imported', presets: props.presets.filter((preset) => !preset.builtIn && preset.source !== undefined) },
      { name: 'My brushes', presets: props.presets.filter((preset) => !preset.builtIn && preset.source === undefined) }
    ].filter((set) => set.presets.length > 0);

  return (
    <>
      {props.children}
      <For each={sets()} keyed={(set) => set.name}>
        {(set) => (
          <section class={sheet.section}>
            <h2 class={sheet.sectionTitle}>{set().name}</h2>
            <For each={set().presets} keyed={(preset) => preset.id}>
              {(preset) => (
                <button
                  class={styles.preset}
                  aria-current={props.preset === preset().id ? 'true' : undefined}
                  disabled={props.disabled}
                  onClick={() => props.onChoose(preset().id)}
                >
                  <span class={sheet.label}>{preset().name}</span>
                  <StrokePreview settings={preset().settings} height={30} />
                </button>
              )}
            </For>
          </section>
        )}
      </For>
      <section class={sheet.section}>
        <button class={sheet.row} onClick={() => props.onImport()}>
          <SketchIcon name="plus" size={20} />
          <span class={sheet.label}>Import ABR brushes…</span>
        </button>
      </section>
    </>
  );
}
