import { brushFormSchema } from '@app-game/abr-brush/form';
import { createAbrSmoothing } from '@app-game/abr-brush/stroke';
import type { StrokeProcessorFactory } from '../strokeProcessors';

/** Preset smoothing replaces the round brush's filter; the Studio recipe bypasses this for None. */
export const createAbrProcessor: StrokeProcessorFactory = (brush, zoom) => {
  const settings = brush.engine?.settings;
  if (!settings || typeof settings !== 'object' || !('values' in settings))
    throw new Error('ABR processor needs a preset.');
  const smoother = createAbrSmoothing(brushFormSchema.parse(settings.values), 1 / Math.max(0.0001, zoom));
  return {
    add: (samples) =>
      smoother.add(
        samples.map((sample) => ({
          ...sample,
          tiltX: sample.tiltX ?? 0,
          tiltY: sample.tiltY ?? 0,
          rotation: sample.rotation ?? 0
        }))
      ),
    preview: smoother.preview,
    finish: smoother.finish
  };
};
