import type { OrbChip, OrbLights, OrbPoint } from '../../features/lighting-orb';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { infinitePalettes } from './palettes';

/**
 * The Infinite Painter variant's color settings, persisted in `localStorage` under `paint.infinite.color`: the color
 * panel's last tab and slider model, Tone Lock, Compare tone, whether the Recent Colors strip shows beside the main
 * toolbar, the compact palette shown and the Lighting Orb's setup. Unknown or broken stored values fall back to the
 * defaults one by one; storage failures keep the settings for this session.
 */
export function createInfiniteColorSettings() {
  const [, setStored, stored] = createImmediateSignal(read());

  return {
    settings: stored,
    /** Applies `patch` at once (a second update in the same event builds on it) and stores the result. */
    update(patch: Partial<InfiniteColorSettings>) {
      const next = { ...stored(), ...patch };
      setStored(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep the settings for this session.
      }
    }
  };
}

/** What the color panel and the Recent Colors strip remember. */
export type InfiniteColorSettings = {
  tab: InfiniteColorTab;
  /** The color model of the Color sliders tab. */
  model: InfiniteColorModel;
  /** Whether turning the hue on the wheel keeps the color's tone (perceived lightness). */
  toneLock: boolean;
  /** Whether the header shows each color's tone as a gray under its swatch. */
  compareTone: boolean;
  /** Whether the Recent Colors strip is docked beside the main toolbar. */
  recentStrip: boolean;
  /** The index in `infinitePalettes` of the compact palette under the wheel and the sliders. */
  palette: number;
  orb: InfiniteOrbSetup;
};

/** The color panel's tabs, in the order of their icons. */
export type InfiniteColorTab = 'wheel' | 'sliders' | 'swatches' | 'orb';

/** The Color sliders tab's color models. */
export type InfiniteColorModel = 'hsb' | 'rgb' | 'lab' | 'cmyk';

/** The Lighting Orb's colors and contrast, where its picker stands and which chip the sliders edit. */
export type InfiniteOrbSetup = OrbLights & { picker: OrbPoint; selected: OrbChip };

/** The settings before any change: the wheel, HSB sliders, the Basic Palette and a warm orb, as in the manual. */
export const defaultInfiniteColorSettings: InfiniteColorSettings = {
  tab: 'wheel',
  model: 'hsb',
  toneLock: false,
  compareTone: false,
  recentStrip: true,
  palette: 0,
  orb: {
    base: '#c8602f',
    light: '#ff7a3d',
    shadow: '#d0609a',
    contrast: 0.5,
    picker: { x: -0.05, y: 0.02 },
    selected: 'light'
  }
};

function read(): InfiniteColorSettings {
  const defaults = defaultInfiniteColorSettings;
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<
      Record<keyof InfiniteColorSettings, unknown>
    >;
    const orb = (typeof stored.orb === 'object' && stored.orb !== null ? stored.orb : {}) as Partial<
      Record<keyof InfiniteOrbSetup, unknown>
    >;
    const picker = orb.picker as Partial<OrbPoint> | undefined;
    return {
      tab: oneOf(stored.tab, ['wheel', 'sliders', 'swatches', 'orb'], defaults.tab),
      model: oneOf(stored.model, ['hsb', 'rgb', 'lab', 'cmyk'], defaults.model),
      toneLock: typeof stored.toneLock === 'boolean' ? stored.toneLock : defaults.toneLock,
      compareTone: typeof stored.compareTone === 'boolean' ? stored.compareTone : defaults.compareTone,
      recentStrip: typeof stored.recentStrip === 'boolean' ? stored.recentStrip : defaults.recentStrip,
      palette:
        Number.isInteger(stored.palette) &&
        (stored.palette as number) >= 0 &&
        (stored.palette as number) < infinitePalettes.length
          ? (stored.palette as number)
          : defaults.palette,
      orb: {
        base: hex(orb.base, defaults.orb.base),
        light: hex(orb.light, defaults.orb.light),
        shadow: hex(orb.shadow, defaults.orb.shadow),
        contrast:
          typeof orb.contrast === 'number' && orb.contrast >= 0 && orb.contrast <= 1
            ? orb.contrast
            : defaults.orb.contrast,
        picker:
          Number.isFinite(picker?.x) && Number.isFinite(picker?.y) && Math.hypot(picker!.x!, picker!.y!) <= 1
            ? { x: picker!.x!, y: picker!.y! }
            : defaults.orb.picker,
        selected: oneOf(orb.selected, ['shadow', 'base', 'light'], defaults.orb.selected)
      }
    };
  } catch {
    return defaults;
  }
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function hex(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value) ? value : fallback;
}

const key = 'paint.infinite.color';
