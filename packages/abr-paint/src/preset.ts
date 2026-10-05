import { blockEraserTip, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { brushFormSchema, brushToFormValues, brushToolSettings, record } from '@app-game/abr-brush/form';
import type { BrushAsset as AbrBrush, BrushTipImage } from '@app-game/abr-brush/library';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import { usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { generatePreviewTip } from '@app-game/abr-brush/physical-tip';
import { brushPreviewResources, decodePreviewResources } from '@app-game/abr-brush/resources';
import { smudgeModes } from '@app-game/abr-brush/settings-fields';
import type { AbrBrushSettings } from './engine';
import type { BrushResource } from './resources';

/** Detaches the editable preset and every referenced resource before selecting the runtime engine.
 * Missing embedded resources fail explicitly rather than silently rendering a different brush.
 * Resource IDs are deterministic for the same preset ID and pixels, so repeated calls can reuse
 * resident uploads; different presets, roles or edited pixels always receive different IDs.
 */
export function prepareAbrBrush(brush: AbrBrush) {
  const type = record(brush.preset.toolOptions).kind;
  const tool = brushToolSettings(brush);
  const rawTool = record(brush.preset.toolOptions);
  for (const [key, color] of [
    ['foregroundColor', tool.foreground],
    ['backgroundColor', tool.background]
  ] as const)
    if (rawTool[key] !== undefined && color === undefined)
      throw new Error(
        `Unsupported saved ${key === 'foregroundColor' ? 'foreground' : 'background'} color. Choose an RGB color in Tool Options before applying this preset.`
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
    : values.tipKind === 'sampledBrush' || brush.preset.tip?.kind === 'sampled'
      ? brush.tipImage
      : generatePreviewTip(values);
  if (!image) throw new Error('The sampled brush tip is missing.');
  const resource = copyResource(image, brush.id, 'tip');
  const pattern = auxiliary.pattern ? copyResource(auxiliary.pattern, brush.id, 'pattern') : undefined;
  const dual = auxiliary.dualTip ? copyResource(auxiliary.dualTip, brush.id, 'dual') : undefined;
  const resources = [resource, ...(pattern ? [pattern] : []), ...(dual ? [dual] : [])];
  if (resources.reduce((sum, resource) => sum + resource.pixels.byteLength, 0) > 48 * 1024 * 1024)
    throw new Error('This preset’s combined resources exceed the 48 MiB brush budget.');
  const engine: { id: 'abr'; settings: AbrBrushSettings } = {
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

/** Copies one decoded coverage image into a transport resource with a stable, content-derived ID.
 * Re-preparing the same preset yields the same ID, so hosts can skip re-uploads and Mixer reservoirs
 * keyed on the tip survive re-selection. The preset ID and role keep distinct presets and roles apart;
 * the content digest changes the ID whenever edited settings regenerate different pixels.
 */
function copyResource(tip: BrushTipImage, brushId: string, role: 'tip' | 'pattern' | 'dual'): BrushResource {
  if (tip.width > 8192 || tip.height > 8192 || tip.data.byteLength > 32 * 1024 * 1024) {
    throw new Error('This tip exceeds Paint’s 8192 px / 32 MiB limit.');
  }

  const pixels = new Uint8Array(tip.data);
  const owner = brushId.length <= 128 ? brushId : digest(new TextEncoder().encode(brushId));
  return {
    id: `abr:${owner}:${role}:${tip.width}x${tip.height}:${digest(pixels)}`,
    width: tip.width,
    height: tip.height,
    format: 'r8unorm',
    pixels
  };
}

/** Non-cryptographic 64-bit digest (two independent 32-bit lanes) as 16 hex digits.
 * Reads whole words from the zero-offset copy, then folds the unaligned tail byte by byte.
 */
function digest(bytes: Uint8Array) {
  let a = 0x811c9dc5;
  let b = 0x9747b28c ^ bytes.byteLength;
  const words = bytes.byteOffset % 4 === 0 ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >>> 2) : undefined;
  const tail = words ? words.length * 4 : 0;

  if (words) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      a = Math.imul(a ^ word, 0x01000193);
      b = Math.imul(b ^ word, 0x5bd1e995);
      b ^= b >>> 15;
    }
  }

  for (let i = tail; i < bytes.byteLength; i++) {
    a = Math.imul(a ^ bytes[i]!, 0x01000193);
    b = Math.imul(b ^ bytes[i]!, 0x5bd1e995);
    b ^= b >>> 15;
  }

  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
