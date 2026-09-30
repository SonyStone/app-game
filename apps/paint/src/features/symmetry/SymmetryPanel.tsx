import type { Point } from '@app-game/paint-core/camera';
import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { For, Show } from 'solid-js';
import styles from './SymmetryPanel.module.css';

/** Document symmetry controls; changing guides never changes a brush preset or the camera's mirror state. */
export function SymmetryPanel(props: {
  symmetry: PaintSymmetry;
  /** Controls are disabled while document commands are suspended. */
  disabled: boolean;
  /** The current tool ignores symmetry, for example the lasso or an unsupported brush. */
  inactive: boolean;
  /** Document point at the center of the view, used by "Center in view". */
  viewCenter: Point;
  /** Receives complete settings; the caller validates and applies them. */
  onChange: (symmetry: PaintSymmetry) => void;
}) {
  const update = (change: Partial<PaintSymmetry>) => props.onChange({ ...props.symmetry, ...change });

  return (
    <fieldset class={styles.symmetryControls} aria-label="Symmetry controls" disabled={props.disabled}>
      <label>
        Symmetry
        <select
          aria-label="Paint symmetry mode"
          value={props.symmetry.mode}
          onChange={(event) => {
            const mode = event.currentTarget.value as PaintSymmetry['mode'];
            const segments = props.symmetry.segments;
            update({ mode, segments: mode === 'mandala' ? Math.max(3, Math.min(10, segments)) : segments });
          }}
        >
          <For each={modes}>{(mode) => <option value={mode.value}>{mode.label}</option>}</For>
        </select>
      </label>
      <Show when={props.symmetry.mode !== 'off'}>
        <Show when={props.inactive}>
          <p class={styles.panelNote}>
            Symmetry is inactive for this tool. Choose Brush, Pencil or Eraser with a round or sampled tip.
          </p>
        </Show>
        <Show when={props.symmetry.mode === 'radial' || props.symmetry.mode === 'mandala'}>
          <label>
            Segments
            <input
              type="number"
              aria-label="Symmetry segments"
              min={props.symmetry.mode === 'mandala' ? 3 : 2}
              max={props.symmetry.mode === 'mandala' ? 10 : 12}
              step="1"
              value={props.symmetry.segments}
              onChange={(event) => {
                const input = event.currentTarget;
                if (input.validity.valid && Number.isFinite(input.valueAsNumber)) {
                  update({ segments: input.valueAsNumber });
                }
              }}
            />
          </label>
        </Show>
        <label>
          Angle
          <input
            type="number"
            aria-label="Symmetry angle"
            min="-180"
            max="180"
            step="1"
            value={Math.round((props.symmetry.angle * 180) / Math.PI)}
            onChange={(event) => {
              const input = event.currentTarget;
              if (input.validity.valid && Number.isFinite(input.valueAsNumber)) {
                update({ angle: (input.valueAsNumber * Math.PI) / 180 });
              }
            }}
          />
        </label>
        <For each={['x', 'y'] as const}>
          {(axis) => (
            <label>
              Center {axis.toUpperCase()}
              <input
                type="number"
                aria-label={`Symmetry center ${axis.toUpperCase()}`}
                step="any"
                value={props.symmetry[axis]}
                onChange={(event) => {
                  if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                    update({ [axis]: event.currentTarget.valueAsNumber });
                  }
                }}
              />
            </label>
          )}
        </For>
        <button onClick={() => update({ x: props.viewCenter.x, y: props.viewCenter.y })}>Center in view</button>
        <label class={styles.checkbox}>
          <input
            type="checkbox"
            checked={props.symmetry.visible}
            onChange={(event) => update({ visible: event.currentTarget.checked })}
          />
          Show symmetry guide
        </label>
        <p class={styles.panelNote}>
          Copies share one stroke and one Undo. Guides stay fixed in the document as you move the camera.
        </p>
      </Show>
    </fieldset>
  );
}

const modes = [
  { value: 'off', label: 'Off' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'dual', label: 'Dual axis' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'radial', label: 'Radial' },
  { value: 'mandala', label: 'Mandala' }
] as const satisfies readonly { value: PaintSymmetry['mode']; label: string }[];
