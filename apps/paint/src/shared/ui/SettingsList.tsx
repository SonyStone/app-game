import { createUniqueId, For, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from './SketchIcon';
import styles from './SettingsList.module.css';

/**
 * The sidebar of a list–detail panel, as the Settings apps of iPadOS, macOS, Windows and GNOME draw theirs: one
 * compact line per item with its icon on a small tile, its name and a quiet trailing status that truncates first,
 * under the headings of their groups; the selected item gets a rounded highlight. A press selects an item through
 * `onSelect`; the caller owns the selection and shows the item's detail. Knows nothing about what the items are.
 *
 * Each item is a button named by its label and described by its trailing text, and the selected one is marked as the
 * current page. Items keep the order given; a group's heading shows before the first item of the group, so the items
 * of a group should be consecutive. Items without a group come first, without a heading.
 *
 * The host styles it through custom properties, each with a fallback: `--settings-list-ink` and
 * `--settings-list-quiet` for the text, `--settings-list-icon` and `--settings-list-icon-ink` for the icon tiles,
 * `--settings-list-selected` and `--settings-list-selected-ink` for the selected row, `--settings-list-hover`,
 * `--settings-list-row` (row height, 40 px), `--settings-list-radius`, `--settings-list-inset` (the rows' distance
 * from the list's sides, as `padding-inline`), `--settings-list-text` and `--settings-list-small` for the type, and
 * `--settings-list-chevron` (`none` by default, `block` to show a chevron at each row's end, as a phone's list does
 * when each item opens a page of its own).
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
  /** Added to the list's own class, for a host's layout and colors. */
  class?: string;
}) {
  return (
    <nav class={[styles.list, props.class]} aria-label={props.label}>
      {/* Keyed by id: items are rebuilt as their statuses change, and their rows stay. */}
      <For each={props.items} keyed={(item) => item.id}>
        {(item, index) => (
          <>
            <Show when={groupHeading(props.items, index(), props.groups)}>
              {(heading) => <h3 class={styles.group}>{heading()}</h3>}
            </Show>
            <SettingsListRow
              item={item()}
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

/** A row of the list: its icon tile, label and trailing text, and a chevron the host may show. */
function SettingsListRow(props: { item: SettingsListItem; selected: boolean; onSelect: () => void }) {
  const labelId = createUniqueId();
  const trailingId = createUniqueId();

  return (
    <button
      type="button"
      class={styles.row}
      aria-current={props.selected ? 'page' : undefined}
      aria-labelledby={labelId}
      aria-describedby={props.item.trailing ? trailingId : undefined}
      onClick={() => props.onSelect()}
    >
      <span class={styles.icon}>
        <Show when={props.item.icon}>{(icon) => <SketchIcon name={icon()} size={16} />}</Show>
      </span>
      <span class={styles.text}>
        <span id={labelId} class={styles.label}>
          {props.item.label}
        </span>
        <Show when={props.item.trailing}>
          <span id={trailingId} class={styles.trailing}>
            {props.item.trailing}
          </span>
        </Show>
      </span>
      <span class={styles.chevron}>
        <SketchIcon name="right" size={14} />
      </span>
    </button>
  );
}
