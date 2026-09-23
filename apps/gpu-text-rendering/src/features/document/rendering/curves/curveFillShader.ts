import tgpu, { d, std } from 'typegpu';
import { gridCoverage } from './coverageGrid';
import { tableCoverage } from './coverageTable';
import { curveLayout, shapeOnlySlot } from './curveBindings';
import { outlineCoverage } from './curveCoverage';

/** Uses area tables only when the draw's projected footprints are entirely within their supported range. */
export const cachedCurveFragment = tgpu.fragmentFn({
  in: {
    local: d.vec2f,
    pagePosition: d.vec2f,
    instance: d.interpolate('flat', d.u32),
    localDx: d.interpolate('flat', d.vec2f),
    localDy: d.interpolate('flat', d.vec2f)
  },
  out: d.vec4f
})((input) => {
  'use gpu';
  const item = curveLayout.$.instances[input.instance]!;
  const coverage = tableCoverage(item.info.x, input.local, input.localDx, input.localDy);

  return paintCoverage(coverage.x, item.color, item.clip, input.pagePosition);
});

/** Magnified fills evaluate source cubics without carrying the area-table shader into each pixel. */
export const analyticCurveFragment = tgpu.fragmentFn({
  in: {
    local: d.vec2f,
    pagePosition: d.vec2f,
    instance: d.interpolate('flat', d.u32),
    localDx: d.interpolate('flat', d.vec2f),
    localDy: d.interpolate('flat', d.vec2f)
  },
  out: d.vec4f
})((input) => {
  'use gpu';
  const item = curveLayout.$.instances[input.instance]!;
  let coverage = gridCoverage(item.info.x, input.local, input.localDx, input.localDy);

  if (coverage < 0) {
    coverage = outlineCoverage(item, input.local, input.localDx, input.localDy);
  }

  return paintCoverage(coverage, item.color, item.clip, input.pagePosition);
});

/** Ordinary unclipped fills avoid the register pressure of hairline and analytic-clip evaluation. */
export const simpleCurveFragment = tgpu.fragmentFn({
  in: {
    local: d.vec2f,
    pagePosition: d.vec2f,
    instance: d.interpolate('flat', d.u32),
    localDx: d.interpolate('flat', d.vec2f),
    localDy: d.interpolate('flat', d.vec2f)
  },
  out: d.vec4f
})((input) => {
  'use gpu';
  const item = curveLayout.$.instances[input.instance]!;
  const dx = input.localDx;
  const dy = input.localDy;
  const cached = tableCoverage(item.info.x, input.local, dx, dy);
  let coverage = d.f32(cached.x);

  if (cached.y < 1) {
    coverage = std.mix(outlineCoverage(item, input.local, dx, dy), cached.x, cached.y);
  }

  return paintCoverage(coverage, item.color, item.clip, input.pagePosition);
});

function paintCoverage(coverage: number, color: d.v4f, clip: d.v4f, point: d.v2f) {
  'use gpu';
  let alpha = d.f32(coverage);

  if (point.x < clip.x || point.y < clip.y || point.x > clip.z || point.y > clip.w) {
    alpha = 0;
  }

  if (shapeOnlySlot.$) {
    return d.vec4f(alpha);
  }

  alpha *= color.a;
  return d.vec4f(std.mul(color.rgb, alpha), alpha);
}
