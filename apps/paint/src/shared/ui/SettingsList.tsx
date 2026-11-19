import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, For, Show } from 'solid-js';
import styles from './SettingsList.module.css';
import { SketchIcon, type SketchIconName } from './SketchIcon';

/**
 * The sidebar of a list–detail panel, as the Settings apps of iPadOS, macOS, Windows and GNOME draw theirs: one
 * compact line per item (`SettingsRow`) with its icon on a small tile, its name and a quiet trailing status that
 * truncates first, under the headings of their groups. The selected item lies on a rounded pill in the accent, its
 * label and trailing text in white, and the pill slides to the next item chosen in 200 ms on
 * `cubic-bezier(0.3, 0, 0, 1)` (at once with reduced motion or on the first placement). A press selects an item
 * through `onSelect`; the caller owns the selection and shows the item's detail beside the list, usually in a
 * `SettingsSplit`, which also turns list and detail into two screens where the panel is narrow. Knows nothing about
 * what the items are. A list or menu without a detail lays the same rows out in `SettingsRows`.
 *
 * Each item is a button named by its label and described by its trailing text, and the selected one is marked as the
 * current page. A row shows it is pressed as soon as a pointer goes down on it. The arrow keys, Home and End move the
 * focus between the rows; Enter or Space selects the focused one. Items keep the order given; a group's heading shows
 * before the first item of the group, so the items of a group should be consecutive. Items without a group come first,
 * without a heading. When the list scrolls, rows fade out at a scrolled edge, more so the further the list can scroll
 * that way, and the selected row is scrolled into view.
 *
 * The host styles it through custom properties, each with a fallback: `--settings-list-ink` and
 * `--settings-list-quiet` for the text; `--settings-list-icon` and `--settings-list-icon-ink` for the icon tiles,
 * `--settings-list-icon-size` (26 px; 0 drops the tiles), `--settings-list-icon-gap` (10 px after them) and
 * `--settings-list-icon-radius` (7 px);
 * `--settings-list-selected` (the selected row's pill, an accent blue), `--settings-list-selected-ink` (its label,
 * white) and `--settings-list-selected-quiet` (its trailing text); `--settings-list-hover`, `--settings-list-pressed`
 * and `--settings-list-focus`; `--settings-list-row` (row height, 40 px), `--settings-list-radius` (the rows' and the
 * pill's corners), `--settings-list-row-start` (the row's start padding, 7 px), `--settings-list-inset` (the rows'
 * distance from the list's sides, as `padding-inline`, 8 px), `--settings-list-fade` (the fade at a scrolled edge,
 * 24 px), `--settings-list-text`, `--settings-list-small` and `--settings-list-weight` (the label's, 500) for the
 * type, and `--settings-list-chevron` (`none` by default, `block` to show a chevron at each row's end, as a phone's
 * list does when each item opens a page of its own; a narrow `SettingsSplit` sets it).
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
  const [pill, setPill] = createSignal<HTMLElement>();
  createSelectionPill(
    list,
    pill,
    () => props.selected,
    () => props.items
  );
  createScrollFades(list, () => props.items);

  return (
    <nav ref={setList} class={[styles.list, props.class]} aria-label={props.label} onKeyDown={moveFocus}>
      <span ref={setPill} class={styles.pill} aria-hidden="true" />
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
 * `menuitem` has no selection. Its ground is a pill in `--settings-list-selected`: in a `SettingsList` the list's one
 * pill, which slides between rows; in `SettingsRows` the row's own. Its icon tile keeps its colors on it.
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
 * A plain column of `SettingsRow`s for a menu or a list without a detail beside it: the rows, type, radii and states
 * of a `SettingsList`, the chosen row on the same accent pill, which does not slide here, and the same arrow, Home and
 * End keys and edge fades. Takes the same custom properties.
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
 * A panel's list beside its detail on one plate, the list's end edge a hairline (`--settings-split-line`), as a
 * Settings window lays out its sidebar and page; `list` is the list's side and `children` the detail, each one
 * element. The list's side is `--settings-split-list` wide (`minmax(160px, 34%)` by default).
 *
 * Where a host finds the panel too narrow for both, it sets `--settings-split: narrow` on this element, from a
 * container query on its own width, and list and detail become two screens, as on a phone: `view` names the one shown;
 * the list's rows show chevrons and no selected pill, and `SettingsBack` controls inside appear. The caller sets `view`
 * to `detail` when an item is chosen and back to `list` from `SettingsBack`; where list and detail fit, both show and
 * `view` changes nothing.
 */
export function SettingsSplit(props: {
  /** The screen shown while narrow. */
  view: 'list' | 'detail';
  list: JSX.Element;
  children: JSX.Element;
  /** Added to the split's own class, for a host's size, plate and colors. */
  class?: string;
}) {
  return (
    <div class={[styles.split, props.class]} data-view={props.view}>
      {props.list}
      {props.children}
    </div>
  );
}

/**
 * The bar at the top of a `SettingsSplit`'s detail that leads back to the list, shown only while the split is narrow:
 * a chevron with the list's name, then the detail's title, as a phone's navigation bar. Its color is
 * `--settings-split-back` (the accent by default).
 */
export function SettingsBack(props: {
  /** The list's name, such as "Families". */
  label: string;
  /** The detail's title, such as the chosen family's name. */
  title: string;
  onBack: () => void;
}) {
  return (
    <div class={styles.backBar}>
      <button type="button" class={styles.back} onClick={() => props.onBack()}>
        <SketchIcon name="left" size={18} />
        {props.label}
      </button>
      <h3 class={styles.backTitle}>{props.title}</h3>
    </div>
  );
}

/**
 * Lays the pill in `pill` under the row of `list` whose `data-item` is `selected`, sized as the row. When the
 * selection changes it slides there by the pill's CSS transition and the row is scrolled into view; on the first
 * placement, and when the list is laid out anew, it moves at once. The pill hides while no row is selected or laid
 * out. `pill` lies in `list`'s scrolling content, which is its rows' offset parent, so it scrolls with them.
 */
function createSelectionPill(
  list: () => HTMLElement | undefined,
  pill: () => HTMLElement | undefined,
  selected: () => string | undefined,
  layout: () => unknown
) {
  let shown: string | undefined;
  const place = (glide: boolean) => {
    const element = pill();
    const id = selected();
    const rows = list()?.querySelectorAll<HTMLElement>('[data-item]') ?? [];
    const row = id === undefined ? undefined : [...rows].find((candidate) => candidate.dataset.item === id);
    if (!element || !row || row.offsetHeight === 0) {
      element?.style.setProperty('visibility', 'hidden');
      shown = undefined;
      return;
    }

    const moved = shown !== undefined && shown !== id;
    if (!glide || !moved) {
      element.style.transition = 'none';
    }

    element.style.removeProperty('visibility');
    element.style.transform = `translate(${row.offsetLeft}px, ${row.offsetTop}px)`;
    element.style.width = `${row.offsetWidth}px`;
    element.style.height = `${row.offsetHeight}px`;
    if (element.style.transition) {
      // Laid out where it is now before the transition comes back, so the next move glides from here.
      void element.offsetWidth;
      element.style.removeProperty('transition');
    }

    if (glide && moved) {
      row.scrollIntoView?.({ block: 'nearest' });
    }

    shown = id;
  };

  createEffect(
    () => [selected(), layout(), list(), pill()],
    () => place(true)
  );
  if (typeof ResizeObserver !== 'undefined') {
    createResizeObserver(list, () => place(false));
  }
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
