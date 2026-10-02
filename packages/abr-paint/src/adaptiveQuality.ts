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

/**
 * Stroke quality at the document LOD captured at contact. `size` is the brush diameter in document pixels and `tip`
 * the preset's primary tip, when it has a sampled one.
 *
 * At LOD 0 nothing is approximated. From LOD 1 a stroke may space its stamps wider than the preset asks, up to a
 * fraction of each stamp (`tipSpacing`), with every stamp's coverage raised to stand in for the ones skipped (see
 * `spacingCoverage`); retouch tools reduce their pickup; and ordinary sampled Paintbrush presets with a tip of at
 * least `approximateTipSize` use approximate masks one level finer than the view.
 */
export function adaptiveBrushQuality(
  enabled: boolean,
  values: BrushFormValues,
  lod = 0,
  blendMode = 'Nrml',
  mixing: ColorMixing = 'linear',
  size: number = values.diameter,
  tip?: Parameters<typeof tipFeatureFraction>[0]
) {
  const quality = brushQualityAtLod(enabled, lod);
  if (!quality) return undefined;
  const batchedPaint = values.tool.type === 'PbTl' && values.tipKind === 'sampledBrush' &&
    blendMode === 'Nrml' && !values.useDualBrush && !values.useWetEdges && !values.useBuildUp &&
    !(values.useShapeDynamics && values.shapeDynamics.brushProjection);
  // The Pencil thresholds each stamp to solid pixels, which leaves no partial coverage to compensate.
  const paints = !['SmTl', 'BlTl', 'ShTl', 'PcTl'].includes(values.tool.type);
  const fraction = lod === 1 ? tipSpacingFraction.near : tipSpacingFraction.far;
  return {
    minimumSpacing: quality.minimumSpacing,
    // Painting tools and the Mixer may also skip stamps closer than a fraction of the stamp: at a reduced view such
    // stamps cannot be told apart, and their coverage is compensated per pixel. Compensation restores the paint a
    // skipped stamp would have added where stamps overlap, not the area it would have swept, so the step stays
    // near the width of the tip's own strands; a bristle tip stepped further leaves dots in place of streaks.
    tipSpacing:
      paints && lod > 0 ? Math.min(fraction, tip ? strandSpacing * tipFeatureFraction(tip) : fraction) : undefined,
    // Classic retains its source filtering; its LOD spacing still reduces dense stroke work.
    pickupScale: lod > 0 && (values.tool.type === 'MixB' || (values.tool.type === 'SmTl' && mixing === 'linear'))
      ? quality.pickupScale : undefined,
    // At LOD 0 every document pixel is visible, so strokes keep Photoshop's byte-exact mask path; only coarser
    // views trade it for approximate masks. Those stay one level finer than the view, so every view pixel averages
    // four mask pixels: per-pixel texture and grain would otherwise show as speckle at the zoom being painted at.
    // Small tips keep the exact path, which is cheap for them, or a finer mask: a tip needs enough mask pixels.
    lod: batchedPaint && lod > 0 && size >= approximateTipSize
      ? Math.min(3, lod - 1, Math.floor(Math.log2(size / approximateTipSize)))
      : undefined
  };
}

/** Smallest tip, in mask pixels across, drawn with approximate masks. */
const approximateTipSize = 24;

/** Widest adaptive stamp spacing as a fraction of a stamp's longer side, at LOD 1 and at coarser LODs. */
const tipSpacingFraction = { near: 0.06, far: 0.1 };

/**
 * Width of a tip's typical strand as a fraction of the tip's longer side: the mean length of covered runs along rows
 * or columns, whichever is shorter. A solid tip gives a large fraction; bristles, grain and thin lines a small one.
 * Measured once per tip.
 */
export function tipFeatureFraction(tip: { width: number; height: number; pixels: Uint8Array }) {
  let fraction = featureFractions.get(tip.pixels);
  if (fraction === undefined) {
    const { width, height, pixels } = tip;
    let covered = 0;
    let rowRuns = 0;
    let columnRuns = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x]! < strandCoverage) {
          continue;
        }

        covered++;
        if (x === 0 || pixels[y * width + x - 1]! < strandCoverage) {
          rowRuns++;
        }

        if (y === 0 || pixels[(y - 1) * width + x]! < strandCoverage) {
          columnRuns++;
        }
      }
    }

    fraction = covered ? covered / Math.max(rowRuns, columnRuns) / Math.max(width, height) : 1;
    featureFractions.set(tip.pixels, fraction);
  }

  return fraction;
}

/**
 * Widest adaptive step in strand widths. Measured over the Megapack at view resolution: up to 1.5 strands almost no
 * preset changes visibly, from 2 about one in six does.
 */
const strandSpacing = 1.5;

/** Coverage byte from which a tip pixel counts as part of a strand. */
const strandCoverage = 96;

const featureFractions = new WeakMap<Uint8Array, number>();
