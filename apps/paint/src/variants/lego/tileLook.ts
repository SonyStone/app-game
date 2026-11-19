import { createSignal } from 'solid-js';

/**
 * TEMPORARY, a trial: the corners of LEGO's plates and tiles, switched for the whole editor by a developer control
 * (`TileLookSwitch`) so they can be compared on the tablet. Remove this and the switch once the corners are chosen,
 * keeping the chosen radius as `--lego-radius` in `LegoStudio.module.css` (and the squircle look, if chosen).
 *
 * `radius` is the one number every corner derives from: a plate's corner in CSS pixels; a tile's is it less the
 * plate's padding, and so on inwards (see `LegoStudio.module.css`). `squircle` draws every corner with
 * `corner-shape: squircle` where the browser has it, its radii grown so a corner reads as round as the arc `radius`
 * names. The look is kept per device and never in the board.
 */
export type TileLook = { radius: number; squircle: boolean };

/** The look a device without a stored choice gets: the corners as before the trial. */
export const defaultTileLook: TileLook = { radius: 13, squircle: false };

/** Plate radii to compare: tiles square, tiles as before (7 px), tiles soft (14 px). */
export const plateRadii = { sharp: 6, today: 13, soft: 20 } as const;

/** The smallest and largest plate radius the switch offers. */
export const radiusRange = { min: 0, max: 24 } as const;

/** The key the look is kept under in `localStorage`. */
export const tileLookKey = 'paint.lego.tile-look';

/**
 * The tile look on this device, read once from `localStorage` and written back on every change; a missing, corrupt
 * or unreadable entry gives `defaultTileLook`, and a refused write keeps the look until the page closes.
 */
export function createTileLook() {
  const [look, setLook] = createSignal<TileLook>(readTileLook());

  return {
    look,
    /** Changes some of the look and keeps the result. */
    change(patch: Partial<TileLook>) {
      const next = normalTileLook({ ...look(), ...patch });
      setLook(next);
      try {
        localStorage.setItem(tileLookKey, JSON.stringify(next));
      } catch {
        // Private windows and full storage keep the look for this page only.
      }
    }
  };
}

/**
 * The stored tile look, or `defaultTileLook` when there is none or it cannot be read. Entries from the trial's
 * first round, which also held a look letter and a dimming, keep their radius and squircle choice.
 */
export function readTileLook(): TileLook {
  try {
    const stored = JSON.parse(localStorage.getItem(tileLookKey) ?? 'null') as Partial<TileLook> | null;
    return normalTileLook({ ...defaultTileLook, ...(stored && typeof stored === 'object' ? stored : {}) });
  } catch {
    return defaultTileLook;
  }
}

/** `look` with only its own fields, each valid: the radius a whole number within `radiusRange`. */
function normalTileLook(look: TileLook): TileLook {
  const radius = Number.isFinite(look.radius) ? Math.round(look.radius) : defaultTileLook.radius;

  return {
    radius: Math.max(radiusRange.min, Math.min(radiusRange.max, radius)),
    squircle: look.squircle === true
  };
}
