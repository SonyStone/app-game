import type { Sample } from './brush';
import type { StrokeProcessor } from './strokeProcessors';

/**
 * Shows the pen's predicted points after the processor's preview, so the drawn line reaches where the pen is about to
 * be rather than where it was a frame ago. `predicted` is read at every preview; processors without `predict` are
 * returned unchanged. Nothing predicted is ever committed.
 */
export function withPrediction(processor: StrokeProcessor, predicted: () => readonly Sample[]): StrokeProcessor {
  const predict = processor.predict;
  if (!predict) {
    return processor;
  }

  return { ...processor, preview: () => [...processor.preview(), ...predict(predicted())] };
}

/**
 * The predicted points after `latest`, as samples that keep its pressure and tablet axes: browsers predict position,
 * not pressure. Drops points that are not finite, are not later than `latest`, or lie more than
 * `maxPredictionMs` ahead of it.
 */
export function predictedTail(
  latest: Sample | undefined,
  predicted: readonly Sample[],
  pressure = latest?.pressure
): Sample[] {
  if (!latest || pressure === undefined) {
    return [];
  }

  return predicted
    .filter(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.time > latest.time &&
        point.time - latest.time <= maxPredictionMs
    )
    .map((point) => ({ ...latest, x: point.x, y: point.y, time: point.time, pressure }));
}

/** How far ahead of the latest real sample predicted points are shown, in milliseconds. */
const maxPredictionMs = 50;
