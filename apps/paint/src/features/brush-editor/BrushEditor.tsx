import type { Brush } from '@app-game/paint-core/brush';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import styles from './BrushEditor.module.css';
import {
  brushCategories,
  brushSettingName,
  brushSettingsDiffer,
  type BrushCategory,
  type BrushPins,
  type BrushSetting,
  type BrushSettingsSnapshot
} from './schema';
import { SettingRow } from './SettingRow';

/**
 * The brush editor: the brush's name and a stroke preview across the top, the categories of {@link brushCategories}
 * in a column with a one-line status each, the chosen category's rows beside them, and Cancel changes and Done at the
 * bottom.
 *
 * Controlled: every change, also while a control is dragged, is sent through `onChange` as a patch for the caller
 * to merge into the brush it passes back. Cancel changes sends `baseline`, and is disabled while the brush does not
 * differ from it; the editor keeps no settings of its own, so it may stay mounted while the brush is replaced.
 *
 * The layout follows the editor's own width, so the editor fits any panel: wide, the column shows names and
 * statuses; medium, icons only; narrow, the column alone, and a tap on a category shows its rows with a way back.
 * The editor fills its parent's height; the column and the rows scroll on their own.
 */
export function BrushEditor(props: {
  /** When supplied, numeric rows can be pinned to the host board. */
  pins?: BrushPins;
  brush: Brush;
  /** Generated categories supplied by an engine adapter; defaults to Paint settings. */
  categories?: readonly BrushCategory[];
  /**
   * The settings Cancel changes returns to, such as `snapshotBrushSettings` of the brush when it was chosen or when
   * editing began. The caller takes a new one whenever another brush is chosen, so that Cancel changes never writes
   * one brush's settings onto another.
   */
  baseline: BrushSettingsSnapshot;
  /** The name of the edited brush, such as its preset's, shown above the preview; nothing is shown without it. */
  name?: string;
  onChange: (patch: Partial<Brush>) => void;
  onDone: () => void;
  /** The stroke preview, made by the caller, which owns the painting it needs. */
  preview?: JSX.Element;
}) {
  const changed = createMemo(() => brushSettingsDiffer(props.brush, props.baseline));
  const categories = createMemo(() =>
    (props.categories ?? brushCategories).filter((category) => category.applies(props.brush))
  );
  const [chosenId, setChosenId] = createSignal(brushCategories[0]!.id);
  /** The chosen category, or the first one when the brush no longer has the chosen one. */
  const chosen = createMemo(() => categories().find((category) => category.id === chosenId()) ?? categories()[0]!);
  /** In the narrow layout, whether the category list or the chosen category's rows are shown. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [root, setRoot] = createSignal<HTMLElement>();
  createEffect(root, (element) => (element ? watchTapTargets(element) : undefined));
  const paneTitleId = createUniqueId();

  return (
    <section ref={setRoot} class={styles.editor} aria-label="Brush editor">
      <div class={styles.frame} data-view={view()}>
        <div class={styles.top}>
          <Show when={props.name}>{(name) => <p class={styles.name}>{name()}</p>}</Show>
          <div class={styles.preview}>{props.preview}</div>
        </div>
        <div class={styles.body}>
          <nav class={styles.nav} aria-label="Brush setting categories">
            <For each={groups}>
              {(group) => (
                <Show when={categories().some((category) => category.group === group.id)}>
                  <h3 class={styles.group}>{group.label}</h3>
                  <For each={categories().filter((category) => category.group === group.id)}>
                    {(category) => (
                      <CategoryButton
                        category={category}
                        brush={props.brush}
                        chosen={chosen() === category}
                        onChoose={() => {
                          setChosenId(category.id);
                          setView('detail');
                        }}
                      />
                    )}
                  </For>
                </Show>
              )}
            </For>
          </nav>
          <section class={styles.pane} aria-labelledby={paneTitleId}>
            <button type="button" class={styles.back} onClick={() => setView('list')}>
              <SketchIcon name="left" size={18} />
              All categories
            </button>
            <h2 id={paneTitleId} class={styles.title}>
              {chosen().label}
            </h2>
            <p class={styles.paneStatus}>{chosen().status(props.brush)}</p>
            <Show when={chosen().about} keyed>
              {(about) => <About title={chosen().label} text={about} />}
            </Show>
            <CategoryRows pins={props.pins} category={chosen()} brush={props.brush} onChange={props.onChange} />
          </section>
        </div>
        <footer class={styles.footer}>
          <button type="button" disabled={!changed()} onClick={() => props.onChange(structuredClone(props.baseline))}>
            Cancel changes
          </button>
          <button type="button" class={styles.done} onClick={() => props.onDone()}>
            Done
          </button>
        </footer>
      </div>
    </section>
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
  'pressure-curve': 'pressure',
  bristle: 'bristles',
  erodible: 'pencil'
};

/** A collapsed block that explains the category, opened and closed by its heading. */
function About(props: { title: string; text: string }) {
  const [open, setOpen] = createSignal(false);
  const textId = createUniqueId();

  return (
    <div class={styles.about}>
      <button
        type="button"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={textId}
        onClick={() => setOpen(!open())}
      >
        <SketchIcon name={open() ? 'down' : 'right'} size={14} />
        About {props.title.toLowerCase()}
      </button>
      <p id={textId} hidden={!open()}>
        {props.text}
      </p>
    </div>
  );
}

/**
 * The rows of a category whose settings apply to the brush, in schema order, or its note when none does. Rows of a
 * section are framed together under its heading; other rows stand alone. Rows are made once per setting and sections
 * once per heading, so values change in place and no row appears, disappears or moves while one is used.
 */
function CategoryRows(props: {
  pins?: BrushPins;
  category: BrushCategory;
  brush: Brush;
  onChange: (patch: Partial<Brush>) => void;
}) {
  const rows = createMemo(() => props.category.settings.filter((setting) => setting.applies(props.brush)));
  const runs = createMemo(() => sectionRuns(rows()));
  const note = createMemo(() => (rows().length === 0 ? props.category.note?.(props.brush) : undefined));

  return (
    <div class={styles.rows}>
      <For each={runs()} keyed={(run) => run.key}>
        {(run) => (
          <Show
            when={run().title}
            fallback={
              <For each={run().rows}>
                {(setting) => (
                  <SettingRow
                    pins={props.pins}
                    pinName={brushSettingName(props.category, setting)}
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
                pins={props.pins}
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
      <Show when={note()}>{(text) => <p class={styles.note}>{text()}</p>}</Show>
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
  pins?: BrushPins;
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
          <SettingRow
            pins={props.pins}
            pinName={brushSettingName(props.category, setting)}
            setting={setting}
            brush={props.brush}
            onChange={props.onChange}
          />
        )}
      </For>
    </div>
  );
}
