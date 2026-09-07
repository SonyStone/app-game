import { z } from 'zod';
import { createStrokeSampler } from '../brush';
import { defineBrushEngine } from './defineBrushEngine';

/** Typed preset overrides for the round engine; omitted values preserve the current brush controls. */
export const roundBrush = defineBrushEngine({
  id: 'round',
  parse: (input: unknown) => roundSettings.parse(input),
  create: ({ brush: input, settings, layer, processor, renderer }) => {
    const brush = {
      ...input,
      hardness: settings.hardness ?? input.hardness,
      spacing: settings.spacing ?? input.spacing
    };
    const sampler = createStrokeSampler(brush);
    renderer.begin(layer, brush);
    return {
      async add(samples) {
        await renderer.paint(sampler.add(processor.add(samples)));
      },
      preview(enabled) {
        renderer.preview(enabled ? sampler.preview(processor.preview()) : []);
      },
      async finish() {
        await renderer.paint(sampler.add(processor.finish()));
        return renderer.finish();
      },
      cancel() {
        renderer.cancel();
      }
    };
  }
});

/** Compatible factory for existing application recipes; selection validation is shared with roundBrush.select. */
export const roundBrushEngine = roundBrush.engine;

const roundSettings = z
  .object({
    hardness: z.number().finite().min(0).max(1).optional(),
    spacing: z.number().finite().min(0.01).max(1).optional()
  })
  .strict()
  .default({});
