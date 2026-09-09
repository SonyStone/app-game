import { blockEraserTip, blockEraserValues, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { brushFormSchema } from '@app-game/abr-brush/form';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import { pencilUsesBackground } from '@app-game/abr-brush/pencil';
import {
  createAbrStrokeSampler,
  dualPreviewInput,
  supportsAirbrush,
  type PreviewPoint,
  type PreviewStroke
} from '@app-game/abr-brush/stroke';
import { z } from 'zod/v3';
import type { Dab, Sample } from '../brush';
import { abrBrushCommand } from './abrBrushCommands';
import { defineBrushEngine } from './defineBrushEngine';

/** Preset adapter: input processing, incremental ABR dynamics, and tiled GPU accumulation.
 * Resources are pinned together for the whole gesture, including disposable endpoint previews.
 */
export const abrBrush = defineBrushEngine({
  id: 'abr',
  parse: (input: unknown) => settings.parse(input),
  commands: {
    parse: (input: unknown) => abrBrushCommand.parse(input),
    run: ({ settings, command, brush, renderer, resources, layer, layers }) => {
      if (settings.values.tool.type !== 'MixB') throw new Error('Load and Clean require a Mixer Brush preset.');
      resources.get(settings.tipId);
      const wells = {
        load: settings.values.tool.load / 100,
        autoFill: settings.values.tool.autoFill,
        autoClean: settings.values.tool.autoClean
      };
      if (typeof command === 'string') renderer.mixerCommand(command, settings.tipId, brush.color, wells);
      else
        return renderer.loadMixerFromCanvas({
          ...wells,
          key: settings.tipId,
          color: brush.color,
          point: command.point,
          size: brush.size,
          solid: settings.values.tool.loadSolidColorOnly,
          allLayers: settings.values.tool.sampleAllLayers,
          layers: settings.values.tool.sampleAllLayers ? (layers ?? [layer]) : [layer]
        });
    }
  },
  create: ({ settings, resources, brush, layer, layers, processor, renderer, view, historySource, modifiers }) => {
    const restoreHistory =
      settings.values.tool.type === 'ErTl' && (settings.values.tool.eraseToHistory || modifiers?.altKey === true);
    if (restoreHistory && !historySource)
      throw new Error('The selected history source does not contain this layer. Choose another source.');
    const block = isBlockEraser(settings.values.tool);
    if (block) {
      settings = {
        ...settings,
        values: blockEraserValues(settings.values, view),
        patternId: undefined,
        dualId: undefined
      };
      brush = { ...brush, size: settings.values.diameter, opacity: 1, flow: 1 };
    }
    const filter = settings.values.tool.type === 'ShTl' || settings.values.tool.type === 'BlTl';
    const samplesCanvas = filter || settings.values.tool.type === 'SmTl' || settings.values.tool.type === 'MixB';
    const square = block ? blockEraserTip() : undefined;
    const tip = square
      ? {
          id: 'block-eraser-square',
          width: square.width,
          height: square.height,
          pixels: square.data,
          format: 'r8unorm' as const
        }
      : resources.get(settings.tipId);
    const pattern = settings.patternId ? resources.get(settings.patternId) : undefined;
    const dual = settings.dualId ? resources.get(settings.dualId) : undefined;
    const input = {
      seed: settings.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!,
      values: settings.values,
      color: brush.color,
      secondaryColor: brush.backgroundColor ?? settings.secondaryColor,
      flow: filter ? 1 : brush.flow,
      opacity: filter ? 1 : brush.opacity,
      size: brush.size
    };
    const sampler = createAbrStrokeSampler(input, tip);
    let pencilContact = settings.values.tool.type === 'PcTl' && settings.values.tool.autoErase;
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
      blendMode: settings.blendMode,
      historySource: restoreHistory ? historySource : undefined,
      filter: filter
        ? {
            sharpen: settings.values.tool.type === 'ShTl',
            protectDetail: settings.values.tool.protectDetail,
            strength: settings.values.tool.strength / 100,
            allLayers: settings.values.tool.sharpenAllLayers,
            layers: settings.values.tool.sharpenAllLayers ? (layers ?? [layer]) : [layer]
          }
        : undefined,
      mixer:
        settings.values.tool.type === 'MixB'
          ? {
              key: settings.tipId,
              wet: settings.values.tool.wetness / 100,
              load: settings.values.tool.load / 100,
              mix: settings.values.tool.mix / 100,
              autoFill: settings.values.tool.autoFill,
              autoClean: settings.values.tool.autoClean,
              allLayers: settings.values.tool.sampleAllLayers,
              layers: settings.values.tool.sampleAllLayers ? (layers ?? [layer]) : [layer]
            }
          : undefined,
      smudge:
        settings.values.tool.type === 'SmTl'
          ? {
              strength: settings.values.tool.strength / 100,
              fingerPainting: settings.values.tool.fingerPainting,
              allLayers: settings.values.tool.smudgeAllLayers,
              layers: settings.values.tool.smudgeAllLayers ? (layers ?? [layer]) : [layer]
            }
          : undefined
    });
    const buildUp = settings.values.useBuildUp && supportsAirbrush(settings.values.tool);
    const pulled =
      brush.stroke.mode !== 'none' &&
      settings.values.useSmoothing &&
      settings.values.smoothing.amount > 0 &&
      settings.values.smoothing.pulledString;
    let lastPainted: Sample | undefined;
    let latestInput: Sample | undefined;
    let slack = false;
    const paint = async (samples: readonly Sample[]) => {
      // The idle clock may have advanced beyond a delayed pointer packet. Never rewind the stamp timer.
      const points = samples.map((point) => {
        const next = { ...point, time: Math.max(point.time, lastPainted?.time ?? point.time) };
        lastPainted = next;
        return next;
      });
      // Preserve the same sampling/secondary-tip sequence regardless of worker input batching.
      if (samplesCanvas) {
        for (const point of points) await renderer.paint(sample([point]));
      } else await renderer.paint(sample(points));
    };
    return {
      idle:
        processor.idle || buildUp
          ? async (elapsedMs) => {
              if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
              const points = processor.idle?.(elapsedMs) ?? [];
              if (!points.length) {
                if (!buildUp || !lastPainted || !latestInput || slack) return false;
                points.push({ ...latestInput, x: lastPainted.x, y: lastPainted.y, time: lastPainted.time + elapsedMs });
              }
              // Points have already passed through the processor; applying it again would add latency.
              await paint(points);
              return true;
            }
          : undefined,
      async add(samples) {
        if (pencilContact && samples.length) {
          const pixel = await renderer.readCommittedPixel(layer, samples[0]!);
          if (pencilUsesBackground(pixel, input.color)) {
            const foreground = input.color;
            input.color = input.secondaryColor;
            input.secondaryColor = foreground;
          }
          pencilContact = false;
        }
        for (const point of samples)
          if ([point.x, point.y, point.pressure, point.time].every(Number.isFinite)) latestInput = point;
        const points = processor.add(samples);
        if (samples.length) slack = pulled && !points.length;
        await paint(points);
      },
      preview(enabled) {
        renderer.preview(enabled && !samplesCanvas && !restoreHistory ? sample(processor.preview(), true) : []);
      },
      async finish() {
        await paint(processor.finish());
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
      abr: {
        data,
        secondary,
        mixing: stroke.mixing ? { wet: stroke.mixing[i * 2]!, mix: stroke.mixing[i * 2 + 1]! } : undefined
      }
    };
  });
}
