import { decodePattern, readSample, type PatternResource } from '@app-game/abr-parser/browser';
import type { BrushTipImage, Brush as BrushWithPreview } from '@app-game/abr-parser/reader';
import { record } from './form';
import { generateComputedBrushTip } from './stroke';

/** Compressed auxiliary resources cross the worker boundary only on cache misses. */
export type PreviewResourceSource = {
  pattern?: PatternResource;
  dualSample?: { data: Uint8Array; subVersion: number };
  dualHardness?: number;
  missing?: string;
};
/** Decoded coverage textures consumed by either rendering backend. */
export type PreviewResources = { pattern?: BrushTipImage; dualTip?: BrushTipImage; warning?: string };

/** Resolves resources by UUID without decoding pixels on the UI thread. */
export function brushPreviewResources(
  brush: BrushWithPreview & { patternResources?: PatternResource[] }
): PreviewResourceSource {
  const s = brush.settings,
    dual = record(s.dualBrush),
    tip = record(dual.Brsh);
  const patternId = record(s.Txtr).Idnt;
  const pattern = s.useTexture ? brush.patternResources?.find((item) => item.id === patternId) : undefined;
  const dualId = tip.sampledData;
  const dualSample =
    dual.useDualBrush && dualId
      ? dualId === brush.sampledDataUuid
        ? brush.brushTip?.sourceSample
        : brush.sampleDependencies?.find((item) => item.uuid === dualId)?.source
      : undefined;
  const missing =
    s.useTexture && !pattern
      ? 'Embedded texture unavailable'
      : dual.useDualBrush && dualId && !dualSample
        ? 'Secondary brush sample unavailable'
        : undefined;
  return {
    pattern,
    dualSample,
    dualHardness: dual.useDualBrush && !dualId ? Number(record(tip.Hrdn).value ?? 100) : undefined,
    missing
  };
}

/** Decodes only resources needed by the current brush; source arrays remain immutable. */
export function decodePreviewResources(source: PreviewResourceSource): PreviewResources {
  const result: PreviewResources = { warning: source.missing };
  try {
    if (source.pattern) result.pattern = decodePattern(source.pattern);
  } catch (error) {
    result.warning = String(error);
  }
  try {
    result.dualTip = source.dualSample
      ? readSample(source.dualSample.data, source.dualSample.subVersion).tip
      : source.dualHardness !== undefined
        ? generateComputedBrushTip(128, source.dualHardness)
        : undefined;
  } catch (error) {
    result.warning = String(error);
  }
  return result;
}
