import type { BrushResource } from '@app-game/abr-paint/resources';
import type { JSX } from '@solidjs/web';
import type { Result } from 'neverthrow';
import { createSignal, For, Show } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './BrushLibrary.module.css';
import { brushSets, setOf } from './brushSets';
import { PopoverHeader } from './Popover';
import { StrokePreview } from './StrokePreview';

/**
 * Procreate's Brush Library: brush sets in a column on the left, the chosen set's brushes on the right as their names
 * over sample strokes, the brush in use in blue. Choosing a brush applies it and keeps the library open, as in
 * Procreate; choosing a set only browses. The library opens on the set of the brush in use. `+` imports ABR brushes.
 */
export function BrushLibrary(props: {
  title: string;
  presets: readonly BrushPreset[];
  /** Resolves imported preset textures before their sample is rendered. */
  resources?: (preset: BrushPreset) => Promise<Result<BrushResource[], unknown>>;
  /** Recently used presets, newest first, for the Recent set. */
  recent: readonly string[];
  /** The preset the tool paints with. */
  preset: string;
  /** Brushes cannot be chosen now, for example during a preset upload. */
  disabled: boolean;
  onChoose: (id: string) => void;
  /** Opens the ABR brush importer; omitted, the `+` button is hidden. */
  onImport?: () => void;
  /** Rows above the sets, such as the eraser's mode. */
  children?: JSX.Element;
  /** Rows under the columns, such as Mixer Brush commands. */
  footer?: JSX.Element;
}) {
  const sets = () => brushSets(props.presets, props.recent);
  const [chosen, setChosen] = createSignal(() => setOf(sets(), props.preset));
  const shown = () => sets().find((set) => set.id === chosen()) ?? sets()[0];

  return (
    <>
      <PopoverHeader title={props.title}>
        <Show when={props.onImport}>
          {(onImport) => (
            <button
              class={styles.headerButton}
              aria-label="Import ABR brushes"
              title="Import ABR brushes"
              disabled={props.disabled}
              onClick={() => onImport()()}
            >
              <SketchIcon name="plus" size={22} />
            </button>
          )}
        </Show>
      </PopoverHeader>
      {props.children}
      <div class={styles.columns}>
        <nav class={styles.sets} aria-label="Brush sets">
          <For each={sets()} keyed={(set) => set.id}>
            {(set) => (
              <button
                class={styles.set}
                aria-pressed={chosen() === set().id ? 'true' : 'false'}
                onClick={() => setChosen(set().id)}
              >
                <span class={styles.setName}>{set().name}</span>
                <span class={styles.count}>{set().presets.length}</span>
              </button>
            )}
          </For>
        </nav>
        <div class={styles.brushes} role="listbox" aria-label={`${shown()?.name ?? ''} brushes`}>
          <For each={shown()?.presets ?? []} keyed={(preset) => preset.id}>
            {(preset) => (
              <button
                class={styles.brush}
                role="option"
                aria-selected={preset().id === props.preset ? 'true' : 'false'}
                disabled={props.disabled}
                onClick={() => props.onChoose(preset().id)}
              >
                <span class={styles.brushName}>{preset().name}</span>
                <StrokePreview
                  settings={preset().settings}
                  resources={
                    props.resources
                      ? async () => {
                          const result = await props.resources!(preset());
                          if (result.isErr()) {
                            throw result.error;
                          }
                          return result.value;
                        }
                      : undefined
                  }
                  height={30}
                />
              </button>
            )}
          </For>
        </div>
      </div>
      {props.footer}
    </>
  );
}
