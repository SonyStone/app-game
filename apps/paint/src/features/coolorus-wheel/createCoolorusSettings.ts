import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { defaultCoolorusSettings, type CoolorusSettings } from './CoolorusWheel';

/** Session-owned picker preferences, persisted across reloads. Storage failures keep the current choices in memory. */
export function createCoolorusSettings() {
  const [, setSettings, settings] = createImmediateSignal(read());

  return {
    settings,
    /** Merges a partial choice immediately, including repeated updates in the same event. */
    update(patch: Partial<CoolorusSettings>) {
      const next = { ...settings(), ...patch };
      setSettings(next);

      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep the choices for this session.
      }
    }
  };
}

function read(): CoolorusSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Record<keyof CoolorusSettings, unknown>>;
    return {
      hues: stored.hues === 'rgb' ? 'rgb' : defaultCoolorusSettings.hues,
      lockLightness:
        typeof stored.lockLightness === 'boolean' ? stored.lockLightness : defaultCoolorusSettings.lockLightness
    };
  } catch {
    return { ...defaultCoolorusSettings };
  }
}

const key = 'paint.coolorus';
