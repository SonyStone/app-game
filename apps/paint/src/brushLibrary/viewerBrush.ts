import { blockEraserTip, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { brushFormSchema, brushToFormValues, brushToolSettings, record } from '@app-game/abr-brush/form';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import { usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { generatePreviewTip } from '@app-game/abr-brush/physical-tip';
import { brushPreviewResources, decodePreviewResources } from '@app-game/abr-brush/resources';
import { smudgeModes } from '@app-game/abr-brush/settings-fields';
import type { Brush as AbrBrush, BrushTipImage } from '@app-game/abr-parser/reader';
import type { abrBrush } from '../composition/abrBrushEngine';
import type { BrushResource } from '../composition/brushResources';

/** Detaches the editable preset and every referenced resource before selecting the runtime engine.
 * Missing embedded resources fail explicitly rather than silently rendering a different brush.
 */
export function viewerBrush(brush: AbrBrush) {
  const type = record(brush.settings.toolOptions).__classId;
  const tool = brushToolSettings(brush);
  const rawTool = record(brush.settings.toolOptions);
  for (const [key, color] of [
    ['FrgC', tool.foreground],
    ['BckC', tool.background]
  ] as const)
    if (rawTool[key] !== undefined && color === undefined)
      throw new Error(
        `Unsupported saved ${key === 'FrgC' ? 'foreground' : 'background'} color. Choose an RGB color in Tool Options before applying this preset.`
      );
  const blendMode = paintModes.find((mode) => mode === tool.blendMode);
  if (!blendMode) throw new Error(`Unsupported ABR paint mode: ${tool.blendMode}`);
  const values = brushFormSchema.parse(brushToFormValues(brush));
  if (type === 'smudgeTool') values.tool.type = 'SmTl';
  if (type === 'mixerBrushTool') values.tool.type = 'MixB';
  if (type === 'blurTool') values.tool.type = 'BlTl';
  if (type === 'sharpenTool') values.tool.type = 'ShTl';
  if (type === 'eraserTool') values.tool.type = 'ErTl';
  if (type === 'pencilTool') values.tool.type = 'PcTl';
  const filter = values.tool.type === 'ShTl' || values.tool.type === 'BlTl';
  if ((values.tool.type === 'SmTl' || filter) && !smudgeModes.some((mode) => mode === blendMode))
    throw new Error('This paint mode is not available for this retouch tool. Choose a retouch mode in Tool Options.');
  // The shared sampler resolves pressure overrides. Keep section state and dormant dynamics intact.
  const block = isBlockEraser(values.tool);
  const auxiliary = block ? {} : decodePreviewResources(brushPreviewResources(brush));
  if (auxiliary.warning) throw new Error(auxiliary.warning);
  const image = block
    ? blockEraserTip()
    : values.tipKind === 'sampledBrush' || brush.type === 'sampled'
      ? brush.brushTip
      : generatePreviewTip(values);
  if (!image) throw new Error('The sampled brush tip is missing.');
  const resource = copyResource(image);
  const pattern = auxiliary.pattern ? copyResource(auxiliary.pattern) : undefined;
  const dual = auxiliary.dualTip ? copyResource(auxiliary.dualTip) : undefined;
  const resources = [resource, ...(pattern ? [pattern] : []), ...(dual ? [dual] : [])];
  if (resources.reduce((sum, resource) => sum + resource.pixels.byteLength, 0) > 48 * 1024 * 1024)
    throw new Error('This preset’s combined resources exceed the 48 MiB brush budget.');
  const engine: ReturnType<typeof abrBrush.select> = {
    id: 'abr',
    settings: {
      tipId: resource.id,
      patternId: pattern?.id,
      dualId: dual?.id,
      values,
      blendMode: values.tool.type === 'ErTl' ? 'Cler' : blendMode,
      secondaryColor: tool.background ?? '#ffffff'
    }
  };
  return {
    resource,
    resources,
    engine,
    name: brush.name,
    color: tool.foreground,
    backgroundColor: tool.background,
    flow:
      values.tool.type === 'SmTl' || usesPencilCoverage(values.tool) || filter
        ? 1
        : values.tool.type === 'MixB'
          ? (tool.flow ?? 1)
          : tool.flow,
    opacity: block || values.tool.type === 'SmTl' || values.tool.type === 'MixB' || filter ? 1 : tool.opacity,
    size: values.diameter,
    spacing: values.spacing / 100,
    angle: (values.angle * Math.PI) / 180
  };
}
function copyResource(tip: BrushTipImage): BrushResource {
  if (tip.width > 8192 || tip.height > 8192 || tip.data.byteLength > 32 * 1024 * 1024)
    throw new Error('This tip exceeds Paint’s 8192 px / 32 MiB limit.');
  return {
    id: crypto.randomUUID(),
    width: tip.width,
    height: tip.height,
    format: 'r8unorm',
    pixels: new Uint8Array(tip.data)
  };
}
