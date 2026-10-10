import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { For, Show } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import styles from './panels.module.css';

/**
 * The kinds of symmetry: off, mirrored across one or two axes, or repeated around the center; radial and mandala
 * symmetry also take a number of segments. A guide turned on starts at the center of the view (the caller's
 * `onMode`).
 */
export function SymmetryPanel(props: {
  symmetry: PaintSymmetry;
  /** Symmetry cannot change now, for example while a selection is applied. */
  disabled: boolean;
  onMode: (mode: PaintSymmetry['mode']) => void;
  onSegments: (segments: number) => void;
}) {
  return (
    <>
      <header class={styles.header}>
        <h2>Symmetry</h2>
      </header>
      <div class={styles.options} role="radiogroup" aria-label="Symmetry">
        <For each={symmetryModes}>
          {(mode) => (
            <button
              class={styles.option}
              role="radio"
              aria-checked={props.symmetry.mode === mode.id ? 'true' : 'false'}
              disabled={props.disabled}
              onClick={() => props.onMode(mode.id)}
            >
              {mode.label}
            </button>
          )}
        </For>
      </div>
      <Show when={props.symmetry.mode === 'radial' || props.symmetry.mode === 'mandala'}>
        <div class={styles.field}>
          <span>Segments</span>
          <ScrubNumber
            label="Segments"
            value={props.symmetry.segments}
            min={3}
            max={10}
            disabled={props.disabled}
            onChange={(segments) => props.onSegments(segments)}
          />
        </div>
      </Show>
    </>
  );
}

const symmetryModes: { id: PaintSymmetry['mode']; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'dual', label: 'Both axes' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'radial', label: 'Radial' },
  { id: 'mandala', label: 'Mandala' }
];
