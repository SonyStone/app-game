import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Palm rejection settings, remembered in `localStorage`; see `createPalmRejection`. Stored values that are missing or
 * invalid take their defaults, and storage failures keep the choices for this session.
 */
export function createPalmRejectionSettings() {
  const [, setStored, stored] = createImmediateSignal(read());

  return {
    settings: stored,
    /** Changes settings and remembers them. */
    update(patch: Partial<PalmRejectionSettings>) {
      const next = { ...stored(), ...patch };
      setStored(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the choices for this session.
      }
    }
  };
}

/** How touches beside the pen are told from the free hand's. */
export type PalmRejectionSettings = {
  enabled: boolean;
  /** The hand that holds the pen; its side of the pen is guarded. */
  hand: 'left' | 'right';
  /**
   * CSS pixels from the pen's x to the guarded side's edge: positive values reach past the pen toward the free hand,
   * negative ones stop short of it.
   */
  tolerance: number;
  /** Milliseconds after the pen's last event (or none once it leaves) during which its hand's side is guarded. */
  linger: number;
  /**
   * Whether to guard as for a pen without hover: `auto` while the browser is found not to report the pen hovering
   * (see `createPenHover`), `on` always, `off` never. The guard then lasts `liftLinger` after each lift instead of
   * `linger`, and the pen touching down takes back the touches on its hand's side that landed up to `before`
   * milliseconds earlier.
   */
  hoverless: 'auto' | 'on' | 'off';
  liftLinger: number;
  before: number;
};

/** The settings before the user changes them, as tuned in the tile cluster mockup. */
export const defaultPalmRejection: PalmRejectionSettings = {
  enabled: true,
  hand: 'left',
  tolerance: -100,
  linger: 200,
  hoverless: 'auto',
  // Strokes on the MovinkPad were 300–1000 ms apart.
  liftLinger: 700,
  before: 500
};

function read(): PalmRejectionSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<
      Record<keyof PalmRejectionSettings, unknown>
    >;
    return {
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : defaultPalmRejection.enabled,
      hand: stored.hand === 'left' || stored.hand === 'right' ? stored.hand : defaultPalmRejection.hand,
      tolerance: finite(stored.tolerance) ?? defaultPalmRejection.tolerance,
      linger: finite(stored.linger) ?? defaultPalmRejection.linger,
      hoverless: readHoverless(stored.hoverless),
      liftLinger: finite(stored.liftLinger) ?? defaultPalmRejection.liftLinger,
      before: finite(stored.before) ?? defaultPalmRejection.before
    };
  } catch {
    return defaultPalmRejection;
  }
}

function readHoverless(value: unknown): PalmRejectionSettings['hoverless'] {
  // A checkbox stored a boolean before automatic detection; only a checked one was a choice.
  if (value === true || value === 'on') {
    return 'on';
  }

  return value === 'off' ? 'off' : defaultPalmRejection.hoverless;
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const storageKey = 'paint.palmRejection';
