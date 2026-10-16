import { photoshopDefaultSettings, type PsdRenderSettings } from '@app-game/psd/viewer';
import { createSignal } from 'solid-js';

/**
 * Owns the rendering preferences, starting from Photoshop's defaults with approximation on, so a document the exact
 * path refuses still shows, its approximations listed. `update` changes some fields, `replace` adopts a document's
 * capture settings but keeps the approximation preference, which is the viewer's rather than the document's, `reset`
 * returns to the defaults. Settings persist across documents.
 */
export function createRenderSettings() {
  const [settings, setSettings] = createSignal<PsdRenderSettings>(viewerDefaultSettings);
  const update = (patch: Partial<PsdRenderSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const replace = (next: PsdRenderSettings) =>
    setSettings((current) => ({ ...next, approximate: current.approximate }));
  const reset = () => setSettings(viewerDefaultSettings);

  return { settings, update, replace, reset };
}

/**
 * Photoshop's defaults, approximating what the exact path refuses. Documents the exact path renders render identically
 * either way.
 */
const viewerDefaultSettings: PsdRenderSettings = { ...photoshopDefaultSettings, approximate: true };
