import type { Brush } from '@app-game/paint-core/brush';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { Show } from 'solid-js';
import styles from './BrushPanel.module.css';
import { maxBrushSize } from './createBrushTools';

/** Settings changed in everyday painting: size, opacity, flow and stroke smoothing. */
export function BrushDailyControls(props: BrushControlsProps) {
  const update = strokeUpdater(props);

  return (
    <section>
      <Range
        label="Size"
        value={props.brush.size}
        min={1}
        max={maxBrushSize(props.brush)}
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
      <label class={styles.mixing}>
        Smoothing
        <select
          aria-label="Stroke smoothing"
          value={props.brush.stroke.mode}
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
      <Show when={props.brush.stroke.mode === 'none'}>
        <p class={styles.panelNote}>No path smoothing or stabilization. Brush stamps connect input points directly.</p>
      </Show>
      <Show when={isLeonardo(props.brush)}>
        <Range
          label="Stabilization"
          min={0}
          max={49}
          suffix=""
          value={props.brush.stroke.mode === 'smooth' ? props.brush.stroke.smooth : props.brush.stroke.normal}
          change={(value) => update(props.brush.stroke.mode === 'smooth' ? { smooth: value } : { normal: value })}
        />
      </Show>
    </section>
  );
}

/**
 * Settings of the brush editor: tip hardness and spacing, pressure, Leonardo pen calibration and color mixing. ABR
 * presets keep their own tip shape and pressure dynamics, so their hardness and pressure switches are not shown.
 */
export function BrushAdvancedControls(props: BrushControlsProps) {
  const update = strokeUpdater(props);
  const stroke = () => props.brush.stroke;

  return (
    <section>
      <div class={styles.sectionHeading}>
        <span>{tipLabels[props.brush.engine?.id ?? 'round'] ?? 'Brush tip'}</span>
      </div>
      <Show when={props.brush.engine === undefined}>
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
      <Show when={props.brush.engine?.id !== 'abr'}>
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
      </Show>
      <Show when={isLeonardo(props.brush)}>
        <p class={styles.panelNote}>
          Higher stabilization smooths more and follows the pen more slowly. Zero keeps curve smoothing only.
        </p>
        <Show when={stroke().mode === 'smooth'}>
          <label class={styles.check}>
            <input
              type="checkbox"
              checked={stroke().catchUp}
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
            max={Math.round(stroke().maximum * 100) - 1}
            suffix="%"
            value={stroke().minimum * 100}
            change={(value) => update({ minimum: value / 100 })}
          />
          <Range
            label="Pressure maximum"
            min={Math.round(stroke().minimum * 100) + 1}
            max={100}
            suffix="%"
            value={stroke().maximum * 100}
            change={(value) => update({ maximum: value / 100 })}
          />
          <Range
            label="Pressure firmness"
            min={10}
            max={500}
            step={5}
            suffix="%"
            value={stroke().firmness * 100}
            change={(value) => update({ firmness: value / 100 })}
          />
          <p class={styles.panelNote}>
            Minimum and maximum set the pen's pressure range. Firmness at 100% is linear; higher values need a firmer
            press.
          </p>
        </details>
      </Show>
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
  );
}

/** Props of the brush controls. */
type BrushControlsProps = {
  /** Settings captured by the next stroke. */
  brush: Brush;
  /** Receives changed settings; the caller merges them into the brush. */
  onChange: (patch: Partial<Brush>) => void;
};

/** Section headings by brush engine id. */
const tipLabels: Record<string, string> = { round: 'Soft round', textured: 'Textured tip', abr: 'ABR brush' };

/** Merges stroke settings into the brush, keeping them normalized; Leonardo modes keep independent values. */
function strokeUpdater(props: BrushControlsProps) {
  return (patch: Partial<StrokeSettings>) =>
    props.onChange({ stroke: normalizeStrokeSettings({ ...props.brush.stroke, ...patch }) });
}

function isLeonardo(brush: Brush) {
  return brush.stroke.mode === 'normal' || brush.stroke.mode === 'smooth';
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
