import type { ColorMixing } from '@app-game/abr-brush/effects';
import type { BrushFormValues } from '@app-game/abr-brush/form';

/** Permanent brush work budget at the selected document LOD. No camera/zoom thresholds live here. */
export function brushQualityAtLod(enabled: boolean, lod = 0) {
  if (!enabled || !Number.isInteger(lod) || lod < 0 || lod > 12) return undefined;
  return {
    lod,
    // One stamp interval per target LOD pixel. A quarter-pixel interval oversamples
    // the coarse view and rebuilds a large backlog on dense, long strokes.
    minimumSpacing: Math.min(64, 2 ** lod),
    pickupScale: 2 ** -Math.min(4, lod)
  };
}

/** Every ABR tool receives the LOD spacing budget. Raster shortcuts preserve each tool's compositing path. */
export function adaptiveBrushQuality(
  enabled: boolean,
  values: BrushFormValues,
  lod = 0,
  blendMode = 'Nrml',
  mixing: ColorMixing = 'linear'
) {
  const quality = brushQualityAtLod(enabled, lod);
  if (!quality) return undefined;
  const batchedPaint = values.tool.type === 'PbTl' && values.tipKind === 'sampledBrush' &&
    blendMode === 'Nrml' && !values.useDualBrush && !values.useWetEdges && !values.useBuildUp &&
    !(values.useShapeDynamics && values.shapeDynamics.brushProjection);
  return {
    minimumSpacing: quality.minimumSpacing,
    // Classic retains its source filtering; its LOD spacing still reduces dense stroke work.
    pickupScale: lod > 0 && (values.tool.type === 'MixB' || (values.tool.type === 'SmTl' && mixing === 'linear'))
      ? quality.pickupScale : undefined,
    lod: batchedPaint ? Math.min(3, lod) : undefined
  };
}
