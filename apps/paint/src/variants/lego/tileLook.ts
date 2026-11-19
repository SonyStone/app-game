import { createSignal } from 'solid-js';

/**
 * TEMPORARY, a trial: how LEGO's tiles look, switched as a whole by a developer control (`TileLookSwitch`) so the
 * looks can be compared on the tablet. Remove this, the switch and the losing looks' CSS once one look is chosen.
 *
 * - `A`: as before: every part a separate tile, all gaps equal.
 * - `B`: neighbouring parts of one group fuse into one block with a thin seam (see `fusion.ts`).
 * - `C`: fused, and the plate muted towards the tiles' tone, so the remaining gaps stop reading as dark lines.
 *
 * `radius` is the one number every corner derives from: a plate's corner in CSS pixels; a tile's is it less the
 * plate's padding, and so on inwards (see `LegoStudio.module.css`). `squircle` draws plates and large tiles with
 * `corner-shape: squircle` where the browser has it. The look is kept per device and never in the board.
 */
export type TileLook = { look: 'A' | 'B' | 'C'; radius: number; squircle: boolean };

/** The look a device without a stored choice gets: the tiles as before. */
export const defaultTileLook: TileLook = { look: 'A', radius: 13, squircle: false };

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

/** The stored tile look, or `defaultTileLook` when there is none or it cannot be read. */
export function readTileLook(): TileLook {
  try {
    const stored = JSON.parse(localStorage.getItem(tileLookKey) ?? 'null') as Partial<TileLook> | null;
    return normalTileLook({ ...defaultTileLook, ...(stored && typeof stored === 'object' ? stored : {}) });
  } catch {
    return defaultTileLook;
  }
}

/** `look` with every field valid: an unknown look becomes A, the radius a whole number within `radiusRange`. */
function normalTileLook(look: TileLook): TileLook {
  const radius = Number.isFinite(look.radius) ? Math.round(look.radius) : defaultTileLook.radius;

  return {
    look: look.look === 'B' || look.look === 'C' ? look.look : 'A',
    radius: Math.max(radiusRange.min, Math.min(radiusRange.max, radius)),
    squircle: look.squircle === true
  };
}
