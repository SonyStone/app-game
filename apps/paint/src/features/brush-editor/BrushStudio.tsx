import type { Brush } from '@app-game/paint-core/brush';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { CategoryList, CategoryPane, createCategoryChoice } from './BrushCategories';
import styles from './BrushEditor.module.css';
import { brushSettingsDiffer, type BrushCategory, type BrushPins, type BrushSettingsSnapshot } from './schema';

/**
 * The brush studio: the brush editor's settings over the whole screen, for building a brush, laid out as Procreate's
 * Brush Studio. In landscape, three columns: the brush's name, a stroke preview and the categories; the chosen
 * category's rows; and a drawing pad (the caller's `pad`) taking the remaining half, with Cancel and Done at its top
 * right. In portrait the pad lies across the top and the two columns share the space under it. Narrower than 700 px,
 * one part shows at a time: the categories, a category's rows, or the pad.
 *
 * It shows the same categories, rows, statuses, sections and "About" disclosures as `BrushEditor`, with each number
 * row on two lines: its label and its value in a pill that can be dragged or tapped to type, then a slider across the
 * column. Controlled as `BrushEditor` is: every change goes through `onChange` as a patch.
 *
 * Cancel and Done both leave the studio through `onDone`. Cancel first sends `baseline`, discarding every change made
 * since it, as a sheet's Cancel does; the side panel's "Cancel changes" instead only reverts and stays open.
 * Fills its parent, which the caller places over the screen.
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
  /**
   * The host board's pins: when given, each number row ends with a button that pins the setting to the board or
   * unpins it, and a pinned row is marked.
   */
  pins?: BrushPins;
  /** Leaves the studio: called by Done, and by Cancel once it has sent the baseline. */
  onDone: () => void;
  /** The stroke preview under the title, made by the caller, which owns the painting it needs. */
  preview?: JSX.Element;
  /** The area to draw on with the edited brush, such as a `DrawingPad`; it fills the pad's part of the studio. */
  pad?: JSX.Element;
}) {
  const changed = createMemo(() => brushSettingsDiffer(props.brush, props.baseline));
  const { categories, chosen, choose } = createCategoryChoice(props);
  /** Below 700 px wide, which part is shown: the category list, the chosen category's rows or the pad. */
  const [view, setView] = createSignal<'list' | 'detail' | 'pad'>('list');
  const [root, setRoot] = createSignal<HTMLElement>();
  createEffect(root, (element) => (element ? watchTapTargets(element) : undefined));

  return (
    <section ref={setRoot} class={styles.studioRoot} aria-label="Brush studio">
      <div class={[styles.frame, styles.studio]} data-view={view()}>
        <div class={styles.studioSide}>
          <div class={styles.studioHead}>
            <h1 class={styles.studioName}>{props.name ?? 'Brush studio'}</h1>
            <div class={styles.studioPreview}>{props.preview}</div>
          </div>
          <CategoryList
            categories={categories()}
            chosen={chosen()}
            brush={props.brush}
            onChoose={(category) => {
              choose(category);
              setView('detail');
            }}
          />
        </div>
        <CategoryPane
          category={chosen()}
          pins={props.pins}
          brush={props.brush}
          onChange={props.onChange}
          onBack={() => setView('list')}
        />
        <div class={styles.studioPad} role="region" aria-label="Drawing pad">
          {props.pad}
        </div>
        <div class={styles.studioActions}>
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
