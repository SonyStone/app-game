import styles from '../brush/BrushPanel.module.css';
import type { FillSettings } from './createFill';

/** Settings of the bucket fill. It fills with the current color, into the active layer. */
export function FillPanel(props: { settings: FillSettings; onChange: (patch: Partial<FillSettings>) => void }) {
  return (
    <section>
      <label class={styles.range}>
        <span>
          Tolerance
          <output>{props.settings.tolerance}</output>
        </span>
        <input
          aria-label="Fill tolerance"
          type="range"
          min={0}
          max={255}
          value={props.settings.tolerance}
          onInput={(event) => props.onChange({ tolerance: event.currentTarget.valueAsNumber })}
        />
      </label>
      <label class={styles.range}>
        <span>
          Expand
          <output>{props.settings.expand} px</output>
        </span>
        <input
          aria-label="Fill expand"
          type="range"
          min={0}
          max={32}
          value={props.settings.expand}
          onInput={(event) => props.onChange({ expand: event.currentTarget.valueAsNumber })}
        />
      </label>
      <label class={styles.range}>
        <span>
          Close gaps
          <output>{props.settings.gap ? `${props.settings.gap * 2} px` : 'Off'}</output>
        </span>
        <input
          aria-label="Fill close gaps"
          type="range"
          min={0}
          max={16}
          value={props.settings.gap}
          onInput={(event) => props.onChange({ gap: event.currentTarget.valueAsNumber })}
        />
      </label>
      <label class={styles.range}>
        <span>
          Opacity
          <output>{Math.round(props.settings.opacity * 100)}%</output>
        </span>
        <input
          aria-label="Fill opacity"
          type="range"
          min={1}
          max={100}
          value={Math.round(props.settings.opacity * 100)}
          onInput={(event) => props.onChange({ opacity: event.currentTarget.valueAsNumber / 100 })}
        />
      </label>
      <label class={styles.mixing}>
        Sample
        <select
          aria-label="Fill sample"
          value={props.settings.source}
          onChange={(event) => props.onChange({ source: event.currentTarget.value === 'layer' ? 'layer' : 'all' })}
        >
          <option value="all">All layers</option>
          <option value="layer">Active layer</option>
        </select>
      </label>
      <p class={styles.panelNote}>
        Fills the area of similar color around the click with the current color, into the active layer. Tolerance
        decides how different a color may be; Expand grows the fill under line edges; Close gaps keeps it from leaking
        through openings in the line art up to that wide. The fill stays inside the view.
      </p>
    </section>
  );
}
