import type { BrushResource } from '@app-game/abr-paint/resources';
import type { JSX } from '@solidjs/web';
import type { Result } from 'neverthrow';
import { createSignal, For, Show } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { StrokePreview } from '../../features/brush-library/StrokePreview';
import { SettingsList } from '../../shared/ui/SettingsList';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './BrushLibrary.module.css';
import { brushSets, setOf, type BrushSet } from './brushSets';
import { PopoverHeader } from './Popover';

/**
 * Procreate's Brush Library: brush sets in a column on the left (a `SettingsList`), the chosen set's brushes on the
 * right as their names over sample strokes, the brush in use in blue. Choosing a brush applies it and keeps the
 * library open, as in Procreate; choosing a set only browses. The library opens on the set of the brush in use. `+`
 * imports ABR brushes.
 *
 * Drawn in the Procreate variant's colors (its `--pc-*` properties) by default. A host restyles it through
 * `--brush-library-sets` (the sets column's ground), `--brush-library-pane` (the brushes' ground),
 * `--brush-library-chosen` (the brush in use, and the chosen set's pill in Procreate's look), `--brush-library-ink`,
 * `--brush-library-quiet`, `--brush-library-line`, `--brush-library-icon` and `--brush-library-icon-ink` (the sets'
 * icon tiles), `--brush-library-mark` (the chosen set's tile), `--brush-library-disabled` (header commands while
 * brushes cannot be chosen), `--brush-library-radius` (the columns' corners) and
 * `--brush-library-height` (the columns' height).
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
  onImportFile?: (file: File) => void;
  onExportFile?: (id: string) => void;
  /** Rows above the sets, such as the eraser's mode. */
  children?: JSX.Element;
  /** Rows under the columns, such as Mixer Brush commands. */
  footer?: JSX.Element;
  /**
   * Draws the sets as the Settings-style sidebar of LEGO's panels, each on its icon tile, the chosen one joined to
   * the brushes beside it, instead of Procreate's blue pill.
   */
  sidebar?: boolean;
}) {
  let picker: HTMLInputElement | undefined;
  const sets = () => brushSets(props.presets, props.recent);
  const [chosen, setChosen] = createSignal(() => setOf(sets(), props.preset));
  const shown = () => sets().find((set) => set.id === chosen()) ?? sets()[0];

  return (
    <>
      <PopoverHeader title={props.title}>
        <Show when={props.onImportFile}>
          <input
            hidden
            type="file"
            accept=".paintbrush"
            ref={(el) => {
              picker = el;
            }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                props.onImportFile?.(file);
              }
            }}
          />
          <button class={styles.headerTextButton} disabled={props.disabled} onClick={() => picker?.click()}>
            Import .paintbrush
          </button>
        </Show>
        <Show
          when={
            props.onExportFile &&
            props.presets.some(
              (p) =>
                p.id === props.preset &&
                (!!p.abrDocument || ['round', 'textured'].includes(p.settings.engine?.id ?? 'round'))
            )
          }
        >
          <button
            class={styles.headerTextButton}
            disabled={props.disabled}
            onClick={() => props.onExportFile?.(props.preset)}
          >
            Export .paintbrush
          </button>
        </Show>
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
      <div class={styles.columns} data-sidebar={props.sidebar ? '' : undefined}>
        <SettingsList
          class={styles.sets}
          label="Brush sets"
          items={sets().map((set) => ({
            id: set.id,
            label: set.name,
            icon: setIcons[set.id],
            trailing: String(set.presets.length)
          }))}
          selected={chosen()}
          onSelect={(id) => setChosen(id as BrushSet['id'])}
        />
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

/** The sets' icons, on their tiles in the sidebar look. */
const setIcons: Record<BrushSet['id'], SketchIconName> = {
  recent: 'localUndo',
  basic: 'brush',
  imported: 'folder',
  mine: 'pencil'
};
