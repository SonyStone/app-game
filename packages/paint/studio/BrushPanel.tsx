import { For } from 'solid-js';
import type { PaintSession } from './createPaintSession';

/** Controls the captured settings of the next stroke, including independent flow and opacity. */
export function BrushPanel(props: Pick<PaintSession, 'brush' | 'updateBrush'>) {
  const { brush, updateBrush } = props;
  return (
    <>
      <section>
        <div class="paint-section-heading">
          <span>Soft round</span>
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
        <Range
          label="Hardness"
          value={brush().hardness * 100}
          min={0}
          max={100}
          suffix="%"
          change={(hardness) => updateBrush({ hardness: hardness / 100 })}
        />
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
