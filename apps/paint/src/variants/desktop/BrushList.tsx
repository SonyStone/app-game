import { createSignal, For, untrack } from 'solid-js';
import type { PaintSession } from '../../features/session';
import { brushSets, setOf, type BrushSet } from './brushSets';
import { Choice, IconButton } from './controls';
import styles from './panels.module.css';
import { PresetStroke } from './PresetStroke';

/**
 * The brush presets of one set, each as its name beside a sample stroke, the preset in use lighter, with the set
 * chooser and the ABR import above them. Choosing a preset paints with it; the eraser keeps erasing with it. Used by
 * the Brushes panel and by the options bar's preset picker, which closes once a preset is chosen (`onChosen`).
 */
export function BrushList(props: { session: PaintSession; onImport: () => void; onChosen?: () => void }) {
  const { library, tools, recentPresets, uploads } = props.session;
  const sets = () => brushSets(library.presets(), [tools.preset(), ...recentPresets.recent(11)]);
  // Opens on the set holding the preset in use, then stays where the user browses.
  const [chosen, setChosen] = createSignal<BrushSet['id']>(untrack(() => setOf(sets(), tools.preset())));
  const shown = () => sets().find((set) => set.id === chosen()) ?? sets()[0];

  return (
    <div class={styles.brushes}>
      <div class={styles.brushBar}>
        <Choice
          label="Brush set"
          value={shown()?.id ?? 'basic'}
          options={sets().map((set) => ({ value: set.id, label: `${set.name} (${set.presets.length})` }))}
          onChange={setChosen}
        />
        <IconButton icon="plus" label="Import ABR brushes…" onClick={props.onImport} />
      </div>
      <div class={styles.brushList} role="listbox" aria-label={`${shown()?.name ?? ''} brushes`}>
        <For each={shown()?.presets ?? []} keyed={(preset) => preset.id}>
          {(preset) => (
            <button
              class={styles.brush}
              role="option"
              aria-selected={preset().id === tools.preset() ? 'true' : 'false'}
              disabled={!props.session.ready() || uploads.busy()}
              title={preset().name}
              onClick={() => {
                props.session.usePreset(preset().id);
                props.onChosen?.();
              }}
            >
              <span class={styles.brushName}>{preset().name}</span>
              <span class={styles.brushStroke}>
                <PresetStroke
                  preset={preset()}
                  resources={library.resources}
                  color={preset().id === tools.preset() ? '#ffffff' : '#bdbdbd'}
                  height={26}
                />
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
