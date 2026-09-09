import { registerSW } from 'virtual:pwa-register';
import { Show } from 'solid-js';
import PaintStudio from '../PaintStudio';
import { createPwa } from './createPwa';

/** Standalone host owns installation and offline status; the embedded editor never registers a service worker. */
export function PaintApp() {
  const pwa = createPwa(registerSW);
  return <PaintStudio applicationControls={<>
    <Show when={pwa.canInstall()}>
      <button disabled={pwa.installing()} onClick={() => void pwa.install()}>Install Paint</button>
    </Show>
    <p class="paint-panel-note" role="status">{pwa.status()}</p>
    <Show when={pwa.error()}><p class="paint-panel-note" role="alert">{pwa.error()}</p></Show>
  </>} />;
}
