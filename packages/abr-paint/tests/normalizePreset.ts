import { createHash } from 'node:crypto';
import type { prepareAbrBrush } from '../src/preset';

/**
 * Replaces a prepared preset's random resource IDs with their positions and its pixels with SHA-256 digests, so two
 * preparations of the same brush compare equal.
 */
export function normalizePreset(preset: ReturnType<typeof prepareAbrBrush>) {
  const id = (value: string | undefined) =>
    value === undefined ? undefined : preset.resources.findIndex((r) => r.id === value);
  return {
    ...preset,
    resource: {
      ...preset.resource,
      pixels: hash(preset.resource.pixels),
      id: id(preset.resource.id)
    },
    resources: preset.resources.map((r) => ({
      ...r,
      pixels: hash(r.pixels),
      id: id(r.id)
    })),
    engine: {
      ...preset.engine,
      settings: {
        ...preset.engine.settings,
        tipId: id(preset.engine.settings.tipId),
        patternId: id(preset.engine.settings.patternId),
        dualId: id(preset.engine.settings.dualId)
      }
    }
  };
}

function hash(pixels: Uint8Array) {
  return createHash('sha256').update(pixels).digest('hex');
}
