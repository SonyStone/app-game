import type { PsdInterpolation, PsdRenderSettings } from '@app-game/psd/viewer';
import { For } from 'solid-js';
import styles from './RenderSettingsPanel.module.css';

/**
 * Photoshop's rendering preferences as controls. Changes go to `onChange` as patches; the panel shows `settings`,
 * which callers should read with `latest` so a toggle shows at once while the render it starts is in flight.
 */
export function RenderSettingsPanel(props: {
  settings: PsdRenderSettings;
  onChange: (patch: Partial<PsdRenderSettings>) => void;
  onReset: () => void;
}) {
  return (
    <section class={styles.panel} aria-label="Render settings">
      <header>
        <h2>Render settings</h2>
        <button type="button" onClick={() => props.onReset()} title="Photoshop's default Color Settings">
          Defaults
        </button>
      </header>
      <label>
        <input
          type="checkbox"
          checked={props.settings.linearBlending}
          onChange={(event) => props.onChange({ linearBlending: event.currentTarget.checked })}
        />
        Blend RGB colors using gamma 1.0
      </label>
      <label>
        <input
          type="checkbox"
          checked={props.settings.textGamma !== null}
          onChange={(event) => props.onChange({ textGamma: event.currentTarget.checked ? textGamma : null })}
        />
        Blend text colors using gamma {textGamma}
      </label>
      <label>
        <input
          type="checkbox"
          checked={props.settings.vectorPaths}
          onChange={(event) => props.onChange({ vectorPaths: event.currentTarget.checked })}
        />
        Vector masks and shapes from paths
      </label>
      <label class={styles.select}>
        Smart objects
        <select
          value={props.settings.smartObjects ?? cached}
          onChange={(event) => {
            const value = event.currentTarget.value;
            props.onChange({ smartObjects: value === cached ? null : (value as PsdInterpolation) });
          }}
        >
          <option value={cached}>Cached rasters</option>
          <For each={interpolations}>{(choice) => <option value={choice.value}>Re-render: {choice.label}</option>}</For>
        </select>
      </label>
      <label title="Render what the exact path refuses, listing each approximation below the canvas. RGB and Grayscale documents leave out or substitute the refused settings (unrendered effects, Dissolve and Gradient Map dither without Photoshop's noise tables, unreconstructed adjustments, wide mask feathers); 16- and 32-bit documents the depth compositor refuses render at 8 bits; Indexed, Duotone and Multichannel documents, and CMYK and Lab layers the channel compositor does not reproduce, render with every layer converted to sRGB first. Documents the exact path renders are unchanged.">
        <input
          type="checkbox"
          checked={props.settings.approximate}
          onChange={(event) => props.onChange({ approximate: event.currentTarget.checked })}
        />
        Approximate unsupported settings
      </label>
    </section>
  );
}

/** Photoshop's default "Blend Text Colors Using Gamma" value. */
const textGamma = 1.45;

const cached = 'cached';

const interpolations: { value: PsdInterpolation; label: string }[] = [
  { value: 'nearestNeighbor', label: 'Nearest Neighbor' },
  { value: 'bilinear', label: 'Bilinear' },
  { value: 'bicubic', label: 'Bicubic' },
  { value: 'bicubicSmoother', label: 'Bicubic Smoother' },
  { value: 'bicubicSharper', label: 'Bicubic Sharper' },
  { value: 'bicubicAutomatic', label: 'Bicubic Automatic' }
];
