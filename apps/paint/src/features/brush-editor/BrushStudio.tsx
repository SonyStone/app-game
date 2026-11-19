import type { Brush } from '@app-game/paint-core/brush';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { CategoryPane, CategorySidebar, createCategoryChoice } from './BrushCategories';
import styles from './BrushEditor.module.css';
import { brushSettingsDiffer, type BrushCategory, type BrushSettingsSnapshot } from './schema';

/**
 * The brush studio: the brush editor's settings over the whole screen, for building a brush, laid out as Procreate's
 * Brush Studio. In landscape, three columns: the brush's name, a stroke preview and the categories; the chosen
 * category's rows; and a drawing pad (the caller's `pad`) taking the remaining half, with Cancel and Done at its top
 * right. In portrait the pad lies across the top and the two columns share the space under it. Narrower than 700 px,
 * one part shows at a time: the categories, a category's rows, or the pad.
 *
 * It shows the same categories, rows, statuses and sections as `BrushEditor`, with each number
 * row on two lines: its label and its value in a pill that can be dragged or tapped to type, then a slider across the
 * column; a host may render number rows itself instead (`hostRow`). Controlled as `BrushEditor` is: every change
 * goes through `onChange` as a patch.
 *
 * Besides the editor's theme properties (`--surface`, `--ink`, `--muted`, `--line`, `--accent`), the studio reads
 * these from its host, each falling back to the studio's own look: `--studio-ground` behind the columns;
 * `--studio-column` and `--studio-column-ink`, `--studio-column-quiet` for the category and settings columns and the
 * text on them, `--studio-gap` around and between them and `--studio-column-radius`; `--studio-plate` under the
 * buttons over the pad; `--studio-tile`, `--studio-tile-ink` and `--studio-tile-radius` for its controls;
 * `--studio-chosen`, `--studio-chosen-ink` and `--studio-chosen-ring` for the chosen category and option and a switch
 * that is on; `--studio-row-gap` between rows; and `--studio-text`, `--studio-small` and `--studio-name` for its type.
 *
 * Cancel and Done both leave the studio through `onDone`. Cancel first sends `baseline`, discarding every change made
 * since it, as a sheet's Cancel does, and calls `onCancel` for what the host restores itself, such as the pen's curve;
 * the side panel's "Cancel changes" instead only reverts and stays open. Fills its parent, which the caller places
 * over the screen.
 *
 * With `penStatus`, a group headed "Pen" ends the sidebar with one entry, "Pressure", whose page is the host's
 * `penPane`: the pen's pressure curve belongs to the device, not to the brush, so it sits apart from the brush's
 * categories.
 */
export function BrushStudio(props: {
  brush: Brush;
  /** Generated categories supplied by an engine adapter; defaults to Paint settings. */
  categories?: readonly BrushCategory[];
  /** The settings Cancel returns to; see `BrushEditor`'s `baseline`. */
  baseline: BrushSettingsSnapshot;
  /** The name of the edited brush, shown as the studio's title; "Brush studio" without it. */
  name?: string;
  onChange: (patch: Partial<Brush>) => void;
  /** The host's rows for number settings; see `CategoryPane`. */
  hostRow?: Parameters<typeof CategoryPane>[0]['hostRow'];
  /** Leaves the studio: called by Done, and by Cancel once it has sent the baseline and called `onCancel`. */
  onDone: () => void;
  /** Called by Cancel before `onDone`, for the host to restore what it changed outside the brush. */
  onCancel?: () => void;
  /** The pen pressure entry's status in the sidebar, such as "Off"; the Pen group shows only with it. */
  penStatus?: string;
  /** The pen pressure page, made by the host: its curve and the ways to measure or reset it. */
  penPane?: JSX.Element;
  /** The stroke preview under the title, made by the caller, which owns the painting it needs. */
  preview?: JSX.Element;
  /** The area to draw on with the edited brush, such as a `DrawingPad`; it fills the pad's part of the studio. */
  pad?: JSX.Element;
}) {
  const changed = createMemo(() => brushSettingsDiffer(props.brush, props.baseline));
  const { categories, chosen, choose } = createCategoryChoice(props);
  /** Whether the pen's page is shown rather than the chosen category's. */
  const [penShown, setPenShown] = createSignal(false);
  const penTitleId = createUniqueId();
  /** Below 700 px wide, which part is shown: the category list, the chosen category's rows or the pad. */
  const [view, setView] = createSignal<'list' | 'detail' | 'pad'>('list');
  const { sidebar, chooseSidebar } = createSidebarStyle();
  const [root, setRoot] = createSignal<HTMLElement>();
  createEffect(root, (element) => (element ? watchTapTargets(element) : undefined));

  return (
    <section ref={setRoot} class={styles.studioRoot} aria-label="Brush studio">
      <div class={[styles.frame, styles.studio]} data-view={view()} data-sidebar={sidebar()}>
        <div class={styles.studioSheet}>
          <div class={styles.studioSide}>
            <div class={styles.studioHead}>
              <h1 class={styles.studioName}>{props.name ?? 'Brush studio'}</h1>
              <div class={styles.studioPreview}>{props.preview}</div>
            </div>
            <CategorySidebar
              class={styles.studioList}
              categories={categories()}
              chosen={chosen()}
              brush={props.brush}
              onChoose={(category) => {
                choose(category);
                setPenShown(false);
                setView('detail');
              }}
              extra={
                props.penStatus === undefined
                  ? undefined
                  : {
                      items: [
                        { id: penEntry, label: 'Pressure', icon: 'pressure', trailing: props.penStatus, group: 'pen' }
                      ],
                      groups: [{ id: 'pen', label: 'Pen' }],
                      selected: penShown() ? penEntry : undefined,
                      onSelect: () => {
                        setPenShown(true);
                        setView('detail');
                      }
                    }
              }
            />
          </div>
          <Show
            when={penShown() && props.penStatus !== undefined}
            fallback={
              <CategoryPane
                category={chosen()}
                hostRow={props.hostRow}
                brush={props.brush}
                onChange={props.onChange}
                onBack={() => setView('list')}
              />
            }
          >
            <section class={[styles.pane, styles.penPane]} aria-labelledby={penTitleId} data-pen-pane>
              <button type="button" class={styles.back} onClick={() => setView('list')}>
                <SketchIcon name="left" size={18} />
                All categories
              </button>
              <h2 id={penTitleId} class={styles.title}>
                Pen pressure
              </h2>
              {props.penPane}
            </section>
          </Show>
        </div>
        <div class={styles.studioPad} role="region" aria-label="Drawing pad">
          {props.pad}
        </div>
        <div class={styles.studioActions}>
          <div class={styles.sidebarSwitch} role="radiogroup" aria-label="Sidebar style (trial)">
            <For each={sidebarStyles}>
              {(option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={sidebar() === option.id ? 'true' : 'false'}
                  title={option.title}
                  onClick={() => chooseSidebar(option.id)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
          <button
            type="button"
            class={styles.studioPadToggle}
            aria-pressed={view() === 'pad' ? 'true' : 'false'}
            onClick={() => setView(view() === 'pad' ? 'list' : 'pad')}
          >
            <SketchIcon name="pencil" size={18} />
            Pad
          </button>
          <button
            type="button"
            onClick={() => {
              if (changed()) {
                props.onChange(structuredClone(props.baseline));
              }

              props.onCancel?.();
              props.onDone();
            }}
          >
            Cancel
          </button>
          <button type="button" class={styles.done} onClick={() => props.onDone()}>
            Done
          </button>
        </div>
      </div>
    </section>
  );
}

/** The sidebar entry of the pen's page, apart from the brush's categories. */
const penEntry = 'pen-pressure';

/**
 * TEMPORARY, until the user picks one of the two sidebar styles while trying the studio; then the other style, this
 * switch and its stored choice go. "sidebar": the categories and the settings lie on one plate, divided by a hairline,
 * and the chosen category is an accent-filled pill, as in iPadOS and macOS Settings. "joined": the settings lie on a
 * lighter raised surface, and the chosen category takes that surface's color and runs into it.
 */
function createSidebarStyle() {
  const [sidebar, setSidebar] = createSignal<SidebarStyle>(storedSidebarStyle());

  return {
    sidebar,
    chooseSidebar: (style: SidebarStyle) => {
      setSidebar(style);
      try {
        localStorage.setItem(sidebarStyleKey, style);
      } catch {
        // Storage may be blocked or full; the choice then lasts while the studio is open.
      }
    }
  };
}

/** The sidebar styles on trial; see `createSidebarStyle`. */
const sidebarStyles = [
  { id: 'sidebar', label: 'Sidebar', title: 'Sidebar style: one plate, chosen category as a pill' },
  { id: 'joined', label: 'Joined', title: 'Sidebar style: chosen category joins the raised settings' }
] as const;

type SidebarStyle = (typeof sidebarStyles)[number]['id'];

/** Where the trial's choice is kept, per device. */
const sidebarStyleKey = 'paint.brushStudio.sidebar';

/** The stored sidebar style, "sidebar" when none is stored or storage cannot be read. */
function storedSidebarStyle(): SidebarStyle {
  try {
    return localStorage.getItem(sidebarStyleKey) === 'joined' ? 'joined' : 'sidebar';
  } catch {
    return 'sidebar';
  }
}
