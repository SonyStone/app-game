import licenseUrl from '@app-game/chroma/io/cmyk/LittleCMS-LICENSE.txt?url';
import { createContext, Show, useContext } from 'solid-js';
import styles from './ColorProfile.module.css';
import type { createColorProfile } from './createColorProfile';

/** Editor-owned profile. Independent editor instances never share source-profile selection. */
export const ColorProfileContext = createContext<ReturnType<typeof createColorProfile> | null>(null);

/** Optional for standalone preview/editor components with RGB-only presets. */
export function useColorProfile() {
  return useContext(ColorProfileContext);
}

/** A source-profile choice, deliberately separate from saved preset colors and undo history. */
export function ColorProfileControl() {
  const colors = useColorProfile();
  return (
    <Show when={colors}>
      {(state) => (
        <div class={styles.colorProfile}>
          <label>
            CMYK source profile
            <input
              type="file"
              aria-label="CMYK source profile"
              accept=".icc,.icm"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void state().select(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <p class={styles.featureNote} role="status">
            {state().loading()
              ? 'Opening profile…'
              : (state().profile()?.name ?? 'Select the CMYK working profile used by Photoshop.')}
          </p>
          <Show when={state().profile()}>
            <button onClick={() => state().clear()}>Clear profile</button>
          </Show>
          <Show when={state().error()}>
            <p class={styles.validation} role="alert">
              {state().error()}
            </p>
          </Show>
          <p class={styles.featureNote}>
            <a href={licenseUrl} target="_blank" rel="noreferrer">
              LittleCMS
            </a>{' '}
            converts to sRGB using relative colorimetric and black point compensation. Original CMYK values stay in the
            exported ABR. This profile applies to this editor session; Adobe color conversion may differ.
          </p>
        </div>
      )}
    </Show>
  );
}
