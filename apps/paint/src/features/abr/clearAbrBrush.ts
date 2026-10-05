import { record } from '@app-game/abr-brush/form';
import type { Brush } from '@app-game/paint-core/brush';

/**
 * The erasing version of an ABR brush: the same tip, texture and dynamics with the Clear paint mode. Eraser Tool
 * presets erase already and are returned unchanged. Mixer Brush, Smudge, Blur and Sharpen presets return `undefined`:
 * they composite picked-up paint, which ignores the paint mode.
 */
export function clearAbrBrush(brush: Brush): Brush | undefined {
  const settings = record(brush.engine?.settings);
  const type = record(record(settings.values).tool).type;
  if (type === 'ErTl') {
    return brush;
  }

  if (typeof type === 'string' && pickupTools.has(type)) {
    return undefined;
  }

  return { ...brush, engine: { id: 'abr', settings: { ...settings, blendMode: 'Cler' } } };
}

/** ABR tools that composite picked-up paint instead of using the paint mode. */
const pickupTools = new Set(['MixB', 'SmTl', 'BlTl', 'ShTl']);
