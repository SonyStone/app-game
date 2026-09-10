import { For, Show } from 'solid-js';
import type { PaintSession } from './createPaintSession';
import styles from './SymmetryPanel.module.css';
import { supportsPaintSymmetry, type PaintSymmetry } from './symmetry';

/** Document controls; changing guides never changes an ABR preset or the camera's mirror state. */
export function SymmetryPanel(props: { session: PaintSession }) {
  const symmetry = props.session.symmetry;
  const update = (change: Partial<PaintSymmetry>) => props.session.updateSymmetry({ ...symmetry(), ...change });
  return (
    <fieldset
      class={styles.symmetryControls}
      aria-label="Symmetry controls"
      disabled={!props.session.canUpdateSymmetry()}
    >
      <label>
        Symmetry
        <select
          aria-label="Paint symmetry mode"
          value={symmetry().mode}
          onChange={(event) => {
            const mode = event.currentTarget.value as PaintSymmetry['mode'];
            update({
              mode,
              segments: mode === 'mandala' ? Math.max(3, Math.min(10, symmetry().segments)) : symmetry().segments
            });
          }}
        >
          <For each={modes}>{(mode) => <option value={mode.value}>{mode.label}</option>}</For>
        </select>
      </label>
      <Show when={symmetry().mode !== 'off'}>
        <Show when={!supportsPaintSymmetry(props.session.brush()) || props.session.tool() === 'lasso'}>
          <p class={styles.panelNote}>
            Symmetry is inactive for this tool. Choose Brush, Pencil or Eraser with a round or sampled tip.
          </p>
        </Show>
        <Show when={symmetry().mode === 'radial' || symmetry().mode === 'mandala'}>
          <label>
            Segments
            <input
              type="number"
              aria-label="Symmetry segments"
              min={symmetry().mode === 'mandala' ? 3 : 2}
              max={symmetry().mode === 'mandala' ? 10 : 12}
              step="1"
              value={symmetry().segments}
              onChange={(event) => {
                if (event.currentTarget.validity.valid && Number.isFinite(event.currentTarget.valueAsNumber))
                  update({ segments: event.currentTarget.valueAsNumber });
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
            value={Math.round((symmetry().angle * 180) / Math.PI)}
            onChange={(event) => {
              if (event.currentTarget.validity.valid && Number.isFinite(event.currentTarget.valueAsNumber))
                update({ angle: (event.currentTarget.valueAsNumber * Math.PI) / 180 });
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
                value={symmetry()[axis]}
                onChange={(event) => {
                  if (Number.isFinite(event.currentTarget.valueAsNumber))
                    update({ [axis]: event.currentTarget.valueAsNumber });
                }}
              />
            </label>
          )}
        </For>
        <button onClick={() => update({ x: props.session.camera().x, y: props.session.camera().y })}>
          Center in view
        </button>
        <label class={styles.checkbox}>
          <input
            type="checkbox"
            checked={symmetry().visible}
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
] as const;
