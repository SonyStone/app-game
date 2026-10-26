import { isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { generatePreviewTip } from '@app-game/abr-brush/physical-tip';
import { decodePreviewResources } from '@app-game/abr-brush/resources';
import { previewStrokeSize } from '@app-game/abr-brush/stroke';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { defaultBrush } from '../brush';
import type { PreviewConfiguration } from './protocol';
import { previewBytesKey } from './resourceCache';

/** Captures the same independent Flow/Opacity and preset routing used by prepareAbrBrush in Paint. */
export function preparePreview(
  configuration: PreviewConfiguration,
  interactive: boolean,
  decode = decodePreviewResources
) {
  if (configuration.kind === 'brush') {
    return { brush: { ...defaultBrush(), ...configuration.brush }, resources: configuration.resources ?? [] };
  }

  const { input } = configuration;
  const values = input.values;
  const auxiliary = decode(configuration.resources ?? {});
  if (auxiliary.warning) {
    throw new Error(auxiliary.warning);
  }

  const tip = configuration.tip ?? generatePreviewTip(values);
  const resource = (image: typeof tip, role: string): BrushResource => ({
    id: `preview:${role}:${image.width}x${image.height}:${previewBytesKey(image.data)}`,
    width: image.width,
    height: image.height,
    format: 'r8unorm',
    pixels: image.data
  });
  const primary = resource(tip, 'tip');
  const pattern = auxiliary.pattern ? resource(auxiliary.pattern, 'pattern') : undefined;
  const dual = auxiliary.dualTip ? resource(auxiliary.dualTip, 'dual') : undefined;
  const filter = values.tool.type === 'ShTl' || values.tool.type === 'BlTl';
  const fullOpacity = isBlockEraser(values.tool) || ['SmTl', 'MixB'].includes(values.tool.type) || filter;
  const brush = {
    ...defaultBrush(),
    color: input.color,
    backgroundColor: input.secondaryColor,
    size: interactive ? values.diameter : previewStrokeSize(input) / input.dpr,
    spacing: values.spacing / 100,
    hardness: values.hardness / 100,
    flow: filter || values.tool.type === 'SmTl' || usesPencilCoverage(values.tool) ? 1 : input.flow,
    opacity: fullOpacity ? 1 : input.opacity,
    mixing: input.colorMixing ?? 'classic',
    engine: {
      id: 'abr',
      settings: {
        values,
        tipId: primary.id,
        patternId: pattern?.id,
        dualId: dual?.id,
        blendMode: values.tool.type === 'ErTl' ? 'Cler' : values.tool.mode,
        secondaryColor: input.secondaryColor ?? '#ffffff',
        seed: 12345
      }
    }
  };
  return { brush, resources: [primary, ...(pattern ? [pattern] : []), ...(dual ? [dual] : [])] };
}
