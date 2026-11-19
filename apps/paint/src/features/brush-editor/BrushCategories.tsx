import type { Brush } from '@app-game/paint-core/brush';
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, createUniqueId, For, Show, untrack } from 'solid-js';
import { SettingsList, type SettingsListItem } from '../../shared/ui/SettingsList';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './BrushEditor.module.css';
import { brushCategories, type BrushCategory, type BrushSetting, type NumberSetting } from './schema';
import { SettingRow } from './SettingRow';
import { StrokeCorrectionDemo } from './StrokeCorrectionDemo';

/**
 * The categories a brush editor offers for `props.brush` and the one it shows: `props.categories` (Paint's by
 * default) that apply to the brush, and the chosen one, or the first while the brush has no chosen one, as after
 * another brush replaced it. Shared by the side panel (`BrushEditor`) and the full-screen `BrushStudio`.
 */
export function createCategoryChoice(props: { brush: Brush; categories?: readonly BrushCategory[] | undefined }) {
  const categories = createMemo(() =>
    (props.categories ?? brushCategories).filter((category) => category.applies(props.brush))
  );
  const [chosenId, setChosenId] = createSignal(brushCategories[0]!.id);
  const chosen = createMemo(() => categories().find((category) => category.id === chosenId()) ?? categories()[0]!);

  return {
    categories,
    chosen,
    choose: (category: BrushCategory) => setChosenId(category.id)
  };
}

/**
 * The column of categories, under the headings of their groups: a button per category with its icon, name and status
 * line. `onChoose` receives the pressed category; the chosen one is marked as current.
 */
export function CategoryList(props: {
  categories: readonly BrushCategory[];
  chosen: BrushCategory;
  brush: Brush;
  onChoose: (category: BrushCategory) => void;
  /** Added to the column's own class, for a presentation's layout. */
  class?: string;
}) {
  return (
    <nav class={[styles.nav, props.class]} aria-label="Brush setting categories">
      <For each={groups}>
        {(group) => (
          <Show when={props.categories.some((category) => category.group === group.id)}>
            <h3 class={styles.group}>{group.label}</h3>
            <For each={props.categories.filter((category) => category.group === group.id)}>
              {(category) => (
                <CategoryButton
                  category={category}
                  brush={props.brush}
                  chosen={props.chosen === category}
                  onChoose={() => props.onChoose(category)}
                />
              )}
            </For>
          </Show>
        )}
      </For>
    </nav>
  );
}

/**
 * The categories as a Settings-style sidebar (`SettingsList`), as the brush studio shows them: one line per category
 * with its icon, name and status, under the headings of their groups. `onChoose` receives the pressed category.
 * `extra` adds items after the categories, under groups of their own, for pages that are not the brush's, such as
 * the pen's; while one of them is `selected`, no category is marked.
 */
export function CategorySidebar(props: {
  categories: readonly BrushCategory[];
  chosen: BrushCategory;
  brush: Brush;
  onChoose: (category: BrushCategory) => void;
  extra?: {
    items: readonly SettingsListItem[];
    groups: readonly { id: string; label: string }[];
    /** The extra item shown now, if any. */
    selected?: string;
    onSelect: (id: string) => void;
  };
  /** Added to the list's own class, for a presentation's layout and colors. */
  class?: string;
}) {
  const items = createMemo(() => [
    ...groups.flatMap((group) =>
      props.categories
        .filter((category) => category.group === group.id)
        .map((category) => ({
          id: category.id,
          label: category.label,
          icon: categoryIcons[category.id] ?? 'brush',
          trailing: category.status(props.brush),
          group: category.group
        }))
    ),
    ...(props.extra?.items ?? [])
  ]);

  return (
    <SettingsList
      class={props.class}
      label="Brush setting categories"
      items={items()}
      groups={[...groups, ...(props.extra?.groups ?? [])]}
      selected={props.extra?.selected ?? props.chosen.id}
      onSelect={(id) => {
        const category = props.categories.find((candidate) => candidate.id === id);
        if (category) {
          props.onChoose(category);
        } else {
          props.extra?.onSelect(id);
        }
      }}
    />
  );
}

/** The two groups of the category column, in order. */
const groups = [
  { id: 'basics', label: 'Basics' },
  { id: 'advanced', label: 'Advanced' }
] as const satisfies readonly { id: BrushCategory['group']; label: string }[];

/**
 * A category in the column: its icon, name and status line; the whole row chooses it. The chosen category is marked
 * as selected; whether the category does anything is told by its status alone. The button is named by the category's
 * name and described by its status, also in the medium layout, where both are hidden and only the icon shows.
 */
function CategoryButton(props: { category: BrushCategory; brush: Brush; chosen: boolean; onChoose: () => void }) {
  const status = createMemo(() => props.category.status(props.brush));
  const nameId = createUniqueId();
  const statusId = createUniqueId();

  return (
    <button
      type="button"
      class={styles.category}
      aria-current={props.chosen ? 'true' : undefined}
      aria-labelledby={nameId}
      aria-describedby={statusId}
      onClick={() => props.onChoose()}
    >
      <span class={styles.categoryIcon}>
        <SketchIcon name={categoryIcons[props.category.id] ?? 'brush'} size={20} />
      </span>
      <span class={styles.categoryText}>
        <span id={nameId} class={styles.categoryName}>
          {props.category.label}
        </span>
        <span id={statusId} class={styles.categoryStatus}>
          {status()}
        </span>
      </span>
      <span class={styles.chevron}>
        <SketchIcon name="right" size={16} />
      </span>
    </button>
  );
}

/**
 * Icons of the categories by ID, Paint's and ABR's; others show a brush. Each has a different outline, since the
 * medium layout shows the icons alone.
 */
const categoryIcons: Record<string, SketchIconName> = {
  painting: 'sliders',
  tool: 'sliders',
  'brush-tip': 'selectEllipse',
  dynamics: 'proportions',
  shapeDynamics: 'sizes',
  transfer: 'bars',
  scattering: 'scatter',
  texture: 'texture',
  dualBrush: 'dualTip',
  colorDynamics: 'hue',
  brushPose: 'tilt',
  'stroke-correction': 'lasso',
  smoothing: 'lasso',
  bristle: 'bristles',
  erodible: 'pencil'
};

/**
 * The chosen category's settings: a way back to the category list (shown only where the layout shows one at a time),
 * its name as the heading, its status (shown where the column has no room for it) and its rows, with the stroke
 * correction's moving sample above them.
 */
export function CategoryPane(props: {
  category: BrushCategory;
  /**
   * The host's row for a number setting, in place of the editor's own slider, such as a control the
   * host uses elsewhere for the same setting; `undefined` keeps the editor's row. Called once per row as it is made,
   * under the row's owner, with the setting and the category it is shown in. The host's row edits the setting itself:
   * the editor sends no patch for it.
   */
  hostRow?: (setting: NumberSetting, category: BrushCategory) => JSX.Element | undefined;
  brush: Brush;
  onChange: (patch: Partial<Brush>) => void;
  /** Called by the way back to the category list. */
  onBack: () => void;
  /** Added to the pane's own class, for a presentation's layout. */
  class?: string;
}) {
  const titleId = createUniqueId();

  return (
    <section class={[styles.pane, props.class]} aria-labelledby={titleId}>
      <button type="button" class={styles.back} onClick={() => props.onBack()}>
        <SketchIcon name="left" size={18} />
        All categories
      </button>
      <h2 id={titleId} class={styles.title}>
        {props.category.label}
      </h2>
      <p class={styles.paneStatus}>{props.category.status(props.brush)}</p>
      <Show when={props.category.id === 'stroke-correction'}>
        <StrokeCorrectionDemo brush={props.brush} />
      </Show>
      <CategoryRows hostRow={props.hostRow} category={props.category} brush={props.brush} onChange={props.onChange} />
    </section>
  );
}

/**
 * The rows of a category whose settings apply to the brush, in schema order. Rows of a section are framed together under its heading; other rows stand alone. Rows are made once per setting and sections
 * once per heading, so values change in place and no row appears, disappears or moves while one is used.
 */
function CategoryRows(props: {
  hostRow?: Parameters<typeof CategoryPane>[0]['hostRow'];
  category: BrushCategory;
  brush: Brush;
  onChange: (patch: Partial<Brush>) => void;
}) {
  const rows = createMemo(() => props.category.settings.filter((setting) => setting.applies(props.brush)));
  const runs = createMemo(() => sectionRuns(rows()));

  return (
    <div class={styles.rows}>
      <For each={runs()} keyed={(run) => run.key}>
        {(run) => (
          <Show
            when={run().title}
            fallback={
              <For each={run().rows}>
                {(setting) => (
                  <Row
                    hostRow={props.hostRow}
                    category={props.category}
                    setting={setting}
                    brush={props.brush}
                    onChange={props.onChange}
                  />
                )}
              </For>
            }
          >
            {(title) => (
              <Section
                hostRow={props.hostRow}
                category={props.category}
                title={title()}
                rows={run().rows}
                brush={props.brush}
                onChange={props.onChange}
              />
            )}
          </Show>
        )}
      </For>
    </div>
  );
}

/**
 * Splits `rows` into runs of consecutive rows that share a section or have none. A section's run is keyed by its
 * title, a run of rows without one by its place among such runs.
 */
function sectionRuns(rows: readonly BrushSetting[]) {
  const runs: { key: string; title?: string; rows: BrushSetting[] }[] = [];
  let loose = 0;
  for (const row of rows) {
    const last = runs.at(-1);
    if (last && last.title === row.section) {
      last.rows.push(row);
    } else {
      runs.push({ key: row.section ?? `#${loose++}`, title: row.section, rows: [row] });
    }
  }

  return runs;
}

/** A framed group of rows under a short heading, announced as a group named by it. */
function Section(props: {
  hostRow?: Parameters<typeof CategoryPane>[0]['hostRow'];
  category: BrushCategory;
  title: string;
  rows: readonly BrushSetting[];
  brush: Brush;
  onChange: (patch: Partial<Brush>) => void;
}) {
  const titleId = createUniqueId();

  return (
    <div class={styles.section} role="group" aria-labelledby={titleId}>
      <h3 id={titleId} class={styles.sectionTitle}>
        {props.title}
      </h3>
      <For each={props.rows}>
        {(setting) => (
          <Row
            hostRow={props.hostRow}
            category={props.category}
            setting={setting}
            brush={props.brush}
            onChange={props.onChange}
          />
        )}
      </For>
    </div>
  );
}

/** A setting's row: the host's for a number setting when it has one, otherwise the editor's own `SettingRow`. */
function Row(props: {
  hostRow?: Parameters<typeof CategoryPane>[0]['hostRow'];
  category: BrushCategory;
  setting: BrushSetting;
  brush: Brush;
  onChange: (patch: Partial<Brush>) => void;
}) {
  // A row is made once per setting, so neither its setting nor the host's row changes under it.
  const setting = untrack(() => props.setting);
  const hosted = untrack(() => (setting.kind === 'number' ? props.hostRow?.(setting, props.category) : undefined));

  return hosted ?? <SettingRow setting={setting} brush={props.brush} onChange={props.onChange} />;
}
