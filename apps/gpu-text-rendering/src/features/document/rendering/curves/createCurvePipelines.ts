import type { TgpuBindGroup, TgpuRoot, WithBinding } from 'typegpu';
import { shapeOnlySlot } from './curveBindings';
import { analyticCurveFragment, cachedCurveFragment, cellCurveFragment, simpleCurveFragment } from './curveFillShader';
import { cellCurveVertex, curveFragment, curveVertex } from './curveShader';
import { rasterFragment, rasterVertex } from './imageShader';

/**
 * Builds the curve renderer's instanced pipelines. Every pipeline exists as a `normal` colour variant and a
 * `shape` variant (knockout coverage only), so callers select `pipelines.x[mode]` instead of branching.
 * Fill kinds follow {@link selectFillBatches}: `curve` is the general shader for clipped, stroked or
 * vector-only draws; `simple`, `cached` and `analytic` are ordinary-fill specializations. Pipelines compile
 * lazily; `compile` builds the normal variants the first frame needs.
 */
export function createCurvePipelines(
  root: TgpuRoot,
  format: GPUTextureFormat,
  groups: {
    /** View/page-offset bindings (the view group may be swapped for a cropped view at draw time). */
    view: TgpuBindGroup;
    /** Curves, instances, clips and bins. */
    geometry: TgpuBindGroup;
    /** Image-indexed radial gradient geometry. */
    radial: TgpuBindGroup;
    /** Coverage tables for ordinary fills. */
    coverage: TgpuBindGroup;
  }
) {
  const targets = { format, blend: premultipliedBlend };
  const fill = (fragment: typeof simpleCurveFragment) =>
    variants((root) =>
      root
        .createRenderPipeline({ vertex: curveVertex, fragment, targets })
        .with(groups.view)
        .with(groups.geometry)
        .with(groups.coverage)
    );
  const fills = {
    curve: variants((root) =>
      root
        .createRenderPipeline({ vertex: curveVertex, fragment: curveFragment, targets })
        .with(groups.view)
        .with(groups.geometry)
    ),
    simple: fill(simpleCurveFragment),
    cached: fill(cachedCurveFragment),
    analytic: fill(analyticCurveFragment)
  };
  const cells = variants((root) =>
    root
      .createRenderPipeline({ vertex: cellCurveVertex, fragment: cellCurveFragment, targets })
      .with(groups.view)
      .with(groups.geometry)
      .with(groups.coverage)
  );
  const image = variants((root) =>
    root
      .createRenderPipeline({ vertex: rasterVertex, fragment: rasterFragment, targets })
      .with(groups.view)
      .with(groups.geometry)
      .with(groups.radial)
  );

  return {
    /** Outline pipelines by fill kind. */
    fills,
    /**
     * Magnified ordinary fills drawn as a grid of `n`² cells; draw `6n²` vertices from first vertex
     * `n << cellGridShift` with the outline's instance as the first instance, without an index buffer.
     */
    cells,
    /** Raster image pipeline; bind the image's group before drawing. */
    image,
    /** Compiles the normal variants; shape variants compile on first knockout use. */
    compile() {
      root.unwrap(fills.curve.normal);
      root.unwrap(image.normal);
      root.unwrap(fills.simple.normal);
      root.unwrap(fills.cached.normal);
      root.unwrap(fills.analytic.normal);
    }
  };

  function variants<T>(build: (root: WithBinding) => T): Record<PaintMode, T> {
    return { normal: build(root), shape: build(root.with(shapeOnlySlot, true)) };
  }
}

/** Colour output (`normal`) or knockout shape coverage (`shape`). */
export type PaintMode = 'normal' | 'shape';

/** Any curve-renderer pipeline; all share the view and geometry bindings. */
export type CurvePipeline = ReturnType<typeof createCurvePipelines>['fills']['curve']['normal'];

/** Premultiplied source-over, matching the page tiles and compositor. */
const premultipliedBlend: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
};
