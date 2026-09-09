import { createStrokeSampler, type Brush } from './brush';
import { studioProcessors } from './strokeProcessors';

/** Compatibility helper for round-brush previews/tests. Runtime composition selects these parts independently. */
export function createSmoothStroke(brush: Brush, zoom = 1) {
  const processor = studioProcessors[brush.stroke.mode](brush, zoom);
  const sampler = createStrokeSampler(brush);
  return {
    add: (samples: Parameters<typeof processor.add>[0]) => sampler.add(processor.add(samples)),
    preview: () => sampler.preview(processor.preview()),
    finish: () => sampler.add(processor.finish())
  };
}
