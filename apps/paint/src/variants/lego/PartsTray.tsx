import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show } from 'solid-js';
import { PickerScale } from '../../shared/ui/createPickerPixels';
import { SettingsBack, SettingsList, SettingsSplit } from '../../shared/ui/SettingsList';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { partData, partsBounds, type Part } from './board';
import { type createSheet } from './createSheet';
import { joinsAttribute, partJoins } from './fusion';
import { useGrid } from './grid';
import { type createKits, type Kit } from './kits';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';
import { PartFrame } from './PartFrame';
import { boxSections, kindLabel, lookOf, partGroup } from './parts';
import { opaqueData } from './partStorage';

/**
 * The box of parts while editing, a sheet pulled up from the bottom edge (see `createSheet`): a wheel turned over the
 * board or the sheet moves its edge, as does a drag on its handle, and a tap on the handle opens or closes it.
 *
 * A search bar across the top filters every family's parts, brushes and kits at once beside Reset board. Below it, the
 * parts are chosen by family in a Settings-style sidebar (`SettingsList`) beside the chosen family's parts
 * (`SettingsSplit`), with an indicator on parts already on the board; where the parts area is narrow, families and a
 * family's parts become two screens with a way back. Beside the parts (under them on narrow screens) sits the Kits
 * shelf: live miniature previews to drag out, rename or delete, and a drop target that saves any dragged part, group
 * or panel from the board as a kit. Dropping on the parts area or the sunk strip puts a part away.
 */
export function PartsTray(props: {
  presets: LegoServices['presets']['all'];
  kits: ReturnType<typeof createKits>;
  sheet: ReturnType<typeof createSheet>;
  /** Part kinds currently on the board, shown with an "On board" mark in the catalog. */
  onBoard?: ReadonlySet<string>;
  /** Whether a part or kit carried over the sheet would be put away there. */
  over: boolean;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  ref: (element: HTMLElement) => void;
  /** The kits shelf, where a part, group or panel from the board is dropped to be kept as a kit. */
  kitsRef: (element: HTMLElement | undefined) => void;
  /** Whether something carried over the kits would be kept as one. */
  overKits: boolean;
  /** The kit to light up and bring into view: one just kept, or the one a kept part or group matched. */
  flashKit: string | undefined;
}) {
  const grid = useGrid();
  const [body, setBody] = createSignal<HTMLElement>();
  const [pane, setPane] = createSignal<HTMLElement>();
  const [shelf, setShelf] = createSignal<HTMLElement>();
  const [familyId, setFamilyId] = createSignal('Tools');
  /** The screen shown where the families and the parts are two screens. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [query, setQuery] = createSignal('');
  const families = () => partFamilies(props.presets);
  const family = () => families().find((candidate) => candidate.id === familyId()) ?? families()[0]!;
  const needle = createMemo(() => query().trim().toLowerCase());
  const matches = createMemo(() => {
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
  const shownKits = createMemo(() => {
    const all = props.kits.kits();
    const search = needle();
    if (!search) {
      return all;
    }

    return all.filter((kit) => kit.name.toLowerCase().includes(search));
  });
  const closed = () => props.sheet.height() <= 0 && !props.sheet.sunk();
  const shownHeight = () => (props.sheet.sunk() ? sunkHeight : Math.max(grid.pitch(), props.sheet.height()));

  // A wheel over the board or the sheet moves its edge, and settles it once the wheel stops; over a scrollable list it
  // first scrolls that list, and moves the sheet only past its ends.
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(wheelTimer));
  createEventListener(
    window,
    'wheel',
    (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (event.ctrlKey || !target?.closest(`.${styles.board}, .${styles.tray}`)) {
        return;
      }

      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const familiesList = body()?.querySelector('nav');
      const list = [familiesList, pane(), shelf()].find((element) => element?.contains(target));
      if (list) {
        const atTop = list.scrollTop <= 0;
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
        if (!(delta < 0 && atTop) && !(delta > 0 && atBottom)) {
          return;
        }
      }

      event.preventDefault();
      props.sheet.follow(props.sheet.height() + delta);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => props.sheet.settle(delta > 0 ? 1 : -1), wheelSettle);
    },
    { passive: false }
  );

  return (
    <aside
      ref={props.ref}
      class={styles.tray}
      aria-label="Box of parts"
      data-closed={closed() ? '' : undefined}
      data-sunk={props.sheet.sunk() ? '' : undefined}
      data-over={props.over ? '' : undefined}
      data-keeps-panel
      style={{ height: `${shownHeight()}px` }}
    >
      <div class={styles.trayBar} onPointerDown={(event) => dragSheet(event, props.sheet)}>
        <span class={styles.trayGrip} aria-hidden="true" />
        <Show when={props.sheet.sunk()}>
          <span class={styles.trayTitle}>{props.over ? 'Drop to put it away' : 'Drop here to put it away'}</span>
        </Show>
        <Show when={closed()}>
          <span class={styles.trayTitle}>Parts</span>
        </Show>
      </div>
      <Show when={props.sheet.height() > 0 && !props.sheet.sunk()}>
        <Contents />
      </Show>
    </aside>
  );

  /** Owns the sheet's mounted refs, clearing hit targets when closed or sunk. */
  function Contents() {
    onSettled(() => () => {
      props.kitsRef(undefined);
      setBody(undefined);
      setPane(undefined);
      setShelf(undefined);
    });

    return (
      <div class={styles.trayContent}>
        <div class={styles.trayHeader}>
          <label class={styles.traySearch}>
            <SketchIcon name="zoom" size={16} />
            <input
              type="search"
              class={styles.traySearchInput}
              aria-label="Search parts"
              placeholder="Search parts and kits…"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query()) {
                  event.stopPropagation();
                  setQuery('');
                }
              }}
            />
            <Show when={query().length > 0}>
              <button
                type="button"
                class={styles.traySearchClear}
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <SketchIcon name="close" size={14} />
              </button>
            </Show>
          </label>
          <button type="button" class={styles.boxButton} onClick={() => props.onReset()}>
            Reset board
          </button>
        </div>
        <div class={styles.trayMain}>
          <div class={styles.trayShelves}>
            <div ref={setBody} class={styles.trayBody} data-over={props.over && !props.sheet.sunk() ? '' : undefined}>
            <Show
              when={!needle()}
              fallback={
                <section ref={setPane} class={styles.boxPane} aria-label="Search results">
                  <Show
                    when={matches().length > 0}
                    fallback={<p class={styles.trayEmpty}>No matching parts for “{query().trim()}”</p>}
                  >
                    <For each={matches()} keyed={(group) => group.id}>
                      {(group) => (
                        <div class={styles.traySearchGroup}>
                          <h4>{group().title}</h4>
                          <div class={styles.trayGrid}>
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
              <SettingsSplit
                class={styles.boxSplit}
                view={view()}
                list={
                  <SettingsList
                    class={styles.boxFamilies}
                    label="Families of parts"
                    items={families().map((candidate) => ({
                      id: candidate.id,
                      label: candidate.title,
                      icon: familyIcons[candidate.id] ?? 'tools',
                      trailing: String(candidate.kinds.length)
                    }))}
                    selected={family().id}
                    onSelect={(id) => {
                      setFamilyId(id);
                      setView('detail');
                    }}
                  />
                }
              >
                <section ref={setPane} class={styles.boxPane} aria-label={family().title}>
                  <SettingsBack label="Families" title={family().title} onBack={() => setView('list')} />
                  <div class={styles.trayGrid}>
                    <For each={family().kinds}>
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
                </section>
              </SettingsSplit>
            </Show>
            <Show when={props.over}>
              <span class={[styles.zoneLabel, styles.dropNote]}>Drop to put it away</span>
            </Show>
            </div>
          </div>
          <div
            ref={(element) => {
              setShelf(element);
              props.kitsRef(element);
            }}
            class={styles.kitShelf}
            data-over={props.overKits ? '' : undefined}
          >
            <span class={styles.zoneLabel}>
              {props.overKits ? 'Drop to keep as a kit' : 'Kits · drop here to keep'}
            </span>
            <Show
              when={shownKits().length > 0}
              fallback={<p class={styles.trayEmpty}>No matching kits</p>}
            >
              <div class={styles.trayItems}>
                <For each={shownKits()} keyed={(kit) => kit.id}>
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
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Moves the sheet's edge with the press `event` on its handle until it lifts, then settles it the way it was flung,
 * or on the nearest stop. A press that does not move opens a closed sheet to the middle and closes an open one.
 */
function dragSheet(event: PointerEvent, sheet: ReturnType<typeof createSheet>) {
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  const start = { y: event.clientY, height: sheet.height() };
  let last = { y: event.clientY, time: event.timeStamp };
  let speed = 0;
  let moved = false;

  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) {
      return;
    }

    moved ||= Math.abs(next.clientY - start.y) >= tapDistance;
    if (moved) {
      sheet.follow(start.height + start.y - next.clientY);
    }

    const time = Math.max(1, next.timeStamp - last.time);
    speed = (last.y - next.clientY) / time;
    last = { y: next.clientY, time: next.timeStamp };
  };
  const end = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) {
      return;
    }

    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', end);
    element.removeEventListener('pointercancel', end);
    if (!moved) {
      sheet.to(sheet.height() > 0 ? 'closed' : 'middle');
      return;
    }

    sheet.settle(speed > flingSpeed ? 1 : speed < -flingSpeed ? -1 : 0);
  };
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
}

/** CSS pixels of the strip a sunk sheet leaves. */
const sunkHeight = 56;

/** CSS pixels a press on the handle may move and still be a tap. */
const tapDistance = 6;

/** CSS pixels per millisecond a drag must end at to fling the sheet to the next stop rather than the nearest. */
const flingSpeed = 0.3;

/** Milliseconds after the last wheel turn the sheet settles on a stop. */
const wheelSettle = 160;

/** The icons of the families of parts by id, on their tiles in the box's sidebar. */
const familyIcons: Record<string, SketchIconName> = {
  Plates: 'scene',
  Tools: 'tools',
  Color: 'hue',
  Values: 'sliders',
  Layers: 'layers',
  Brushes: 'brush'
};

/** The families of parts the box and the spawn menu offer: the box's sections, then the user's brushes. */
export function partFamilies(presets: LegoServices['presets']['all']) {
  const brushes = presets().map((preset) => `preset:${preset.id}`);
  return [
    { id: 'Plates', title: 'Plates', kinds: ['floating'] },
    ...boxSections,
    { id: 'Brushes', title: 'Brushes', kinds: brushes }
  ];
}

/** A part of `kind` as the box shows it: a one-cell sample with its name below; a press lifts a new one. */
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
      <div class={styles.trayTile} title={label()} onPointerDown={(event) => props.onLift(event)}>
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
 * A kit as the box shows it: its parts in miniature, at most `cells` cells across (three by default), with its
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
          if (!broken()) {
            props.onLift(event);
          }
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
 * A kit's parts laid out as on a panel at full size, the block being carried; see `KitPreview` for the box's
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
