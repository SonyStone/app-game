import { For } from 'solid-js';
import styles from '../brush/BrushPanel.module.css';
import { gradientKinds, gradientPresets, gradientRepeats, type GradientSettings } from './createGradient';
import gradientStyles from './Gradient.module.css';
import { GradientStops } from './GradientStops';

/**
 * Settings of the gradient tool: its shape, what happens past its end, color stops, mixing and opacity. It draws into
 * the active layer.
 */
export function GradientPanel(props: {
  settings: GradientSettings;
  /** The colors that `foreground` and `background` stops stand for now. */
  colors: { foreground: string; background: string };
  onChange: (patch: Partial<GradientSettings>) => void;
}) {
  return (
    <section>
      <label class={styles.mixing}>
        Shape
        <select
          aria-label="Gradient shape"
          value={props.settings.kind}
          onChange={(event) =>
            props.onChange({ kind: gradientKinds.find((kind) => kind === event.currentTarget.value) ?? 'linear' })
          }
        >
          <For each={gradientKinds}>{(kind) => <option value={kind}>{kindLabels[kind]}</option>}</For>
        </select>
      </label>
      <label class={styles.mixing}>
        Past the end
        <select
          aria-label="Gradient repeat"
          value={props.settings.repeat}
          onChange={(event) =>
            props.onChange({
              repeat: gradientRepeats.find((repeat) => repeat === event.currentTarget.value) ?? 'none'
            })
          }
        >
          <For each={gradientRepeats}>{(repeat) => <option value={repeat}>{repeatLabels[repeat]}</option>}</For>
        </select>
      </label>
      <div class={gradientStyles.presets} role="group" aria-label="Gradient presets">
        <button onClick={() => props.onChange({ stops: [...gradientPresets.background] })}>To background</button>
        <button onClick={() => props.onChange({ stops: [...gradientPresets.transparent] })}>To transparent</button>
        <button
          onClick={() =>
            props.onChange({ stops: props.settings.stops.map((stop) => ({ ...stop, position: 1 - stop.position })) })
          }
        >
          Reverse
        </button>
      </div>
      <GradientStops
        stops={props.settings.stops}
        colors={props.colors}
        linear={props.settings.mixing === 'linear'}
        onChange={(stops) => props.onChange({ stops })}
      />
      <label class={styles.mixing}>
        Mixing
        <select
          aria-label="Gradient mixing"
          value={props.settings.mixing}
          onChange={(event) =>
            props.onChange({ mixing: event.currentTarget.value === 'classic' ? 'classic' : 'linear' })
          }
        >
          <option value="linear">Smooth color</option>
          <option value="classic">Classic</option>
        </select>
      </label>
      <label class={styles.range}>
        <span>
          Opacity
          <output>{Math.round(props.settings.opacity * 100)}%</output>
        </span>
        <input
          aria-label="Gradient opacity"
          type="range"
          min={1}
          max={100}
          value={Math.round(props.settings.opacity * 100)}
          onInput={(event) => props.onChange({ opacity: event.currentTarget.valueAsNumber / 100 })}
        />
      </label>
      <p class={styles.panelNote}>
        Drag on the canvas from where the gradient starts to where it ends; an angle gradient turns clockwise around the
        start, a diamond has a corner at the end. Press the bar to add a color stop; drag a stop to move it. Smooth
        color mixes in linear light, without the dark middle of Classic. The gradient covers the lasso selection, or
        else the view.
      </p>
    </section>
  );
}

const kindLabels: Record<GradientSettings['kind'], string> = {
  linear: 'Linear',
  radial: 'Radial',
  angle: 'Angle',
  diamond: 'Diamond'
};

const repeatLabels: Record<GradientSettings['repeat'], string> = {
  none: 'Last color',
  repeat: 'Repeat',
  reflect: 'Reflect'
};
