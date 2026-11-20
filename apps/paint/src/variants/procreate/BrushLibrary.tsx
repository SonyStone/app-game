import type { BrushResource } from '@app-game/abr-paint/resources';
import type { JSX } from '@solidjs/web';
import type { Result } from 'neverthrow';
import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { legacySampledId } from '../../features/brush-library/nativeDocument';
import { StrokePreview } from '../../features/brush-library/StrokePreview';
import { SettingsBack, SettingsList, SettingsSplit } from '../../shared/ui/SettingsList';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './BrushLibrary.module.css';
import { brushSets, setOf, type BrushSet } from './brushSets';
import { PopoverHeader } from './Popover';

/**
 * Procreate's Brush Library: brush sets in a column on the left (a `SettingsList`), the chosen set's brushes on the
 * right as their names over sample strokes, the brush in use in blue, the two on one plate (`SettingsSplit`). Where a
 * host's container query makes the split narrow, the sets and a set's brushes are two screens, a tap on a set opening
 * its brushes under a way back. Choosing a brush applies it and keeps the
 * library open, as in Procreate; choosing a set only browses. The library opens on the set of the brush in use. `+`
 * imports ABR brushes.
 *
 * Drawn in the Procreate variant's colors (its `--pc-*` properties) by default. A host restyles it through
 * `--brush-library-sets` (the sets column's ground), `--brush-library-pane` (the brushes' ground),
 * `--brush-library-chosen` (the brush in use, and the chosen set's pill in Procreate's look), `--brush-library-ink`,
 * `--brush-library-quiet`, `--brush-library-line` (the hairline between the columns), `--brush-library-icon` and
 * `--brush-library-icon-ink` (the sets' icon tiles in the sidebar look), `--brush-library-disabled` (header commands
 * while brushes cannot be chosen), `--brush-library-height` (the columns' height), and in the sidebar look
 * `--brush-library-row-radius` and `--brush-library-icon-radius` (the corners of a set's or brush's row and of a set's
 * icon tile); `--brush-library-sample-radius` rounds a brush's stroke sample, square by default.
 *
 * With `own`, the brush in use, when it is one of the user's own (not built-in), shows Rename and Delete on its row,
 * beside its sample, drawn on `--brush-library-icon` tiles in `--brush-library-icon-ink`. Rename turns the name into a
 * text field with the name selected, Cancel and Confirm beside it: Enter confirms, Escape ends the renaming only, a
 * blank name cannot be confirmed. Delete takes the brush away at once, the brush in use moving to the next one listed
 * (or the one before), and its row becomes a strip that offers Undo until the deletion is final, a bar running out
 * the time left. Without `own` no brush offers either, as in Procreate's look.
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
   * Draws the sets as the Settings-style sidebar of LEGO's panels, each on its icon tile with its name and count, the
   * chosen one on an accent pill, instead of Procreate's plain names.
   */
  sidebar?: boolean;
  /** Renaming and deleting the user's own brushes; omitted, brushes can only be chosen. See `createOwnBrushes`. */
  own?: {
    /** Brushes being deleted, by id, with the time (`Date.now()`) their deletion becomes final. */
    deleting: ReadonlyMap<string, number>;
    /** Renames brush `id`; `name` is not blank. */
    rename: (id: string, name: string) => void;
    /** Deletes brush `id` undoably; `next` is the brush to use instead when `id` is in use. */
    remove: (id: string, next?: string) => void;
    undo: (id: string) => void;
  };
}) {
  let picker: HTMLInputElement | undefined;
  const sets = () => brushSets(props.presets, props.recent);
  const [chosen, setChosen] = createSignal(() => setOf(sets(), props.preset));
  /** The chosen set, or once it is gone, as after deleting its last brush, the set of the brush in use. */
  const shown = () =>
    sets().find((set) => set.id === chosen()) ?? sets().find((set) => set.id === setOf(sets(), props.preset));
  /** The brush whose name is being edited; choosing another brush ends the renaming. */
  const [renaming, setRenaming] = createSignal<string | undefined>(() => {
    void props.preset;
    return undefined;
  });
  const deleting = (id: string) => props.own?.deleting.get(id);
  /**
   * The brush to use instead of `id` once it is deleted: the next one in the shown set that stays, else the one before.
   */
  const successor = (id: string) => {
    const staying = (shown()?.presets ?? []).filter((preset) => preset.id === id || deleting(preset.id) === undefined);
    const index = staying.findIndex((preset) => preset.id === id);
    return (staying[index + 1] ?? staying[index - 1])?.id;
  };
  /** The screen shown where the sets and the brushes are two screens. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');

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
                (!!p.abrDocument || ['round', legacySampledId].includes(p.settings.engine?.id ?? 'round'))
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
      <SettingsSplit
        class={props.sidebar ? `${styles.columns} ${styles.sidebar}` : styles.columns}
        view={view()}
        list={
          <SettingsList
            class={styles.sets}
            label="Brush sets"
            items={sets().map((set) => ({
              id: set.id,
              label: set.name,
              icon: setIcons[set.id],
              trailing: String(set.presets.filter((preset) => deleting(preset.id) === undefined).length)
            }))}
            selected={shown()?.id}
            onSelect={(id) => {
              setChosen(id as BrushSet['id']);
              setView('detail');
            }}
          />
        }
      >
        <div class={styles.brushPane}>
          <SettingsBack label="Sets" title={shown()?.name ?? ''} onBack={() => setView('list')} />
          <div class={styles.brushes} role="listbox" aria-label={`${shown()?.name ?? ''} brushes`}>
            <For each={shown()?.presets ?? []} keyed={(preset) => preset.id}>
              {(preset) => {
                const sample = () => (
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
                );
                const selected = () => preset().id === props.preset;
                const editable = () => !!props.own && !preset().builtIn && selected();

                return (
                  <Show
                    when={deleting(preset().id) === undefined}
                    fallback={
                      <DeletedBrush
                        name={preset().name}
                        expires={deleting(preset().id)!}
                        onUndo={() => props.own?.undo(preset().id)}
                      />
                    }
                  >
                    <div class={styles.row} data-actions={editable() && renaming() !== preset().id ? '' : undefined}>
                      <Show
                        when={editable() && renaming() === preset().id}
                        fallback={
                          <button
                            class={styles.brush}
                            role="option"
                            aria-selected={selected() ? 'true' : 'false'}
                            disabled={props.disabled}
                            onClick={() => props.onChoose(preset().id)}
                          >
                            <span class={styles.brushName}>{preset().name}</span>
                            {sample()}
                          </button>
                        }
                      >
                        <div class={styles.brush} role="option" aria-selected="true" aria-label={preset().name}>
                          <BrushName
                            name={preset().name}
                            onConfirm={(name) => {
                              setRenaming(undefined);
                              props.own?.rename(preset().id, name);
                            }}
                            onCancel={() => setRenaming(undefined)}
                          />
                          {sample()}
                        </div>
                      </Show>
                      <Show when={editable() && renaming() !== preset().id}>
                        <div class={styles.rowActions} role="group" aria-label={`${preset().name} actions`}>
                          <button
                            type="button"
                            aria-label="Rename brush"
                            title="Rename"
                            disabled={props.disabled}
                            onClick={() => setRenaming(preset().id)}
                          >
                            <SketchIcon name="rename" size={18} />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete brush"
                            title="Delete"
                            disabled={props.disabled}
                            onClick={() => props.own?.remove(preset().id, successor(preset().id))}
                          >
                            <SketchIcon name="trash" size={18} />
                          </button>
                        </div>
                      </Show>
                    </div>
                  </Show>
                );
              }}
            </For>
          </div>
        </div>
      </SettingsSplit>
      {props.footer}
    </>
  );
}

/**
 * A brush's name being edited in place: a text field starting with `name`, focused with its text selected, then
 * Cancel and Confirm as fused icon tiles. Enter confirms and Escape cancels, the key going no further, so the popup
 * holding the library stays open. Confirm is off while the name is blank.
 */
function BrushName(props: { name: string; onConfirm: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = createSignal(untrack(() => props.name));
  const [field, setField] = createSignal<HTMLInputElement>();
  createEffect(field, (element) => {
    if (element) {
      element.focus({ preventScroll: true });
      element.select();
    }
  });
  const blank = () => value().trim() === '';
  const confirm = () => {
    if (!blank()) {
      props.onConfirm(value().trim());
    }
  };

  return (
    <div class={styles.naming} role="group" aria-label="Rename brush">
      <input
        ref={setField}
        class={styles.namingField}
        type="text"
        aria-label="Brush name"
        value={value()}
        maxlength={80}
        autocomplete="off"
        spellcheck={false}
        enterkeyhint="done"
        onInput={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            confirm();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            props.onCancel();
          }
        }}
      />
      <button type="button" aria-label="Cancel renaming" onClick={() => props.onCancel()}>
        <SketchIcon name="close" size={18} />
      </button>
      <button type="button" class={styles.confirm} aria-label="Confirm name" disabled={blank()} onClick={confirm}>
        <SketchIcon name="check" size={18} />
      </button>
    </div>
  );
}

/**
 * The row of a brush being deleted: its name struck through and, where its sample was, a bar running out the time
 * until `expires` (`Date.now()` time) beside Undo.
 */
function DeletedBrush(props: { name: string; expires: number; onUndo: () => void }) {
  const left = untrack(() => Math.max(0, props.expires - Date.now()));

  return (
    <div class={styles.deleted} role="group" aria-label={`${props.name} deleted`}>
      <span class={styles.brushName}>{props.name}</span>
      <div class={styles.deletedLine}>
        <span class={styles.countdown} style={{ 'animation-duration': `${left}ms` }} />
        <button type="button" class={styles.undo} aria-label="Undo delete" onClick={() => props.onUndo()}>
          <SketchIcon name="undo" size={16} />
          Undo
        </button>
      </div>
    </div>
  );
}

/** The sets' icons, on their tiles in the sidebar look. */
const setIcons: Record<BrushSet['id'], SketchIconName> = {
  recent: 'localUndo',
  basic: 'brush',
  imported: 'folder',
  mine: 'pencil'
};
