import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, For, Show } from 'solid-js';
import { createJoinedSelection } from './createJoinedSelection';
import styles from './SettingsList.module.css';
import { SketchIcon, type SketchIconName } from './SketchIcon';

/**
 * The sidebar of a list–detail panel, as the Settings apps of iPadOS, macOS, Windows and GNOME draw theirs: one
 * compact line per item (`SettingsRow`) with its icon on a small tile, its name and a quiet trailing status that
 * truncates first, under the headings of their groups. The selected item is joined to the detail beside the list: a
 * shape in the detail's color covers its row out to the list's end edge and curves into the detail above and below
 * it, and it travels to the next item chosen (`createJoinedSelection`); the selected item's icon tile takes the mark
 * color. A press selects an item through `onSelect`; the caller owns the selection and shows the item's detail, which
 * it places against the list's end edge. Knows nothing about what the items are. A list or menu without a detail
 * lays the same rows out in `SettingsRows`.
 *
 * Each item is a button named by its label and described by its trailing text, and the selected one is marked as the
 * current page. A row shows it is pressed as soon as a pointer goes down on it. The arrow keys, Home and End move the
 * focus between the rows; Enter or Space selects the focused one. Items keep the order given; a group's heading shows
 * before the first item of the group, so the items of a group should be consecutive. Items without a group come first,
 * without a heading. When the list scrolls, rows fade out at a scrolled edge, more so the further the list can scroll
 * that way, and the selected row is scrolled fully into view.
 *
 * The host styles it through custom properties, each with a fallback: `--settings-list-ink` and
 * `--settings-list-quiet` for the text; `--settings-list-icon` and `--settings-list-icon-ink` for the icon tiles,
 * `--settings-list-icon-size` (26 px; 0 drops the tiles) and `--settings-list-icon-gap` (10 px after them);
 * `--settings-list-selected` (the joined shape: the detail's color), `--settings-list-selected-ink` and
 * `--settings-list-selected-quiet` (its trailing text) for the selected row, and `--settings-list-selected-pill` for
 * its pill where nothing is joined (`SettingsRows`, or a list with the join off); `--settings-list-mark` and
 * `--settings-list-mark-ink` for its icon tile;
 * `--settings-list-join` (`block`, or `none` for plain rows that do not join anything) and
 * `--settings-list-join-radius` (the concave corners, 12 px); `--settings-list-hover`, `--settings-list-pressed` and
 * `--settings-list-focus`; `--settings-list-pill-end` (how far a hovered or pressed row's pill stops short of the end
 * edge, the join radius by default); `--settings-list-row` (row height, 40 px), `--settings-list-radius` (the rows'
 * corners), `--settings-list-row-start` (the row's start padding, 7 px), `--settings-list-inset` (the rows' distance
 * from the list's sides, as `padding-inline`; the end side must be 0 for the join), `--settings-list-fade` (the fade
 * at a scrolled edge, 24 px), `--settings-list-text`, `--settings-list-small` and `--settings-list-weight` (the
 * label's, 500) for the type, and `--settings-list-chevron` (`none` by default, `block` to show a chevron at each
 * row's end, as a phone's list does when each item opens a page of its own).
 */
export function SettingsList(props: {
  items: readonly SettingsListItem[];
  /** The groups' headings in any order; a group without one gets no heading. */
  groups?: readonly { id: string; label: string }[];
  /** The id of the selected item; none is selected without it. */
  selected?: string;
  /** Called with the pressed item's id, also when it is already selected. */
  onSelect: (id: string) => void;
  /** The list's accessible name, such as "Brush setting categories". */
  label: string;
  /** Added to the list's own class, for a host's layout and colors. A host that scrolls the list scrolls this box. */
  class?: string;
}) {
  const [list, setList] = createSignal<HTMLElement>();
  const [layer, setLayer] = createSignal<SVGSVGElement>();
  createJoinedSelection({ list, layer, selected: () => props.selected, layout: () => props.items });
  createScrollFades(list, () => props.items);

  return (
    <nav ref={setList} class={[styles.list, props.class]} aria-label={props.label} onKeyDown={moveFocus}>
      <svg ref={setLayer} class={styles.join} aria-hidden="true">
        <path class={styles.joinFill} data-join="fill" />
        <path class={styles.joinEdge} data-join="edge" />
      </svg>
      {/* Keyed by id: items are rebuilt as their statuses change, and their rows stay. */}
      <For each={props.items} keyed={(item) => item.id}>
        {(item, index) => (
          <>
            <Show when={groupHeading(props.items, index(), props.groups)}>
              {(heading) => <h3 class={styles.group}>{heading()}</h3>}
            </Show>
            <SettingsRow
              id={item().id}
              label={item().label}
              icon={item().icon}
              trailing={item().trailing}
              selected={item().id === props.selected}
              onSelect={() => props.onSelect(item().id)}
            />
          </>
        )}
      </For>
    </nav>
  );
}

/** One item of a `SettingsList`. */
export type SettingsListItem = {
  /** Stable identifier, passed to `onSelect` and matched against `selected`. */
  id: string;
  label: string;
  /** Drawn on a small tile before the label; the row keeps the tile's room without it, so labels line up. */
  icon?: SketchIconName;
  /** Live status or value shown quietly at the row's end, such as "Stabilizer · 6" or "Off"; truncated first. */
  trailing?: string;
  /** The id of the group the item belongs to; see `SettingsList`'s `groups`. */
  group?: string;
};

/** The heading to show before item `index`: its group's label when the group starts there, else none. */
function groupHeading(
  items: readonly SettingsListItem[],
  index: number,
  groups: readonly { id: string; label: string }[] | undefined
) {
  const group = items[index]?.group;
  if (group === undefined || items[index - 1]?.group === group) {
    return undefined;
  }

  return groups?.find((candidate) => candidate.id === group)?.label;
}

/** Moves the focus to the previous or next row with the arrow keys, or to the first or last with Home and End. */
function moveFocus(event: KeyboardEvent) {
  const list = event.currentTarget as HTMLElement;
  const rows = [...list.querySelectorAll<HTMLElement>('[data-item]:not(:disabled)')];
  const current = rows.indexOf(event.target as HTMLElement);
  const next = {
    ArrowDown: current + 1,
    ArrowUp: current - 1,
    Home: 0,
    End: rows.length - 1
  }[event.key];
  if (current < 0 || next === undefined || !rows[next]) {
    return;
  }

  event.preventDefault();
  rows[next].focus();
  rows[next].scrollIntoView?.({ block: 'nearest' });
}

/**
 * One row of the Settings style, the one row every list, menu and sidebar of it draws: a small tile with an icon or
 * a picture, the label and a quiet trailing status that truncates first, and a chevron the host may show. It shows
 * it is pressed as soon as a pointer goes down on it and stays pressable by pen, finger, mouse and keyboard; `onSelect`
 * runs on a click. Lay rows out in a `SettingsList`, or in `SettingsRows` for a plain list or menu, whose stylesheet
 * and custom properties they take.
 *
 * `selected` marks the chosen row: as the current page by default, as the selected option with `role="option"`; a
 * `menuitem` has no selection. In a `SettingsList` the joined shape draws the chosen row's ground; in `SettingsRows`
 * a pill in `--settings-list-selected-pill` does. Either way its tile takes the mark color.
 */
export function SettingsRow(props: {
  /** Matched against the selection; also the row's `data-item`, by which lists find their rows. */
  id: string;
  label: string;
  /** Drawn on the tile; the row keeps the tile's room without it, so labels line up. */
  icon?: SketchIconName;
  /** A picture filling the tile in place of `icon`, such as a live preview. */
  tile?: JSX.Element;
  /** See `SettingsListItem.trailing`. */
  trailing?: string;
  selected?: boolean;
  role?: 'option' | 'menuitem';
  disabled?: boolean;
  /** A tooltip, for what a row cannot say in a line. */
  title?: string;
  onSelect: () => void;
}) {
  const labelId = createUniqueId();
  const trailingId = createUniqueId();
  const [pressed, setPressed] = createSignal(false);
  const release = () => setPressed(false);

  return (
    <button
      type="button"
      class={styles.row}
      role={props.role}
      disabled={props.disabled}
      title={props.title}
      data-item={props.id}
      data-selected={props.selected ? '' : undefined}
      data-pressed={pressed() ? '' : undefined}
      aria-current={props.role === undefined && props.selected ? 'page' : undefined}
      aria-selected={props.role === 'option' ? (props.selected ? 'true' : 'false') : undefined}
      aria-labelledby={labelId}
      aria-describedby={props.trailing ? trailingId : undefined}
      onPointerDown={(event) => setPressed(event.isPrimary)}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClick={() => props.onSelect()}
    >
      <span class={styles.icon} data-picture={props.tile ? '' : undefined}>
        <Show
          when={props.tile}
          fallback={<Show when={props.icon}>{(icon) => <SketchIcon name={icon()} size={16} />}</Show>}
        >
          {props.tile}
        </Show>
      </span>
      <span class={styles.text}>
        <span id={labelId} class={styles.label}>
          {props.label}
        </span>
        <Show when={props.trailing}>
          <span id={trailingId} class={styles.trailing}>
            {props.trailing}
          </span>
        </Show>
      </span>
      <span class={styles.chevron}>
        <SketchIcon name="right" size={14} />
      </span>
    </button>
  );
}

/**
 * A plain column of `SettingsRow`s that joins nothing, for a menu or a list without a detail beside it: the rows,
 * type, radii and states of a `SettingsList`, the chosen row on a pill (`--settings-list-selected-pill`) instead of
 * the joined shape, and the same arrow, Home and End keys and edge fades. Takes the same custom properties.
 */
export function SettingsRows(props: {
  /** The column's accessible name. */
  label: string;
  /** `menu` for commands, `listbox` for options; a plain group without it. */
  role?: 'menu' | 'listbox';
  /** Added to the column's own class, for a host's layout and colors. */
  class?: string;
  /** Read again when the rows change, to fade the edges anew. */
  layout?: unknown;
  children: JSX.Element;
}) {
  const [list, setList] = createSignal<HTMLElement>();
  createScrollFades(list, () => props.layout);

  return (
    <div
      ref={setList}
      class={[styles.list, styles.plain, props.class]}
      role={props.role ?? 'group'}
      aria-label={props.label}
      onKeyDown={moveFocus}
    >
      {props.children}
    </div>
  );
}

/**
 * Fades the rows out at each edge `list` can scroll past, as far as it can scroll there up to `--settings-list-fade`:
 * sets `--settings-list-fade-start` and `-end` on it, and `data-overflow` while it can scroll at all. Measures again as
 * it scrolls, resizes or `layout` changes.
 */
function createScrollFades(list: () => HTMLElement | undefined, layout: () => unknown) {
  const update = () => {
    const element = list();
    if (!element) {
      return;
    }

    const room = element.scrollHeight - element.clientHeight;
    const fade = Number.parseFloat(getComputedStyle(element).getPropertyValue('--settings-list-fade')) || 24;
    element.toggleAttribute('data-overflow', room > 1);
    element.style.setProperty('--settings-list-fade-start', `${Math.min(fade, element.scrollTop)}px`);
    element.style.setProperty('--settings-list-fade-end', `${Math.min(fade, Math.max(0, room - element.scrollTop))}px`);
  };

  createEventListener(list, 'scroll', update, { passive: true });
  createEffect(() => [list(), layout()], update);
  if (typeof ResizeObserver !== 'undefined') {
    createResizeObserver(list, update);
  }
}
