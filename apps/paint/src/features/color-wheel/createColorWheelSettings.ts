import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { gamutMasks, harmonies, type DiskPoint, type GamutMask, type Harmony } from './wheelGeometry';

/**
 * How colors are chosen in the Color panel, persisted in `localStorage`: the `square` (HSV plane and hue strip) or the
 * perceptual `wheel`, with the wheel's harmony, gamut mask and the mask's clockwise rotation in degrees. Storage
 * failures keep the choices for this session.
 */
export function createColorWheelSettings() {
  const [, setStored, stored] = createImmediateSignal(read());

  return {
    settings: stored,
    update(patch: Partial<ColorWheelSettings>) {
      const next = { ...stored(), ...patch };
      setStored(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep the choices for this session.
      }
    }
  };
}

/** The Color panel's picker and the wheel's guides. */
export type ColorWheelSettings = {
  picker: 'square' | 'wheel';
  harmony: Harmony;
  mask: GamutMask;
  maskAngle: number;
  /** The corners of the custom mask, before `maskAngle`; see `maskPolygon`. */
  customMask: DiskPoint[];
};

function read(): ColorWheelSettings {
  const defaults: ColorWheelSettings = {
    picker: 'square',
    harmony: 'none',
    mask: 'none',
    maskAngle: 0,
    customMask: []
  };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Record<keyof ColorWheelSettings, unknown>>;
    return {
      picker: stored.picker === 'wheel' ? 'wheel' : 'square',
      harmony: typeof stored.harmony === 'string' && stored.harmony in harmonies ? (stored.harmony as Harmony) : 'none',
      mask:
        typeof stored.mask === 'string' && (stored.mask in gamutMasks || stored.mask === 'custom')
          ? (stored.mask as GamutMask)
          : 'none',
      maskAngle: typeof stored.maskAngle === 'number' && Number.isFinite(stored.maskAngle) ? stored.maskAngle : 0,
      customMask: Array.isArray(stored.customMask)
        ? stored.customMask.filter(
            (point): point is DiskPoint =>
              typeof point === 'object' && point !== null && Number.isFinite(point.x) && Number.isFinite(point.y)
          )
        : []
    };
  } catch {
    return defaults;
  }
}

const key = 'paint.colorWheel';
