import { editable } from '@app-game/paint-core/input';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, For, Show, untrack } from 'solid-js';
import { PickerScale } from '../../shared/ui/createPickerPixels';
import {
  SettingsBack,
  SettingsList,
  SettingsRows,
  SettingsSplit,
  type SettingsListItem
} from '../../shared/ui/SettingsList';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { partData, partsBounds, type Part, type Span } from './board';
import { FileCommands, type FileCommandSet } from './FileMenu';
import { joinsAttribute, partJoins } from './fusion';
import { useGrid } from './grid';
import { type createKits, type Kit } from './kits';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';
import { PartFrame } from './PartFrame';
import { boxSections, kindLabel, lookOf, partDefaultSpan, partGroup } from './parts';
import { gridSizeKind } from './parts/options';
import { opaqueData } from './partStorage';
import dialogStyles from './PartsTray.module.css';
import { WorkspacePreview } from './WorkspacePreview';
import type { WorkspaceControls } from './workspaces';

/** Which group of sections the unified Options & Parts dialog opens on. */
export type CatalogTarget = 'interface' | 'parts';

/**
 * The unified Options & Parts modal Sidebar dialog: one plate, a `SettingsSplit` whose sidebar holds the title with
 * `Done`, the search field, and under them two groups (`Settings` with `File`, `Workspaces` and `Interface`, and
 * `Parts` with `Kits` and every part family with counts); on narrow screens, sections and their content become two
 * screens with `SettingsBack`.
 *
 * `Workspaces`, offered when the editor has `workspaces`, lists them with a miniature of each board, the active one
 * marked: a tap switches at once and leaves the dialog open. Under the list are `Edit layout` and `Reset workspace`,
 * which restores the active workspace's original board (for Custom, the board a first visit had).
 *
 * `File` lists the File menu's commands (`FileCommands`), so they are at hand with nothing on the board; a command
 * closes the dialog once it ran or a file was picked, and waits for the engine as in the menu.
 *
 * Opening via `Options` (`initial="interface"`) lands on `Interface` (grid size slider, live `GridSample`, `Edit
 * layout`, and `Reset board` where there are no workspaces to reset instead); opening via `＋ Parts` (`initial="parts"`) lands on the last selected `Parts` category
 * (default `Tools`). From any section, typing in search filters every part and kit, and dragging a part or kit out
 * slides the dialog away (`data-away`) onto the live 1:1 board—whether in edit mode or live mode. Nothing mounts while
 * `open` is false.
 */
export function PartsTray(props: {
  open: boolean;
  /** Which section opens when `open` turns true: `interface` (from Options) or last `parts` category (from ＋ Parts). */
  initial?: CatalogTarget;
  /** Whether the dialog moves out of the way while a lifted part or kit is carried over the 1:1 board. */
  away?: boolean;
  presets: LegoServices['presets']['all'];
  kits: ReturnType<typeof createKits>;
  /** The drawing's file commands for `File`, each guarded by the host so failures are reported. */
  files: FileCommandSet;
  /** Part kinds currently on the board, shown with an "On board" mark in the catalog. */
  onBoard?: ReadonlySet<string>;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  /** Closes the dialog and enters layout edit mode when supplied. */
  onEditLayout?: () => void;
  onClose: () => void;
  /** The kit to light up and bring into view: one just kept, or the one a kept part or group matched. */
  flashKit: string | undefined;
  /** The editor's workspaces, listed under `Workspaces`; without them the section is left out. */
  workspaces?: WorkspaceControls;
}) {
  const [lastPartCategory, setLastPartCategory] = createSignal('Tools');
  const [categoryId, setCategoryId] = createSignal(() => {
    if (!props.open) {
      return untrack(lastPartCategory);
    }

    return props.initial === 'interface' ? interfaceCategoryId : untrack(lastPartCategory);
  });
  const [frame, setFrame] = createSignal<HTMLElement>();
  const frameSize = createElementSize(frame);
  /** Whether the sidebar and a section's content are two screens, as `.sheet` turns narrow in the stylesheet. */
  const narrow = () => (frameSize.width ?? Infinity) < narrowFrame;
  /** The screen shown where the sidebar and a section's content are two screens. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [query, setQuery] = createSignal(() => {
    void props.open;
    return '';
  });

  const families = () => partFamilies(props.presets);
  const sidebarItems = createMemo<readonly SettingsListItem[]>(() => [
    { id: fileCategoryId, label: 'File', icon: 'paper', group: 'settings' },
    ...(props.workspaces
      ? [{ id: workspacesCategoryId, label: 'Workspaces', icon: 'workspace' as const, group: 'settings' }]
      : []),
    { id: interfaceCategoryId, label: 'Interface', icon: 'options', group: 'settings' },
    {
      id: kitsCategoryId,
      label: kitsCategoryId,
      icon: familyIcons[kitsCategoryId],
      trailing: String(props.kits.kits().length),
      group: 'parts'
    },
    ...families().map((entry) => ({
      id: entry.id,
      label: entry.title,
      icon: familyIcons[entry.id] ?? 'tools',
      trailing: String(entry.kinds.length),
      group: 'parts'
    }))
  ]);
  const selectedItem = () => sidebarItems().find((candidate) => candidate.id === categoryId()) ?? sidebarItems()[0]!;
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

    /**
     * What the search found: kits, then parts by family. It takes the section's place beside the sidebar, and where
     * the two are separate screens it takes the list's place under the search field, so the field stays in hand.
     */
    const Results = () => (
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
    );

    return (
      <dialog
        ref={setDialog}
        class={dialogStyles.dialog}
        data-away={props.away ? '' : undefined}
        aria-label="Parts and Options"
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
        <div ref={setFrame} class={dialogStyles.frame}>
          <SettingsSplit
            class={dialogStyles.sheet}
            view={needle() ? (narrow() ? 'list' : 'detail') : view()}
            list={
              <div class={dialogStyles.side}>
                <div class={dialogStyles.sideHead}>
                  <h1 class={dialogStyles.name}>Parts &amp; Options</h1>
                  <button type="button" class={dialogStyles.done} onClick={() => props.onClose()}>
                    Done
                  </button>
                </div>
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
                <Show when={!(needle() && narrow())} fallback={<Results />}>
                  <SettingsList
                    class={dialogStyles.list}
                    label="Parts and options"
                    groups={sidebarGroups}
                    items={sidebarItems()}
                    selected={selectedItem().id}
                    onSelect={(id) => {
                      if (query()) {
                        setQuery('');
                      }

                      if (id !== interfaceCategoryId && id !== fileCategoryId && id !== workspacesCategoryId) {
                        setLastPartCategory(id);
                      }

                      setCategoryId(id);
                      setView('detail');
                    }}
                  />
                </Show>
              </div>
            }
          >
            <Show when={!needle()} fallback={<Results />}>
              <section class={dialogStyles.pane} aria-label={selectedItem().label} data-section={selectedItem().id}>
                <SettingsBack label="Sections" title={selectedItem().label} onBack={() => setView('list')} />
                <h2 class={dialogStyles.title}>{selectedItem().label}</h2>
                <Show
                  when={selectedItem().group !== 'settings'}
                  fallback={
                    <Show
                      when={selectedItem().id !== workspacesCategoryId || !props.workspaces}
                      fallback={
                        <WorkspacesSection
                          workspaces={props.workspaces!}
                          onEditLayout={props.onEditLayout}
                          onReset={props.onReset}
                        />
                      }
                    >
                      <Show
                        when={selectedItem().id !== fileCategoryId}
                        fallback={
                          <SettingsRows
                            class={`${styles.settingsRows} ${dialogStyles.fileRows}`}
                            role="menu"
                            label="File commands"
                          >
                            <FileCommands commands={props.files} onDone={() => props.onClose()} />
                          </SettingsRows>
                        }
                      >
                        <div class={dialogStyles.interface}>
                          <div class={[styles.studioTile, dialogStyles.setting]}>
                            <PartFrame kind={gridSizeKind} span={settingSpan} look="slider" />
                          </div>
                          <GridSample />
                          <div class={dialogStyles.interfaceActions}>
                            <Show when={props.onEditLayout}>
                              {(editLayout) => (
                                <button type="button" class={dialogStyles.actionTile} onClick={() => editLayout()()}>
                                  <SketchIcon name="edit" size={18} />
                                  <span>Edit layout</span>
                                </button>
                              )}
                            </Show>
                            <Show when={!props.workspaces}>
                              <button
                                type="button"
                                class={dialogStyles.actionSecondary}
                                onClick={() => props.onReset()}
                              >
                                <SketchIcon name="reset" size={18} />
                                <span>Reset board</span>
                              </button>
                            </Show>
                          </div>
                        </div>
                      </Show>
                    </Show>
                  }
                >
                  <Show
                    when={selectedItem().id !== kitsCategoryId}
                    fallback={
                      <Show
                        when={props.kits.kits().length > 0}
                        fallback={
                          <p class={dialogStyles.empty}>No kits yet — select parts on the board and tap Keep as kit</p>
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
                </Show>
              </section>
            </Show>
          </SettingsSplit>
        </div>
      </dialog>
    );
  }
}

/** The frame width in CSS pixels under which the dialog shows one screen at a time; `PartsTray.module.css` agrees. */
const narrowFrame = 560;

const fileCategoryId = 'file';
const workspacesCategoryId = 'workspaces';
const interfaceCategoryId = 'interface';
const kitsCategoryId = 'Kits';

const sidebarGroups = [
  { id: 'settings', label: 'Settings' },
  { id: 'parts', label: 'Parts' }
] as const;

/**
 * The Workspaces section: a card per workspace with its board in miniature, its name and whether it is the active one
 * or holds the user's edits; a tap on a card switches to it. Under them, Edit layout for the active workspace and
 * Reset workspace, which brings back its original board (`onReset` resets the active board).
 */
function WorkspacesSection(props: { workspaces: WorkspaceControls; onEditLayout?: () => void; onReset: () => void }) {
  const activeName = () =>
    props.workspaces.list.find((workspace) => workspace.id === props.workspaces.active())?.name ?? '';

  return (
    <div class={dialogStyles.interface}>
      <div class={dialogStyles.workspaces} role="listbox" aria-label="Workspaces">
        <For each={props.workspaces.list}>
          {(workspace) => {
            const active = () => props.workspaces.active() === workspace.id;
            const edited = () => workspace.id !== 'custom' && props.workspaces.edited(workspace.id);
            return (
              <button
                type="button"
                role="option"
                class={dialogStyles.workspaceCard}
                aria-selected={active() ? 'true' : 'false'}
                data-workspace={workspace.id}
                data-active={active() ? '' : undefined}
                onClick={() => props.workspaces.switchTo(workspace.id)}
              >
                <span class={dialogStyles.workspaceThumb}>
                  <WorkspacePreview board={props.workspaces.boardOf(workspace.id)} view={props.workspaces.view()} />
                </span>
                <span class={dialogStyles.workspaceName}>{workspace.name}</span>
                <span class={dialogStyles.workspaceMeta}>{active() ? 'Active' : edited() ? 'Edited' : '\u00a0'}</span>
              </button>
            );
          }}
        </For>
      </div>
      <div class={dialogStyles.interfaceActions}>
        <Show when={props.onEditLayout}>
          {(editLayout) => (
            <button type="button" class={dialogStyles.actionTile} onClick={() => editLayout()()}>
              <SketchIcon name="edit" size={18} />
              <span>Edit layout</span>
            </button>
          )}
        </Show>
        <button
          type="button"
          class={dialogStyles.actionSecondary}
          title={`Bring back the original ${activeName()} layout`}
          onClick={() => props.onReset()}
        >
          <SketchIcon name="reset" size={18} />
          <span>Reset workspace</span>
        </button>
      </div>
    </div>
  );
}

/** The span the grid-size slider shows at in Interface, matching brush studio rows. */
const settingSpan: Span = { columns: 6, rows: 1 };

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

/**
 * A part of `kind` as the catalog or spawn menu shows it: rendered at its `partDefaultSpan(kind)` with its matching
 * automatic look, scaled through `PickerScale` to fit neatly inside the card's preview slot. A press lifts a new one.
 */
export function PartTile(props: {
  kind: string;
  presets: LegoServices['presets']['all'];
  /** Whether a part of this kind is already placed on the board. */
  onBoard?: boolean;
  /** Compact preview slot for the radial spawn menu. */
  compact?: boolean;
  onLift: (event: PointerEvent) => void;
}) {
  const grid = useGrid();
  const label = () => (props.kind === 'floating' ? 'Floating panel' : kindLabel(props.kind, props.presets()));
  const span = () => partDefaultSpan(props.kind);
  const size = () => ({ width: grid.length(span().columns), height: grid.length(span().rows) });
  const slot = () => (props.compact ? compactPreviewBox : catalogPreviewBox);
  const scale = () => Math.min(1, slot().width / size().width, slot().height / size().height);
  const look = () =>
    props.kind === 'floating' ? undefined : lookOf({ kind: props.kind, span: span() }, grid.room(span()));
  const multiCell = () => span().columns > 1 || span().rows > 1;

  return (
    <div
      class={styles.trayItem}
      data-on-board={props.onBoard ? '' : undefined}
      data-compact={props.compact ? '' : undefined}
    >
      <div class={styles.trayPreviewSlot} data-compact={props.compact ? '' : undefined}>
        <div
          class={styles.trayTile}
          title={label()}
          data-span={`${span().columns}x${span().rows}`}
          style={{
            width: `${size().width * scale()}px`,
            height: `${size().height * scale()}px`,
            '--tile-scale': `${scale()}`
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            capture(event);
            props.onLift(event);
          }}
        >
          <div
            class={styles.trayScaled}
            style={{ width: `${size().width}px`, height: `${size().height}px`, scale: `${scale()}` }}
            inert
          >
            <PickerScale value={scale}>
              <div class={styles.content}>
                <Show when={props.kind !== 'floating'} fallback={<span class={styles.floatingSample} />}>
                  <PartFrame mode="preview" kind={props.kind} span={span()} look={look()} onPopup={() => {}} />
                </Show>
              </div>
            </PickerScale>
          </div>
        </div>
      </div>
      <span class={styles.trayCaption}>{label()}</span>
      <Show when={(!props.compact && multiCell()) || props.onBoard}>
        <div class={styles.trayMeta}>
          <Show when={!props.compact && multiCell()}>
            <span class={styles.traySpan}>
              {span().columns}×{span().rows}
            </span>
          </Show>
          <Show when={props.onBoard}>
            <span class={styles.trayOnBoard}>On board</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Maximum CSS-pixel preview slot inside a catalog card vs a compact spawn-menu card. */
const catalogPreviewBox = { width: 136, height: 80 };
const compactPreviewBox = { width: 84, height: 52 };

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

/**
 * A small plate of real parts lying on paper as on the board, drawn at the cell in use, so the grid size shows what it
 * does while the dialog covers the board: a slider fused with a knob, then undo and redo, and the eraser fused with
 * the lasso and the fill. The parts are previews: they show the session's values and take no presses.
 */
function GridSample() {
  const grid = useGrid();
  const bounds = partsBounds(sampleParts);

  return (
    <div class={dialogStyles.sampleGround} data-grid-sample>
      <div class={dialogStyles.samplePlate}>
        <div
          class={dialogStyles.sampleParts}
          style={{ width: `${grid.length(bounds.columns)}px`, height: `${grid.length(bounds.rows)}px` }}
        >
          <BlockView parts={sampleParts} immediate />
        </div>
      </div>
    </div>
  );
}

/** The sample's parts; the knob keeps its look at every cell, as a part whose look was chosen does. */
const sampleParts: readonly Part[] = [
  { id: 'size', kind: 'value:size', cell: { column: 0, row: 0 }, span: { columns: 4, rows: 1 } },
  {
    id: 'opacity',
    kind: 'value:opacity',
    cell: { column: 4, row: 0 },
    span: { columns: 1, rows: 1 },
    looks: { '1x1': 'knob' }
  },
  { id: 'undo', kind: 'action:undo', cell: { column: 0, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'redo', kind: 'action:redo', cell: { column: 1, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'eraser', kind: 'action:eraser', cell: { column: 2, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'lasso', kind: 'action:lasso', cell: { column: 3, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'fill', kind: 'action:fill', cell: { column: 4, row: 1 }, span: { columns: 1, rows: 1 } }
];

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
