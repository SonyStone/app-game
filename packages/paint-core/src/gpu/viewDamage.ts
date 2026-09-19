import type { Camera, ViewSize } from '../camera';
import { dirtyRegion, type DirtyRegion } from './dirtyRegion';

/** Tracks one viewport independently. A dormant view falls back to a full redraw after 4096 distinct tiles.
 * A completed frame acknowledges only its own revision, preserving invalidations received during GPU/I/O waits.
 */
export function createViewDamage(limit = 4096) {
  let revision = 0;
  let signature: string | undefined;
  let full = true;
  const tiles = new Set<string>();
  return {
    mark(key: string) {
      revision++;
      if (full) return;
      tiles.add(key);
      if (tiles.size > limit) {
        full = true;
        tiles.clear();
      }
    },
    /** Invalidates document-wide composition or asynchronously refined page coverage. */
    invalidate() {
      revision++;
      full = true;
      tiles.clear();
    },
    /** Captures the work for one frame; camera, layer settings and backing dimensions belong in signature. */
    plan(nextSignature: string, camera: Camera, size: ViewSize, pixels: ViewSize): DamagePlan {
      const redraw = full || signature !== nextSignature;
      return {
        revision,
        signature: nextSignature,
        full: redraw,
        region: redraw ? { x: 0, y: 0, ...pixels } : dirtyRegion(tiles, camera, size, pixels)
      };
    },
    /** Call only after successful presentation, including a cached view with exclusively offscreen changes. */
    presented(plan: DamagePlan) {
      if (plan.revision !== revision) return;
      signature = plan.signature;
      full = false;
      tiles.clear();
    }
  };
}

/** Immutable frame decision, retained across asynchronous tile reads. */
export type DamagePlan = {
  revision: number;
  signature: string;
  full: boolean;
  region: DirtyRegion | undefined;
};
