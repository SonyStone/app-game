import { For } from 'solid-js';
import { ariaState } from '../shared/format';
import styles from './comparison.module.css';
import type { ViewMode } from './createComparison';

/** Segmented buttons choosing what the canvas shows. */
export function ViewSwitch(props: { view: ViewMode; onView: (view: ViewMode) => void; disabled?: boolean }) {
  return (
    <div class={styles.switch} role="group" aria-label="View">
      <For each={modes}>
        {(mode) => (
          <button
            type="button"
            aria-pressed={ariaState(props.view === mode.value)}
            disabled={props.disabled}
            title={mode.title}
            onClick={() => props.onView(mode.value)}
          >
            {mode.label}
          </button>
        )}
      </For>
    </div>
  );
}

const modes: { value: ViewMode; label: string; title: string }[] = [
  { value: 'ours', label: 'Our render', title: 'The document composited by the Rust renderer' },
  { value: 'photoshop', label: 'Photoshop', title: 'The merged image Photoshop saved with the document' },
  { value: 'difference', label: 'Difference', title: 'Where our render differs from Photoshop’s merged image' }
];
