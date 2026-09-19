import { decodeResource, resolveResources, type EmbeddedResource, type ResourceSource } from '@app-game/abr-parser';
import { computedSecondaryTip } from './computedTip';
import type { BrushTipImage, BrushAsset as BrushWithPreview } from './library';
import { dualPreviewInput, previewStrokeSize, type PreviewInput } from './stroke';

/** Compressed auxiliary resources cross the worker boundary only on cache misses. */
export type PreviewResourceSource = {
  pattern?: ResourceSource;
  dualSample?: ResourceSource;
  dualHardness?: number;
  missing?: string;
};
/** Decoded coverage textures consumed by either rendering backend. */
export type PreviewResources = { pattern?: BrushTipImage; dualTip?: BrushTipImage; dualKey?: string; warning?: string };

/** Prepares a computed secondary at the same output size used by the preview sampler.
 * Cached decoded inputs remain immutable, so edits and output resizing cannot reuse stale geometry.
 */
export function preparePreviewResources(input: PreviewInput, resources: PreviewResources): PreviewResources {
  if (!input.values.useDualBrush || input.values.dualBrush.tipId || !resources.dualTip) return resources;
  const tip = computedSecondaryTip(previewStrokeSize(dualPreviewInput(input)), input.values.dualBrush);
  return { ...resources, dualTip: tip, dualKey: tip.key };
}

/** Resolves resources by UUID without decoding pixels on the UI thread. */
export function brushPreviewResources(brush: BrushWithPreview): PreviewResourceSource {
  const selected = resolveResources(
    brush.resources.map((r) => r.resource),
    brush.preset
  );
  const source = (resource: typeof selected.sample) =>
    resource
      ? brush.resources.find(
          (r) =>
            r.resource.kind === resource.kind &&
            r.resource.id === resource.id &&
            r.resource.section === resource.section &&
            r.resource.index === resource.index
        )?.source
      : undefined;
  const dual = brush.preset.dualBrush;
  return {
    pattern: source(selected.pattern),
    dualSample: source(selected.dualSample),
    dualHardness: dual?.enabled && !dual.tip?.sampleId ? (dual.tip?.hardness ?? 100) : undefined,
    missing: selected.warnings[0]
  };
}

/** Pattern metadata paired with a standalone compressed source. */
export type PatternResource = EmbeddedResource;

/** Decodes only resources needed by the current brush; source arrays remain immutable. */
export function decodePreviewResources(source: PreviewResourceSource): PreviewResources {
  const result: PreviewResources = { warning: source.missing };
  try {
    if (source.pattern) result.pattern = decodeResource(source.pattern);
  } catch (error) {
    result.warning = String(error);
  }
  try {
    result.dualTip = source.dualSample
      ? decodeResource(source.dualSample)
      : source.dualHardness !== undefined
        ? computedSecondaryTip(128, { hardness: source.dualHardness, angle: 0, roundness: 100 })
        : undefined;
  } catch (error) {
    result.warning = String(error);
  }
  return result;
}
