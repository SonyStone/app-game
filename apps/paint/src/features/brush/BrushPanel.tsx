import type { Brush } from '@app-game/paint-core/brush';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { Show } from 'solid-js';
import styles from './BrushPanel.module.css';

/** Controls the captured settings of the next stroke, including independent flow and opacity. */
export function BrushPanel(props: BrushControlsProps) {
  return (
    <>
      <StrokeControls brush={props.brush} onChange={props.onChange} />
      <section>
        <div class={styles.sectionHeading}>
          <span>{props.brush.engine?.id === 'textured' ? 'Textured tip' : 'Soft round'}</span>
        </div>
        <Range
          label="Size"
          value={props.brush.size}
          min={1}
          max={512}
          step={1}
          suffix=" px"
          change={(size) => props.onChange({ size })}
        />
        <Range
          label="Opacity"
          value={props.brush.opacity * 100}
          min={1}
          max={100}
          suffix="%"
          change={(opacity) => props.onChange({ opacity: opacity / 100 })}
        />
        <Range
          label="Flow"
          value={props.brush.flow * 100}
          min={1}
          max={100}
          suffix="%"
          change={(flow) => props.onChange({ flow: flow / 100 })}
        />
        <Show when={props.brush.engine?.id !== 'textured'}>
          <Range
            label="Hardness"
            value={props.brush.hardness * 100}
            min={0}
            max={100}
            suffix="%"
            change={(hardness) => props.onChange({ hardness: hardness / 100 })}
          />
        </Show>
        <Show when={props.brush.engine?.id === 'textured'}>
          <Range
            label="Tip spacing"
            value={props.brush.spacing * 100}
            min={1}
            max={100}
            suffix="%"
            change={(spacing) => props.onChange({ spacing: spacing / 100 })}
          />
        </Show>
        <label class={styles.check}>
          <input
            type="checkbox"
            checked={props.brush.pressureSize}
            onChange={(e) => props.onChange({ pressureSize: e.currentTarget.checked })}
          />
          Pressure controls size
        </label>
        <label class={styles.check}>
          <input
            type="checkbox"
            checked={props.brush.pressureFlow}
            onChange={(e) => props.onChange({ pressureFlow: e.currentTarget.checked })}
          />
          Pressure controls flow
        </label>
        <label class={styles.mixing}>
          Color mixing
          <select
            aria-label="Brush color mixing"
            value={props.brush.mixing}
            onChange={(e) => props.onChange({ mixing: e.currentTarget.value === 'linear' ? 'linear' : 'classic' })}
          >
            <option value="linear">Smooth color</option>
            <option value="classic">Classic</option>
          </select>
        </label>
      </section>
    </>
  );
}

/** Props of the brush panel. */
type BrushControlsProps = {
  /** Settings captured by the next stroke. */
  brush: Brush;
  /** Receives changed settings; the caller merges them into the brush. */
  onChange: (patch: Partial<Brush>) => void;
};

/** Selects raw input or curve smoothing for the next stroke; Leonardo retains independent filter settings. */
function StrokeControls(props: BrushControlsProps) {
  const settings = () => props.brush.stroke;
  const update = (patch: Partial<StrokeSettings>) =>
    props.onChange({ stroke: normalizeStrokeSettings({ ...settings(), ...patch }) });

  return (
    <section>
      <label class={styles.mixing}>
        Stroke smoothing
        <select
          aria-label="Stroke smoothing"
          value={settings().mode}
          onChange={(event) => {
            const mode = event.currentTarget.value;
            update({ mode: mode === 'none' || mode === 'normal' || mode === 'smooth' ? mode : 'studio' });
          }}
        >
          <option value="none">None (raw input)</option>
          <option value="studio">Studio</option>
          <option value="normal">Leonardo normal</option>
          <option value="smooth">Leonardo smooth</option>
        </select>
      </label>
      <Show when={settings().mode === 'none'}>
        <p class={styles.panelNote}>No path smoothing or stabilization. Brush stamps connect input points directly.</p>
      </Show>
      <Show when={settings().mode === 'normal' || settings().mode === 'smooth'}>
        <Range
          label="Stabilization"
          min={0}
          max={49}
          suffix=""
          value={settings().mode === 'smooth' ? settings().smooth : settings().normal}
          change={(value) => update(settings().mode === 'smooth' ? { smooth: value } : { normal: value })}
        />
        <p class={styles.panelNote}>
          Higher values smooth more and follow the pen more slowly. Zero keeps curve smoothing only.
        </p>
        <Show when={settings().mode === 'smooth'}>
          <label class={styles.check}>
            <input
              type="checkbox"
              checked={settings().catchUp}
              onChange={(event) => update({ catchUp: event.currentTarget.checked })}
            />
            Catch up on pen lift
          </label>
        </Show>
        <details class={styles.pressureControls}>
          <summary>Pen pressure</summary>
          <Range
            label="Pressure minimum"
            min={0}
            max={Math.round(settings().maximum * 100) - 1}
            suffix="%"
            value={settings().minimum * 100}
            change={(value) => update({ minimum: value / 100 })}
          />
          <Range
            label="Pressure maximum"
            min={Math.round(settings().minimum * 100) + 1}
            max={100}
            suffix="%"
            value={settings().maximum * 100}
            change={(value) => update({ maximum: value / 100 })}
          />
          <Range
            label="Pressure firmness"
            min={10}
            max={500}
            step={5}
            suffix="%"
            value={settings().firmness * 100}
            change={(value) => update({ firmness: value / 100 })}
          />
          <p class={styles.panelNote}>
            Minimum and maximum set the pen's pressure range. Firmness at 100% is linear; higher values need a firmer
            press.
          </p>
        </details>
      </Show>
    </section>
  );
}

/** Labeled brush range; values shown in UI units and converted by its caller. */
function Range(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  change: (value: number) => void;
}) {
  return (
    <label class={styles.range}>
      <span>
        {props.label}
        <output>
          {Math.round(props.value)}
          {props.suffix}
        </output>
      </span>
      <input
        aria-label={props.label}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.change(e.currentTarget.valueAsNumber)}
      />
    </label>
  );
}
