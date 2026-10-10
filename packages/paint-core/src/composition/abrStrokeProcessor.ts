import { brushFormSchema } from '@app-game/abr-brush/form';
import { createAbrSmoothing } from '@app-game/abr-brush/stroke';
import type { Sample } from '../brush';
import { predictedTail } from '../strokePrediction';
import type { StrokeProcessorFactory } from '../strokeProcessors';

/**
 * Preset smoothing replaces the round brush's filter; the Studio recipe bypasses this for None. Without smoothing the
 * output follows the pen, so the preview may run ahead along predicted points; smoothed strokes trail on purpose.
 */
export const createAbrProcessor: StrokeProcessorFactory = (brush, zoom) => {
  const settings = brush.engine?.settings;
  if (!settings || typeof settings !== 'object' || !('values' in settings))
    throw new Error('ABR processor needs a preset.');
  const values = brushFormSchema.parse(settings.values);
  const smoother = createAbrSmoothing(values, 1 / Math.max(0.0001, zoom));
  const smoothed = values.useSmoothing && values.smoothing.amount > 0;
  let latest: Sample | undefined;
  let finished = false;
  return {
    add(samples) {
      const points = samples.map((sample) => ({
        ...sample,
        tiltX: sample.tiltX ?? 0,
        tiltY: sample.tiltY ?? 0,
        rotation: sample.rotation ?? 0
      }));
      const output = smoother.add(points);
      latest = output.at(-1) ?? latest;
      return output;
    },
    preview: smoother.preview,
    idle: smoother.idle,
    ...(smoothed
      ? {}
      : { predict: (predicted: readonly Sample[]) => (finished ? [] : predictedTail(latest, predicted)) }),
    finish() {
      finished = true;
      return smoother.finish();
    }
  };
};
