import type { PatternResource } from '@app-game/abr-brush/resources';
import type { AbrFileWithMeta, BrushWithPreview } from '../../lib/abr';

/** Rust's bulk loader already attached standalone sources; expose patterns to picker views. */
export function attachBrushResources(file: AbrFileWithMeta) {
  for (const brush of file.brushes)
    brush.patternResources = brush.resources.filter((r) => r.resource.kind === 'pattern');
}
/** Selects a secondary preset tip and retains the source archive for composition. */
export function chooseDualTip(brush: BrushWithPreview, source: BrushWithPreview): BrushWithPreview {
  return {
    ...brush,
    resources: [...brush.resources, ...source.resources],
    preset: {
      ...brush.preset,
      dualBrush: { ...brush.preset.dualBrush, kind: 'dualBrush', enabled: true, tip: source.preset.tip }
    }
  };
}
/** Selects a pattern using readable fields and its independent encoded source. */
export function choosePattern(brush: BrushWithPreview, pattern: PatternResource): BrushWithPreview {
  return {
    ...brush,
    resources: [...brush.resources, pattern],
    patternResources: [...(brush.patternResources ?? []).filter((r) => r.resource.id !== pattern.resource.id), pattern],
    preset: {
      ...brush.preset,
      textureEnabled: true,
      texture: { kind: 'pattern', identifier: pattern.resource.id, name: pattern.resource.name ?? '' }
    }
  };
}
