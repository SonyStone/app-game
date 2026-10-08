import { photoshopDefaultSettings, type PsdRenderSettings } from '@app-game/psd/viewer';
import { createSignal } from 'solid-js';

/**
 * Owns the rendering preferences, starting from Photoshop's defaults. `update` changes some fields, `replace` adopts a
 * document's capture settings, `reset` returns to the defaults. Settings persist across documents.
 */
export function createRenderSettings() {
  const [settings, setSettings] = createSignal<PsdRenderSettings>(photoshopDefaultSettings);
  const update = (patch: Partial<PsdRenderSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const replace = (next: PsdRenderSettings) => setSettings({ ...next });
  const reset = () => setSettings(photoshopDefaultSettings);

  return { settings, update, replace, reset };
}
