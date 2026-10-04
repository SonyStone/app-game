import type { Brush } from '@app-game/paint-core/brush';
import { createSignal, For, Show } from 'solid-js';
import { defaultPresetGroups, type BrushPreset, type PresetGroup } from '../brush-library';
import { BrushAdvancedControls, BrushDailyControls } from './BrushPanel';
import styles from './BrushPanel.module.css';
import type { EraserMode } from './createBrushTools';

/**
 * Brush panel prototype: the preset library as a grid, actions on the current preset, everyday settings and the
 * brush editor. See `TODO-brushes.md`; the layout is still to be designed.
 */
export function BrushLibraryPanel(props: {
  presets: readonly BrushPreset[];
  /** The preset the active tool paints with. */
  preset: string;
  /** Whether a preset has settings changed on the fly. */
  changed: (id: string) => boolean;
  /** Settings captured by the next stroke. */
  brush: Brush;
  /** Presets cannot be chosen now, for example before the engine is ready or during an upload. */
  disabled: boolean;
  onChange: (patch: Partial<Brush>) => void;
  onSelect: (id: string) => void;
  /** Discards the changes of a preset. */
  onReset: (id: string) => void;
  /** Saves the current preset's changes into it; user presets only. */
  onSave: () => void;
  onSaveAs: (name: string, groups: readonly PresetGroup[]) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Presets do not change the size; each tool keeps its own. */
  sharedSize: boolean;
  onSharedSizeChange: (shared: boolean) => void;
  /** Opens the ABR viewer to import or edit ABR brushes; omitted in builds without ABR. */
  onOpenAbr?: () => void;
  /** Present while the eraser is the active tool. */
  eraser?: {
    mode: EraserMode;
    /** The brush can erase; otherwise the eraser uses its own preset in either mode. */
    canClear: boolean;
    onModeChange: (mode: EraserMode) => void;
  };
}) {
  const current = () => props.presets.find((preset) => preset.id === props.preset);

  return (
    <>
      <Show when={props.eraser}>
        {(eraser) => (
          <section>
            <fieldset class={styles.eraserMode}>
              <legend>Erase with</legend>
              <label class={styles.check}>
                <input
                  type="radio"
                  name="eraser-mode"
                  checked={eraser().mode === 'clear'}
                  onChange={() => eraser().onModeChange('clear')}
                />
                The brush (Clear mode)
              </label>
              <label class={styles.check}>
                <input
                  type="radio"
                  name="eraser-mode"
                  checked={eraser().mode === 'preset'}
                  onChange={() => eraser().onModeChange('preset')}
                />
                Its own eraser brush
              </label>
            </fieldset>
            <p class={styles.panelNote}>
              {eraser().mode === 'clear' && eraser().canClear
                ? 'Choosing a brush below gives the eraser its own brush.'
                : eraser().mode === 'clear'
                  ? 'This brush cannot erase, so the eraser uses its own brush.'
                  : 'The eraser erases with the shape of the brush chosen below.'}
            </p>
          </section>
        )}
      </Show>
      <section>
        <div class={styles.presetGrid} role="group" aria-label="Brush presets">
          <For each={props.presets}>
            {(preset) => (
              <button
                class={styles.presetTile}
                aria-pressed={preset.id === props.preset ? 'true' : 'false'}
                disabled={props.disabled}
                title={preset.name}
                onClick={() => props.onSelect(preset.id)}
              >
                <span class={styles.presetKind}>{presetKind(preset)}</span>
                <span class={styles.presetName}>{preset.name}</span>
                <Show when={props.changed(preset.id)}>
                  <span class={styles.presetChanged} aria-label="changed" />
                </Show>
              </button>
            )}
          </For>
        </div>
        <Show when={props.onOpenAbr}>
          {(open) => (
            <button class={styles.abrLauncher} disabled={props.disabled} onClick={() => open()()}>
              ABR brushes…
            </button>
          )}
        </Show>
      </section>
      <Show when={current()} keyed>
        {(preset) => (
          <PresetActions
            preset={preset}
            changed={props.changed(preset.id)}
            onReset={() => props.onReset(preset.id)}
            onSave={props.onSave}
            onSaveAs={props.onSaveAs}
            onRename={(name) => props.onRename(preset.id, name)}
            onDelete={() => props.onDelete(preset.id)}
          />
        )}
      </Show>
      <BrushDailyControls brush={props.brush} onChange={props.onChange} />
      <section>
        <label class={styles.check}>
          <input
            type="checkbox"
            checked={props.sharedSize}
            onChange={(event) => props.onSharedSizeChange(event.currentTarget.checked)}
          />
          Keep the size when switching brushes
        </label>
      </section>
      <details class={styles.brushEditor}>
        <summary>Edit brush…</summary>
        <BrushAdvancedControls brush={props.brush} onChange={props.onChange} />
        <Show when={props.brush.engine?.id === 'abr' && props.onOpenAbr}>
          {(open) => (
            <button class={styles.abrLauncher} onClick={() => open()()}>
              Edit in the ABR viewer…
            </button>
          )}
        </Show>
      </details>
    </>
  );
}

/**
 * Actions on the current preset: reset and save its changes, save it as a new preset with chosen settings groups,
 * rename and delete. Built-in presets can only be reset and saved as new. Keyed on the preset, so open forms close
 * when another preset is chosen.
 */
function PresetActions(props: {
  preset: BrushPreset;
  changed: boolean;
  onReset: () => void;
  onSave: () => void;
  onSaveAs: (name: string, groups: readonly PresetGroup[]) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = createSignal<'save-as' | 'rename' | 'delete'>();
  const [name, setName] = createSignal('');
  const [groups, setGroups] = createSignal<readonly PresetGroup[]>(defaultPresetGroups);
  const toggleGroup = (group: PresetGroup, included: boolean) =>
    setGroups(included ? [...groups(), group] : groups().filter((candidate) => candidate !== group));

  return (
    <section class={styles.presetActions} aria-label="Current preset">
      <div class={styles.sectionHeading}>
        <strong>{props.preset.name}</strong>
        <span>{props.changed ? 'Changed' : props.preset.builtIn ? 'Built-in' : 'Saved'}</span>
      </div>
      <div class={styles.presetButtons}>
        <button disabled={!props.changed} onClick={() => props.onReset()}>
          Reset
        </button>
        <Show when={!props.preset.builtIn}>
          <button disabled={!props.changed} onClick={() => props.onSave()}>
            Save
          </button>
        </Show>
        <button
          onClick={() => {
            setName(`${props.preset.name} copy`);
            setForm('save-as');
          }}
        >
          Save as…
        </button>
        <Show when={!props.preset.builtIn}>
          <button
            onClick={() => {
              setName(props.preset.name);
              setForm('rename');
            }}
          >
            Rename
          </button>
          <button onClick={() => setForm('delete')}>Delete</button>
        </Show>
      </div>
      <Show when={form() === 'save-as'}>
        <form
          class={styles.presetForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (name().trim()) {
              props.onSaveAs(name().trim(), groups());
              setForm(undefined);
            }
          }}
        >
          <input aria-label="Preset name" value={name()} onInput={(event) => setName(event.currentTarget.value)} />
          <fieldset class={styles.eraserMode}>
            <legend>Save with the brush</legend>
            <For each={groupChoices}>
              {(choice) => (
                <label class={styles.check}>
                  <input
                    type="checkbox"
                    checked={choice.group === 'tip' || groups().includes(choice.group)}
                    disabled={choice.group === 'tip'}
                    onChange={(event) => toggleGroup(choice.group, event.currentTarget.checked)}
                  />
                  {choice.label}
                </label>
              )}
            </For>
          </fieldset>
          <div class={styles.presetButtons}>
            <button type="submit">Save preset</button>
            <button type="button" onClick={() => setForm(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      </Show>
      <Show when={form() === 'rename'}>
        <form
          class={styles.presetForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (name().trim()) {
              props.onRename(name().trim());
              setForm(undefined);
            }
          }}
        >
          <input aria-label="Preset name" value={name()} onInput={(event) => setName(event.currentTarget.value)} />
          <div class={styles.presetButtons}>
            <button type="submit">Rename</button>
            <button type="button" onClick={() => setForm(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      </Show>
      <Show when={form() === 'delete'}>
        <div class={styles.presetButtons} role="group" aria-label="Confirm delete">
          <button onClick={() => props.onDelete()}>Delete “{props.preset.name}”</button>
          <button onClick={() => setForm(undefined)}>Keep</button>
        </div>
      </Show>
    </section>
  );
}

/** Settings groups offered when saving a preset, in panel order. */
const groupChoices: readonly { group: PresetGroup; label: string }[] = [
  { group: 'tip', label: 'Tip and engine' },
  { group: 'size', label: 'Size' },
  { group: 'opacity', label: 'Opacity and flow' },
  { group: 'stroke', label: 'Smoothing and pressure' },
  { group: 'color', label: 'Colors' },
  { group: 'mixing', label: 'Color mixing' }
];

/** Short label of a preset's engine for its tile. */
function presetKind(preset: BrushPreset) {
  if (preset.settings.tool === 'eraser') {
    return 'Eraser';
  }

  const engine = preset.settings.engine?.id;
  return engine === 'abr' ? 'ABR' : engine === 'textured' ? 'Textured' : 'Round';
}
