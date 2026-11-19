import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, Show } from 'solid-js';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { CategoryList, CategoryPane, createCategoryChoice } from './BrushCategories';
import styles from './BrushEditor.module.css';
import type { BrushView } from './brushView';

/**
 * The brush editor: the brush's name and a stroke preview across the top, the categories (the registry's
 * `brushCategories`) in a column with a one-line status each, the chosen category's rows beside them, and Cancel
 * changes and Done at the bottom.
 *
 * Controlled: every change, also while a control is dragged, is sent through `onChange` as the brush document's next
 * text, for the caller to resolve and pass back as `brush`. Cancel changes calls `onRevert`, and is disabled while
 * nothing is `changed`; the editor keeps no settings of its own, so it may stay mounted while the brush is replaced.
 *
 * The layout follows the editor's own width, so the editor fits any panel: wide, the column shows names and
 * statuses; medium, icons only; narrow, the column alone, and a tap on a category shows its rows with a way back.
 * The editor fills its parent's height; the column and the rows scroll on their own.
 */
export function BrushEditor(props: {
  brush: BrushView;
  /** Whether the brush differs from what Cancel changes returns to; the caller decides what that is. */
  changed: boolean;
  /** Returns the brush to what it was, as when it was chosen or when editing began; see `changed`. */
  onRevert: () => void;
  /** The name of the edited brush, such as its preset's, shown above the preview; nothing is shown without it. */
  name?: string;
  onChange: (text: string) => void;
  onDone: () => void;
  /** The stroke preview, made by the caller, which owns the painting it needs. */
  preview?: JSX.Element;
}) {
  const { categories, chosen, choose } = createCategoryChoice(props);
  /** In the narrow layout, whether the category list or the chosen category's rows are shown. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [root, setRoot] = createSignal<HTMLElement>();
  createEffect(root, (element) => (element ? watchTapTargets(element) : undefined));

  return (
    <section ref={setRoot} class={styles.editor} aria-label="Brush editor">
      <div class={styles.frame} data-view={view()}>
        <div class={styles.top}>
          <Show when={props.name}>{(name) => <p class={styles.name}>{name()}</p>}</Show>
          <div class={styles.preview}>{props.preview}</div>
        </div>
        <div class={styles.body}>
          <CategoryList
            categories={categories()}
            chosen={chosen()}
            brush={props.brush}
            onChoose={(category) => {
              choose(category);
              setView('detail');
            }}
          />
          <CategoryPane
            category={chosen()}
            brush={props.brush}
            onChange={props.onChange}
            onBack={() => setView('list')}
          />
        </div>
        <footer class={styles.footer}>
          <button type="button" disabled={!props.changed} onClick={() => props.onRevert()}>
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
