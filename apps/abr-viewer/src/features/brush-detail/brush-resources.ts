import { readPatternIndex, type PatternResource } from '@app-game/abr-parser/browser';
import type { AbrFileWithMeta, BrushWithPreview } from '../../lib/abr';
import { record } from './brush-form-schema';

/** Adds a shared, compressed resource index without expanding pattern pixels on the UI thread. */
export function attachBrushResources(file: AbrFileWithMeta) {
  let patterns: PatternResource[] = [];
  try {
    patterns = file.rawPatternData ? readPatternIndex(file.rawPatternData) : [];
  } catch {
    /* Preserve the source block; previews report missing patterns individually. */
  }
  for (const brush of file.brushes) brush.patternResources = patterns;
}

/** Replaces the secondary tip and retains its original sample record for lossless ABR export. */
export function chooseDualTip(brush: BrushWithPreview, source: BrushWithPreview): BrushWithPreview {
  const dependencies = [...(brush.sampleDependencies ?? [])];
  if (
    source.sampledDataUuid &&
    source.brushTip?.sourceSample &&
    !dependencies.some((item) => item.uuid === source.sampledDataUuid)
  ) {
    dependencies.push({ uuid: source.sampledDataUuid, source: source.brushTip.sourceSample });
  }
  return {
    ...brush,
    sampleDependencies: dependencies,
    settings: {
      ...brush.settings,
      dualBrush: {
        ...record(brush.settings.dualBrush),
        __classId: 'dualBrush',
        useDualBrush: true,
        Brsh: { ...record(source.settings.Brsh) }
      }
    }
  };
}

/** Changes the texture reference and makes its compressed resource available to previews. */
export function choosePattern(brush: BrushWithPreview, pattern: PatternResource): BrushWithPreview {
  const resources = [...(brush.patternResources ?? []).filter((item) => item.id !== pattern.id), pattern];
  return {
    ...brush,
    patternResources: resources,
    settings: {
      ...brush.settings,
      useTexture: true,
      Txtr: { __classId: 'Ptrn', Idnt: pattern.id, 'Nm  ': pattern.name }
    }
  };
}
