import type { PsdInterpolation, PsdRenderSettings } from '@app-game/psd/viewer';
import { createEffect, createSignal, For, Show } from 'solid-js';
import styles from './RenderSettingsPanel.module.css';
import { loadWorkingCmyk, saveWorkingCmyk } from './workingCmyk';

/**
 * Photoshop's rendering preferences as controls. Changes go to `onChange` as patches; the panel shows `settings`,
 * which callers should read with `latest` so a toggle shows at once while the render it starts is in flight.
 * `detected` says which of the two gamma blending options shown were detected from the document's merged image.
 */
export function RenderSettingsPanel(props: {
  settings: PsdRenderSettings;
  detected: { linearBlending: boolean; textGamma: boolean };
  onChange: (patch: Partial<PsdRenderSettings>) => void;
  onReset: () => void;
}) {
  const [profileBusy, setProfileBusy] = createSignal(true);
  const [profileName, setProfileName] = createSignal('None');
  const [profileError, setProfileError] = createSignal('');
  createEffect(
    () => undefined,
    () => {
      void loadWorkingCmyk()
        .then((profile) => setProfileName(profile?.name ?? 'None'))
        .catch(() => setProfileError('Could not read the saved CMYK profile.'))
        .finally(() => setProfileBusy(false));
    }
  );

  /** Commit local profile bytes before invalidating every rendering worker's presentation cache. */
  async function chooseProfile(file?: File) {
    setProfileBusy(true);
    try {
      await saveWorkingCmyk(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined);
      setProfileName(file?.name ?? 'None');
      setProfileError('');
      props.onChange({ displayProfileRevision: Date.now() });
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <section class={styles.panel} aria-label="Render settings">
      <header>
        <h2>Display settings</h2>
        <button type="button" onClick={() => props.onReset()} title="Photoshop's default Color Settings">
          Defaults
        </button>
      </header>
      <label>
        Working CMYK profile
        <input
          type="file"
          accept=".icc,.icm"
          disabled={profileBusy()}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void chooseProfile(file);
            }
          }}
        />
      </label>
      <p class={styles.note}>{profileName()} · Stored only on this device</p>
      <button
        disabled={profileBusy()}
        type="button"
        onClick={() => {
          void chooseProfile();
        }}
      >
        Clear CMYK profile
      </button>
      <Show when={profileError()}>
        <p role="alert">{profileError()}</p>
      </Show>
      <label>
        <input
          type="checkbox"
          checked={props.settings.linearBlending}
          onChange={(event) => props.onChange({ linearBlending: event.currentTarget.checked })}
        />
        Blend RGB colors using gamma 1.0
      </label>
      <Show when={props.detected.linearBlending}>
        <p class={styles.note}>Detected from Photoshop's merged image</p>
      </Show>
      <label>
        <input
          type="checkbox"
          checked={props.settings.textGamma !== null}
          onChange={(event) => props.onChange({ textGamma: event.currentTarget.checked ? textGamma : null })}
        />
        Blend text colors using gamma {textGamma}
      </label>
      <Show when={props.detected.textGamma}>
        <p class={styles.note}>Detected from Photoshop's merged image</p>
      </Show>
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
      <label title="Render what the exact path refuses, listing each approximation below the canvas. RGB and Grayscale documents leave out or substitute the refused settings (each drawn by the nearest model the renderer has, or left out where it has none); 16- and 32-bit documents the depth compositor refuses render at their own depth where it has a model of what it refuses, otherwise at 8 bits; Indexed, Duotone and Multichannel documents, and CMYK and Lab layers the channel compositor does not reproduce, render with every layer converted to sRGB first. Documents the exact path renders are unchanged.">
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
