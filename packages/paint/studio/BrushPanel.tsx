import { For, Show } from 'solid-js';
import type { PaintSession } from './createPaintSession';
import { normalizeStrokeSettings, type StrokeSettings } from './strokeSettings';

/** Controls the captured settings of the next stroke, including independent flow and opacity. */
export function BrushPanel(props: Pick<PaintSession, 'brush' | 'updateBrush'>) {
  const { brush, updateBrush } = props;
  return (
    <>
      <StrokeControls brush={brush} updateBrush={updateBrush} />
      <section>
        <div class="paint-section-heading">
          <span>{brush().engine?.id === 'textured' ? 'Textured tip' : 'Soft round'}</span>
        </div>
        <Range
          label="Size"
          value={brush().size}
          min={1}
          max={512}
          step={1}
          suffix=" px"
          change={(size) => updateBrush({ size })}
        />
        <Range
          label="Opacity"
          value={brush().opacity * 100}
          min={1}
          max={100}
          suffix="%"
          change={(opacity) => updateBrush({ opacity: opacity / 100 })}
        />
        <Range
          label="Flow"
          value={brush().flow * 100}
          min={1}
          max={100}
          suffix="%"
          change={(flow) => updateBrush({ flow: flow / 100 })}
        />
        <Show when={brush().engine?.id !== 'textured'}>
          <Range
            label="Hardness"
            value={brush().hardness * 100}
            min={0}
            max={100}
            suffix="%"
            change={(hardness) => updateBrush({ hardness: hardness / 100 })}
          />
        </Show>
        <Show when={brush().engine?.id === 'textured'}>
          <Range
            label="Tip spacing"
            value={brush().spacing * 100}
            min={1}
            max={100}
            suffix="%"
            change={(spacing) => updateBrush({ spacing: spacing / 100 })}
          />
        </Show>
        <label class="paint-check">
          <input
            type="checkbox"
            checked={brush().pressureSize}
            onChange={(e) => updateBrush({ pressureSize: e.currentTarget.checked })}
          />
          Pressure controls size
        </label>
        <label class="paint-check">
          <input
            type="checkbox"
            checked={brush().pressureFlow}
            onChange={(e) => updateBrush({ pressureFlow: e.currentTarget.checked })}
          />
          Pressure controls flow
        </label>
        <label class="paint-mixing">
          Color mixing
          <select
            aria-label="Brush color mixing"
            value={brush().mixing}
            onChange={(e) => updateBrush({ mixing: e.currentTarget.value === 'linear' ? 'linear' : 'classic' })}
          >
            <option value="linear">Smooth color</option>
            <option value="classic">Classic</option>
          </select>
        </label>
      </section>
    </>
  );
}

/** Color controls open independently of the brush parameters. */
export function ColorPanel(props: Pick<PaintSession, 'brush' | 'updateBrush'>) {
  const { brush, updateBrush } = props;
  return (
    <>
      <section>
        <div class="paint-section-heading">
          <code>{brush().color.toUpperCase()}</code>
        </div>
        <label class="paint-color-field" style={{ background: brush().color }}>
          <input
            aria-label="Brush color"
            type="color"
            value={brush().color}
            onInput={(e) => updateBrush({ color: e.currentTarget.value })}
          />
          <span>Choose color</span>
        </label>
        <div class="paint-swatches">
          <For
            each={[
              '#1e252b',
              '#ffffff',
              '#ff0000',
              '#00e85d',
              '#167bd7',
              '#ffce32',
              '#a9624a',
              '#9183a1',
              '#344b66',
              '#77856d',
              '#e78db0',
              '#ece6da'
            ]}
          >
            {(color) => (
              <button
                aria-label={`Set color ${color}`}
                title={color}
                style={{ background: color }}
                class={{ selected: brush().color === color }}
                onClick={() => updateBrush({ color })}
              />
            )}
          </For>
        </div>
      </section>
    </>
  );
}

/** Selects raw input or curve smoothing for the next stroke; Leonardo retains independent filter settings. */
function StrokeControls(props: Pick<PaintSession, 'brush' | 'updateBrush'>) {
  const settings = () => props.brush().stroke;
  const update = (patch: Partial<StrokeSettings>) =>
    props.updateBrush({ stroke: normalizeStrokeSettings({ ...settings(), ...patch }) });
  return (
    <section>
      <label class="paint-mixing">
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
        <p class="paint-panel-note">No path smoothing or stabilization. Brush stamps connect input points directly.</p>
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
        <p class="paint-panel-note">
          Higher values smooth more and follow the pen more slowly. Zero keeps curve smoothing only.
        </p>
        <Show when={settings().mode === 'smooth'}>
          <label class="paint-check">
            <input
              type="checkbox"
              checked={settings().catchUp}
              onChange={(event) => update({ catchUp: event.currentTarget.checked })}
            />
            Catch up on pen lift
          </label>
        </Show>
        <details class="paint-pressure-controls">
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
          <p class="paint-panel-note">
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
    <label class="paint-range">
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
