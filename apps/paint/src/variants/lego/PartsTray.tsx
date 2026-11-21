import { editable } from '@app-game/paint-core/input';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { PickerScale } from '../../shared/ui/createPickerPixels';
import { SettingsBack, SettingsList, SettingsSplit } from '../../shared/ui/SettingsList';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { partData, partsBounds, type Part } from './board';
import { joinsAttribute, partJoins } from './fusion';
import { useGrid } from './grid';
import { type createKits, type Kit } from './kits';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';
import { PartFrame } from './PartFrame';
import { boxSections, kindLabel, lookOf, partGroup } from './parts';
import { opaqueData } from './partStorage';
import dialogStyles from './PartsTray.module.css';

/**
 * The catalog of parts and kits while editing, shown as a modal Sidebar dialog matching `OptionsSheet` and
 * `BrushStudioDialog`: a search bar across the top with `Reset board` and `Done`, above a `SettingsSplit` whose
 * sidebar lists `Kits` and every part family with counts (`SettingsList`); on narrow screens, categories and a
 * category's items become two screens with `SettingsBack`.
 *
 * Nothing mounts while `open` is false; category and screen choices are kept across openings while search clears.
 * While `away` is true (a part or kit is being dragged onto the 1:1 board), the dialog fades and slides out on the GPU
 * without blocking pointer events.
 */
export function PartsTray(props: {
  open: boolean;
  /** Whether the dialog moves out of the way while a lifted part or kit is carried over the 1:1 board. */
  away?: boolean;
  presets: LegoServices['presets']['all'];
  kits: ReturnType<typeof createKits>;
  /** Part kinds currently on the board, shown with an "On board" mark in the catalog. */
  onBoard?: ReadonlySet<string>;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  onClose: () => void;
  /** The kit to light up and bring into view: one just kept, or the one a kept part or group matched. */
  flashKit: string | undefined;
}) {
  const [categoryId, setCategoryId] = createSignal('Tools');
  /** The screen shown where the categories and a category's parts are two screens. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [query, setQuery] = createSignal(() => {
    void props.open;
    return '';
  });

  const families = () => partFamilies(props.presets);
  const categories = createMemo(() => [
    { id: kitsCategoryId, title: kitsCategoryId, count: props.kits.kits().length },
    ...families().map((entry) => ({ id: entry.id, title: entry.title, count: entry.kinds.length }))
  ]);
  const selectedCategory = () =>
    categories().find((candidate) => candidate.id === categoryId()) ?? categories()[0]!;
  const selectedFamily = () => families().find((candidate) => candidate.id === categoryId());

  const needle = createMemo(() => query().trim().toLowerCase());
  const matchingFamilies = createMemo(() => {
    const search = needle();
    if (!search) {
      return [];
    }

    const presets = props.presets();
    return families()
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        kinds: entry.kinds.filter((kind) => {
          const label = kind === 'floating' ? 'Floating panel' : kindLabel(kind, presets);
          return label.toLowerCase().includes(search) || entry.title.toLowerCase().includes(search);
        })
      }))
      .filter((entry) => entry.kinds.length > 0);
  });
  const matchingKits = createMemo(() => {
    const all = props.kits.kits();
    const search = needle();
    if (!search) {
      return all;
    }

    if (kitsCategoryId.toLowerCase().includes(search)) {
      return all;
    }

    return all.filter((kit) => kit.name.toLowerCase().includes(search));
  });

  return (
    <Show when={props.open}>
      <CatalogDialog />
    </Show>
  );

  /** Owns the modal dialog element while open; unmounting releases all part and kit previews. */
  function CatalogDialog() {
    const [dialog, setDialog] = createSignal<HTMLDialogElement>();
    createEffect(dialog, (element) => {
      if (element && !element.open) {
        element.tabIndex = -1;
        showModal(element);
      }
    });

    return (
      <dialog
        ref={setDialog}
        class={dialogStyles.dialog}
        data-away={props.away ? '' : undefined}
        aria-label="Parts"
        onCancel={(event) => {
          event.preventDefault();
          if (query()) {
            setQuery('');
            return;
          }

          props.onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            if (query()) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
              return;
            }

            if (editable(event.target)) {
              event.preventDefault();
            }
          }

          event.stopPropagation();
        }}
        onKeyUp={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
      >
        <div class={dialogStyles.frame}>
          <div class={dialogStyles.header}>
            <div class={dialogStyles.searchPlate}>
              <label class={dialogStyles.search}>
                <SketchIcon name="zoom" size={16} />
                <input
                  type="search"
                  class={dialogStyles.searchInput}
                  aria-label="Search parts"
                  placeholder="Search parts and kits…"
                  value={query()}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && query()) {
                      event.preventDefault();
                      event.stopPropagation();
                      setQuery('');
                    }
                  }}
                />
                <Show when={query().length > 0}>
                  <button
                    type="button"
                    class={dialogStyles.searchClear}
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    <SketchIcon name="close" size={14} />
                  </button>
                </Show>
              </label>
            </div>
            <div class={dialogStyles.actions}>
              <button type="button" class={dialogStyles.reset} onClick={() => props.onReset()}>
                Reset board
              </button>
              <button type="button" class={dialogStyles.done} onClick={() => props.onClose()}>
                Done
              </button>
            </div>
          </div>

          <SettingsSplit
            class={dialogStyles.sheet}
            view={needle() ? 'detail' : view()}
            list={
              <div class={dialogStyles.side}>
                <h1 class={dialogStyles.name}>Parts</h1>
                <SettingsList
                  class={dialogStyles.list}
                  label="Families of parts"
                  items={categories().map((candidate) => ({
                    id: candidate.id,
                    label: candidate.title,
                    icon: familyIcons[candidate.id] ?? 'tools',
                    trailing: String(candidate.count)
                  }))}
                  selected={selectedCategory().id}
                  onSelect={(id) => {
                    if (query()) {
                      setQuery('');
                    }

                    setCategoryId(id);
                    setView('detail');
                  }}
                />
              </div>
            }
          >
            <Show
              when={!needle()}
              fallback={
                <section class={dialogStyles.pane} aria-label="Search results">
                  <Show
                    when={matchingKits().length > 0 || matchingFamilies().length > 0}
                    fallback={<p class={dialogStyles.empty}>No matching parts or kits for “{query().trim()}”</p>}
                  >
                    <Show when={matchingKits().length > 0}>
                      <div class={dialogStyles.group}>
                        <h4 class={dialogStyles.groupHeading}>Kits</h4>
                        <div class={dialogStyles.kitsGrid}>
                          <For each={matchingKits()} keyed={(kit) => kit.id}>
                            {(kit) => (
                              <KitTile
                                kit={kit()}
                                kits={props.kits}
                                flash={props.flashKit === kit().id}
                                onLift={(event) => props.onLiftKit(event, kit())}
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                    <For each={matchingFamilies()} keyed={(group) => group.id}>
                      {(group) => (
                        <div class={dialogStyles.group}>
                          <h4 class={dialogStyles.groupHeading}>{group().title}</h4>
                          <div class={dialogStyles.grid}>
                            <For each={group().kinds}>
                              {(kind) => (
                                <PartTile
                                  kind={kind}
                                  presets={props.presets}
                                  onBoard={props.onBoard?.has(kind)}
                                  onLift={(event) => props.onLift(event, kind)}
                                />
                              )}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </section>
              }
            >
              <section class={dialogStyles.pane} aria-label={selectedCategory().title}>
                <SettingsBack label="Parts" title={selectedCategory().title} onBack={() => setView('list')} />
                <h2 class={dialogStyles.title}>{selectedCategory().title}</h2>
                <Show
                  when={selectedCategory().id !== kitsCategoryId}
                  fallback={
                    <Show
                      when={props.kits.kits().length > 0}
                      fallback={
                        <p class={dialogStyles.empty}>
                          No kits yet — select parts on the board and tap Keep as kit
                        </p>
                      }
                    >
                      <div class={dialogStyles.kitsGrid}>
                        <For each={props.kits.kits()} keyed={(kit) => kit.id}>
                          {(kit) => (
                            <KitTile
                              kit={kit()}
                              kits={props.kits}
                              flash={props.flashKit === kit().id}
                              onLift={(event) => props.onLiftKit(event, kit())}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  }
                >
                  <div class={dialogStyles.grid}>
                    <For each={selectedFamily()?.kinds ?? []}>
                      {(kind) => (
                        <PartTile
                          kind={kind}
                          presets={props.presets}
                          onBoard={props.onBoard?.has(kind)}
                          onLift={(event) => props.onLift(event, kind)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </section>
            </Show>
          </SettingsSplit>
        </div>
      </dialog>
    );
  }
}

const kitsCategoryId = 'Kits';

/** The icons of the categories in the catalog sidebar, by id. */
const familyIcons: Record<string, SketchIconName> = {
  Kits: 'folder',
  Plates: 'scene',
  Tools: 'tools',
  Color: 'hue',
  Values: 'sliders',
  Layers: 'layers',
  Brushes: 'brush'
};

/** The families of parts the catalog and the spawn menu offer: Plates, the box's sections, then the user's brushes. */
export function partFamilies(presets: LegoServices['presets']['all']) {
  const brushes = presets().map((preset) => `preset:${preset.id}`);
  return [
    { id: 'Plates', title: 'Plates', kinds: ['floating'] },
    ...boxSections,
    { id: 'Brushes', title: 'Brushes', kinds: brushes }
  ];
}

/** A part of `kind` as the catalog shows it: a one-cell sample with its name below; a press lifts a new one. */
export function PartTile(props: {
  kind: string;
  presets: LegoServices['presets']['all'];
  /** Whether a part of this kind is already placed on the board. */
  onBoard?: boolean;
  onLift: (event: PointerEvent) => void;
}) {
  const label = () => (props.kind === 'floating' ? 'Floating panel' : kindLabel(props.kind, props.presets()));
  return (
    <div class={styles.trayItem} data-on-board={props.onBoard ? '' : undefined}>
      <div
        class={styles.trayTile}
        title={label()}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          capture(event);
          props.onLift(event);
        }}
      >
        <div class={styles.content} inert>
          <Show when={props.kind !== 'floating'} fallback={<span class={styles.floatingSample} />}>
            <PartFrame mode="preview" kind={props.kind} span={{ columns: 1, rows: 1 }} onPopup={() => {}} />
          </Show>
        </div>
      </div>
      <span class={styles.trayCaption}>{label()}</span>
      <Show when={props.onBoard}>
        <span class={styles.trayOnBoard}>On board</span>
      </Show>
    </div>
  );
}

/**
 * A kit as the catalog shows it: its parts in miniature, at most `cells` cells across (three by default), with its
 * name; the user's own kits have a delete button. A press lifts a readable kit. Broken kits can only be removed.
 */
export function KitTile(props: {
  kit: Kit;
  kits: ReturnType<typeof createKits>;
  cells?: number;
  /** Lights the kit up and scrolls it into view. */
  flash?: boolean;
  onLift: (event: PointerEvent) => void;
}) {
  const broken = () => opaqueData in props.kit;
  const [tile, setTile] = createSignal<HTMLElement>();
  createEffect(
    () => (props.flash ? tile() : undefined),
    (element) => {
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  );

  return (
    <div ref={setTile} class={styles.trayItem} data-flash={props.flash ? '' : undefined}>
      <div
        class={styles.kitPreview}
        data-broken={broken() ? '' : undefined}
        title={`${broken() ? 'Broken kit' : 'Kit'}: ${props.kit.name}`}
        onPointerDown={(event) => {
          if (broken() || event.button !== 0) {
            return;
          }

          capture(event);
          props.onLift(event);
        }}
      >
        <Show when={!broken()} fallback={<span class={styles.brokenKit}>Broken kit</span>}>
          <KitPreview parts={props.kit.parts} cells={props.cells ?? 3} />
        </Show>
        <Show when={props.kits.isSaved(props.kit.id)}>
          <button
            type="button"
            class={styles.kitRemove}
            aria-label={`Delete kit ${props.kit.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => props.kits.remove(props.kit.id)}
          >
            ×
          </button>
        </Show>
      </div>
      <Show
        when={props.kits.isSaved(props.kit.id) && !broken()}
        fallback={<span class={styles.trayCaption}>{props.kit.name}</span>}
      >
        <KitName name={props.kit.name} onRename={(name) => props.kits.rename(props.kit.id, name)} />
      </Show>
    </div>
  );
}

/** A kit of the user's name, which a tap turns into a field to rename it; Enter or leaving it keeps the name. */
function KitName(props: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = createSignal(false);
  const keep = (field: HTMLInputElement) => {
    const name = field.value.trim();
    setEditing(false);
    if (name && name !== props.name) {
      props.onRename(name);
    }
  };

  return (
    <Show
      when={editing()}
      fallback={
        <button
          type="button"
          class={[styles.trayCaption, styles.kitName]}
          title="Rename"
          onClick={() => setEditing(true)}
        >
          {props.name}
        </button>
      }
    >
      <input
        ref={(field) => queueMicrotask(() => field.select())}
        class={styles.kitNameField}
        value={props.name}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            keep(event.currentTarget);
          }

          if (event.key === 'Escape') {
            event.stopPropagation();
            setEditing(false);
          }
        }}
        onBlur={(event) => keep(event.currentTarget)}
      />
    </Show>
  );
}

/**
 * A kit's parts laid out as on a panel at full size, the block being carried; see `KitPreview` for the catalog's
 * miniature.
 */
export function BlockView(props: { parts: readonly Part[]; immediate?: boolean }) {
  const grid = useGrid();
  const bounds = () => partsBounds(props.parts);
  const joins = createMemo(() => partJoins(props.parts, partGroup));

  return (
    <For each={props.parts} keyed={(part) => part.id}>
      {(part) => (
        <div
          class={styles.part}
          data-joins={joinsAttribute(joins().get(part().id))}
          style={{
            left: `${(part().cell.column - bounds().column) * grid.pitch()}px`,
            top: `${(part().cell.row - bounds().row) * grid.pitch()}px`,
            width: `${grid.length(part().span.columns)}px`,
            height: `${grid.length(part().span.rows)}px`
          }}
        >
          <div class={styles.content} inert>
            <PartFrame
              mode="preview"
              immediate={props.immediate}
              kind={part().kind}
              missing={!!part()[partData]?.invalid}
              span={part().span}
              look={lookOf(part(), grid.room(part().span))}
              onPopup={() => {}}
            />
          </div>
        </div>
      )}
    </For>
  );
}

/** A kit scaled down to at most `cells` cells either way, on a plate like a panel's. */
function KitPreview(props: { parts: readonly Part[]; cells: number }) {
  const grid = useGrid();
  const size = () => {
    const bounds = partsBounds(props.parts);
    return { width: grid.length(bounds.columns), height: grid.length(bounds.rows) };
  };
  const scale = () =>
    Math.min(1, (props.cells * grid.cell()) / size().width, (props.cells * grid.cell()) / size().height);

  return (
    <div
      class={styles.kitPlate}
      style={{
        width: `${size().width * scale() + 8}px`,
        height: `${size().height * scale() + 8}px`,
        '--kit-scale': `${scale()}`
      }}
    >
      <div
        class={styles.kitScaled}
        style={{ width: `${size().width}px`, height: `${size().height}px`, scale: `${scale()}` }}
        inert
      >
        <PickerScale value={scale}>
          <BlockView parts={props.parts} />
        </PickerScale>
      </div>
    </div>
  );
}

/** Captures the press's pointer for its target so moves continue while the dialog slides away. */
function capture(event: PointerEvent) {
  try {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  } catch {
    // Capture unsupported, as in jsdom; the board still tracks window listeners.
  }
}

/** Opens `element` as a modal dialog, or merely open where the environment has no modal dialogs, as jsdom. */
function showModal(element: HTMLDialogElement) {
  if (typeof element.showModal === 'function') {
    element.showModal();
  } else {
    element.setAttribute('open', '');
  }
}
