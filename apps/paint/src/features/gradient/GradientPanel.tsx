import styles from '../brush/BrushPanel.module.css';
import type { GradientSettings } from './createGradient';

/** Settings of the gradient tool. It draws from the foreground color into the active layer. */
export function GradientPanel(props: {
  settings: GradientSettings;
  onChange: (patch: Partial<GradientSettings>) => void;
}) {
  return (
    <section>
      <label class={styles.mixing}>
        Shape
        <select
          aria-label="Gradient shape"
          value={props.settings.kind}
          onChange={(event) => props.onChange({ kind: event.currentTarget.value === 'radial' ? 'radial' : 'linear' })}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </label>
      <label class={styles.mixing}>
        Colors
        <select
          aria-label="Gradient colors"
          value={props.settings.end}
          onChange={(event) =>
            props.onChange({ end: event.currentTarget.value === 'transparent' ? 'transparent' : 'background' })
          }
        >
          <option value="background">Foreground to background</option>
          <option value="transparent">Foreground to transparent</option>
        </select>
      </label>
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
      <label class={styles.check}>
        <input
          type="checkbox"
          checked={props.settings.reverse}
          disabled={props.settings.end === 'transparent'}
          onChange={(event) => props.onChange({ reverse: event.currentTarget.checked })}
        />
        Swap colors
      </label>
      <p class={styles.panelNote}>
        Drag on the canvas from where the gradient starts to where it ends. Smooth color mixes in linear light, without
        the dark middle of Classic. The gradient covers the lasso selection, or else the view.
      </p>
    </section>
  );
}
