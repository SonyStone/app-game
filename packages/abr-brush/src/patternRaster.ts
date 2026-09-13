import { planPatternSampling, rasterizePattern, selectPatternLevel } from './patternSampling';
import type { createPatternPyramid } from './patternPyramid';

/** Rasterizes a document rectangle from Photoshop's four prepared pattern levels.
 * Scale is relative to level zero; tone and inversion follow this byte operation.
 * The returned pixels belong to the caller. Coordinates and origin are document
 * pixels, not normalized UVs or pixel centers. Nonpositive scales use Photoshop's
 * wrapper fallback of 0.01; nonfinite scales are rejected by the level selector.
 */
export function rasterizePatternRegion(
  levels: ReturnType<typeof createPatternPyramid>,
  scale: number,
  bounds: Parameters<typeof planPatternSampling>[2],
  origin?: Parameters<typeof planPatternSampling>[3]
) {
  const { source, plan } = preparePatternRegion(levels, scale, bounds, origin);
  const data = new Uint8Array(plan.width * plan.height);
  rasterizePattern(source, plan, data);
  return { width: plan.width, height: plan.height, data };
}

/** Shared host preparation for CPU and GPU consumers of the original byte sampler. */
export function preparePatternRegion(
  levels: ReturnType<typeof createPatternPyramid>,
  scale: number,
  bounds: Parameters<typeof planPatternSampling>[2],
  origin?: Parameters<typeof planPatternSampling>[3]
) {
  const selected = selectPatternLevel(scale <= 0 ? 0.01 : scale);
  const source = levels[selected.level]!;
  return { level: selected.level, source, plan: planPatternSampling(source, selected.scale, bounds, origin) };
}
