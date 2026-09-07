import { z } from 'zod';
import { createStrokeSampler, type Dab } from '../brush';
import { defineBrushEngine } from './defineBrushEngine';

/** Native grayscale tip rasterization. Size is the longest side; the tip replaces round hardness.
 * Uses the selected input processor and pressure/spacing controls. No ABR dynamics are implied.
 */
export const texturedBrush = defineBrushEngine({
  id: 'textured',
  parse: (input: unknown) => settings.parse(input),
  create: ({ brush: input, settings, resources, layer, processor, renderer }) => {
    const tip = resources.get(settings.tipId);
    const brush = { ...input, spacing: settings.spacing ?? input.spacing };
    const sampler = createStrokeSampler(brush);
    // The renderer bins by circles. Use the circumscribed radius to include rotated rectangular corners.
    const scale = Math.hypot(tip.width, tip.height) / Math.max(tip.width, tip.height);
    const bounds = (dabs: Dab[]) => dabs.map((dab) => ({ ...dab, radius: dab.radius * scale }));
    renderer.begin(layer, brush, { resource: tip, angle: settings.angle ?? 0 });
    return {
      async add(samples) {
        await renderer.paint(bounds(sampler.add(processor.add(samples))));
      },
      preview(enabled) {
        renderer.preview(enabled ? bounds(sampler.preview(processor.preview())) : []);
      },
      async finish() {
        await renderer.paint(bounds(sampler.add(processor.finish())));
        return renderer.finish();
      },
      cancel() {
        renderer.cancel();
      }
    };
  }
});

const settings = z
  .object({
    tipId: z.string().min(1).max(512),
    /** Clockwise rotation in radians, default zero. */
    angle: z.number().finite().optional(),
    spacing: z.number().finite().min(0.01).max(1).optional()
  })
  .strict();
