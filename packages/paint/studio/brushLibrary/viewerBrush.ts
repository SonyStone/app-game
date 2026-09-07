import { brushFormSchema, brushToFormValues, brushToolSettings, record } from '@app-game/abr-brush/form';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import { generatePreviewTip } from '@app-game/abr-brush/physical-tip';
import { brushPreviewResources, decodePreviewResources } from '@app-game/abr-brush/resources';
import type { Brush as AbrBrush, BrushTipImage } from '@app-game/abr-parser/reader';
import type { abrBrush } from '../composition/abrBrushEngine';
import type { BrushResource } from '../composition/brushResources';

/** Detaches the editable preset and every referenced resource before selecting the runtime engine.
 * Missing embedded resources fail explicitly rather than silently rendering a different brush.
 */
export function viewerBrush(brush: AbrBrush) {
  if (record(brush.settings.toolOptions).__classId === 'mixerBrushTool')
    throw new Error('Mixer Brush pickup and wet mixing are not implemented in Paint yet.');
  const tool = brushToolSettings(brush);
  const blendMode = paintModes.find((mode) => mode === tool.blendMode);
  if (!blendMode) throw new Error(`Unsupported ABR paint mode: ${tool.blendMode}`);
  const values = brushFormSchema.parse(brushToFormValues(brush));
  if (tool.pressureOverridesSize) {
    values.useShapeDynamics = true;
    values.shapeDynamics.sizeControl = 2;
  }
  if (tool.pressureOverridesOpacity) {
    values.useTransfer = true;
    values.transfer.opacityControl = 2;
  }
  const auxiliary = decodePreviewResources(brushPreviewResources(brush));
  if (auxiliary.warning) throw new Error(auxiliary.warning);
  const image =
    values.tipKind === 'sampledBrush' || brush.type === 'sampled' ? brush.brushTip : generatePreviewTip(values);
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
      blendMode,
      secondaryColor: '#ffffff'
    }
  };
  return {
    resource,
    resources,
    engine,
    name: brush.name,
    flow: tool.flow,
    opacity: tool.opacity,
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
