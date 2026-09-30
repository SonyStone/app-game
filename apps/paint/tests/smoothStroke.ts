import { createStrokeSampler, type Brush } from '@app-game/paint-core/brush';
import { studioProcessors } from '@app-game/paint-core/strokeProcessors';

/**
 * Test fixture that chains the brush's stroke processor and the dab sampler, as the runtime does for round brushes.
 * `add` returns dabs for new samples, `preview` the disposable live tail and `finish` the final segment.
 */
export function createSmoothStroke(brush: Brush, zoom = 1) {
  const processor = studioProcessors[brush.stroke.mode](brush, zoom);
  const sampler = createStrokeSampler(brush);

  return {
    /** Processes new pointer samples and returns the dabs they complete. */
    add: (samples: Parameters<typeof processor.add>[0]) => sampler.add(processor.add(samples)),
    /** Returns disposable dabs up to the newest sample without advancing processor or sampler state. */
    preview: () => sampler.preview(processor.preview()),
    /** Flushes the processor's pending tail at stroke end. */
    finish: () => sampler.add(processor.finish())
  };
}
