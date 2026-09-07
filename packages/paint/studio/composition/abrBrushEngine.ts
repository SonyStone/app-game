import { brushFormSchema } from '@app-game/abr-brush/form';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import {
  createAbrStrokeSampler,
  dualPreviewInput,
  type PreviewPoint,
  type PreviewStroke
} from '@app-game/abr-brush/stroke';
import { z } from 'zod/v3';
import type { Dab, Sample } from '../brush';
import { defineBrushEngine } from './defineBrushEngine';

/** Preset adapter: input processing, incremental ABR dynamics, and tiled GPU accumulation.
 * Resources are pinned together for the whole gesture, including disposable endpoint previews.
 */
export const abrBrush = defineBrushEngine({
  id: 'abr',
  parse: (input: unknown) => settings.parse(input),
  create: ({ settings, resources, brush, layer, processor, renderer }) => {
    const tip = resources.get(settings.tipId);
    const pattern = settings.patternId ? resources.get(settings.patternId) : undefined;
    const dual = settings.dualId ? resources.get(settings.dualId) : undefined;
    const input = {
      seed: settings.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!,
      values: settings.values,
      color: brush.color,
      secondaryColor: settings.secondaryColor,
      flow: brush.flow,
      opacity: brush.opacity,
      size: brush.size
    };
    const sampler = createAbrStrokeSampler(input, tip);
    const dualInput = dualPreviewInput({ ...input, width: 1, height: 1, dpr: 1, background: '#ffffff' });
    const secondary = dual
      ? createAbrStrokeSampler(
          { ...dualInput, seed: input.seed ^ 0x273ab, size: brush.size * (dualInput.tipScale ?? 1) },
          dual
        )
      : undefined;
    const sample = (samples: readonly Sample[], preview = false) => {
      const points = samples.map(tabletPoint);
      const mode = preview ? 'preview' : 'add';
      return [...(secondary ? dabs(secondary[mode](points), true) : []), ...dabs(sampler[mode](points), false)];
    };
    renderer.begin(layer, brush, undefined, {
      values: settings.values,
      tip,
      pattern,
      dual,
      size: brush.size,
      mixing: brush.mixing,
      blendMode: settings.blendMode
    });
    return {
      async add(samples) {
        await renderer.paint(sample(processor.add(samples)));
      },
      preview(enabled) {
        renderer.preview(enabled ? sample(processor.preview(), true) : []);
      },
      async finish() {
        await renderer.paint(sample(processor.finish()));
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
    patternId: z.string().min(1).max(512).optional(),
    dualId: z.string().min(1).max(512).optional(),
    values: brushFormSchema,
    /** Optional deterministic replay seed; normal gestures get a fresh random seed. */
    seed: z.number().int().min(0).max(4294967295).optional(),
    blendMode: z.enum(paintModes).default('Nrml'),
    secondaryColor: z
      .string()
      .regex(/^#[\da-f]{6}$/i)
      .default('#ffffff')
  })
  .strict();

function tabletPoint(sample: Sample): PreviewPoint {
  return { ...sample, tiltX: sample.tiltX ?? 0, tiltY: sample.tiltY ?? 0, rotation: sample.rotation ?? 0 };
}
function dabs(stroke: PreviewStroke, secondary: boolean): Dab[] {
  return Array.from({ length: stroke.count }, (_, i) => {
    const data = stroke.data.subarray(i * 16, i * 16 + 16);
    return {
      x: data[0]!,
      y: data[1]!,
      radius: Math.hypot(data[2]!, data[3]!),
      flow: data[8]!,
      abr: { data, secondary }
    };
  });
}
