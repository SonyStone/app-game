import { Show } from 'solid-js';
import { registerSW } from 'virtual:pwa-register';
import { PaintStudio } from '../studio/PaintStudio';
import { paintBuild } from './buildInfo';
import { createPwa } from './createPwa';
import styles from './PaintApp.module.css';

/**
 * The standalone app: the editor plus installation, offline status and build identity in the drawing menu. Only this
 * host registers a service worker; the editor embedded in the playground never does.
 */
export function PaintApp() {
  const pwa = createPwa(registerSW);

  return (
    <PaintStudio
      applicationControls={
        <>
          <Show when={pwa.canInstall()}>
            <button disabled={pwa.installing()} onClick={() => void pwa.install()}>
              Install Paint
            </button>
          </Show>
          <p class={styles.panelNote} role="status">
            {pwa.status()}
          </p>
          <Show when={pwa.error()}>
            {(error) => (
              <p class={styles.panelNote} role="alert">
                {error().message}
              </p>
            )}
          </Show>
          <p class={styles.buildInfo} aria-label="App version">
            <span>{paintBuild?.development ? 'Development build' : 'Paint build'}</span>
            <Show when={paintBuild}>
              {(build) => (
                <>
                  <time datetime={build().builtAt}>{build().builtAt.slice(0, 19).replace('T', ' ')} UTC</time>
                  <span title={build().revision ?? undefined}>
                    {build().revision?.slice(0, 7) ?? 'No commit ID'}
                    {build().localChanges ? ' · local changes' : ''}
                  </span>
                </>
              )}
            </Show>
          </p>
        </>
      }
    />
  );
}
