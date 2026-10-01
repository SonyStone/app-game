import type { KeepGpuResource } from '@app-game/solid-gpu/gpu';
import { d, type TgpuRoot } from 'typegpu';
import type { PaintNode } from '../../plan/paintTree';
import { View, viewLayout } from '../bindings';
import type { SceneFrame } from '../createFrame';
import type { createPageBackground } from '../createPageBackground';
import type { createCurvePipelines, CurvePipeline, PaintMode } from './createCurvePipelines';
import { croppedView } from './croppedView';
import type { curveRuns } from './curveRuns';
import { cellGridShift } from './curveShader';
import type { createGroupCompositor } from './groupCompositor';
import type { createPageBundles } from './pageBundles';
import type { createPaintBounds } from './paintBounds';
import type { prepareRasterImages } from './prepareRasterImages';
import { selectFillBatches } from './selectFillBatches';
import type { uploadCurveGeometry } from './uploadCurveGeometry';

/** Which paint trees a {@link createPagePainter} call draws, and how. */
export type PageLayer = {
  /** Paint tree drawn for a visible page: the full tree, its composed prefix or its direct suffix. */
  trees: (page: number) => PaintNode[];
  /** Whether ordinary pages may replay retained bundles; requires `trees` to be the full paint trees. */
  bundles: boolean;
  /** Draws after the page paper and before any page content, e.g. composed tiles. */
  underlay?: () => void;
};

/**
 * The curve renderer's paint engine. `paintPages` draws page paper and one {@link PageLayer} for a frame:
 * pages containing transparency groups or blend modes go through the group compositor, other pages paint
 * directly or replay retained bundles, and ordinary fills pick their shader at the frame's coverage scale.
 * Cropped compositing views are allocated on demand and released through `keep`'s owner.
 */
export function createPagePainter({
  root,
  keep,
  background,
  geometry,
  pipelines,
  compositor,
  raster,
  spatial,
  curveBatches,
  pageBundle,
  imageRevision
}: {
  root: TgpuRoot;
  keep: KeepGpuResource;
  background: ReturnType<typeof createPageBackground>;
  geometry: Awaited<ReturnType<typeof uploadCurveGeometry>>;
  pipelines: ReturnType<typeof createCurvePipelines>;
  compositor: ReturnType<typeof createGroupCompositor>;
  raster: ReturnType<typeof prepareRasterImages>;
  spatial: ReturnType<typeof createPaintBounds>;
  /** Shader batches per paint leaf, keyed `first:count`. */
  curveBatches: ReturnType<typeof curveRuns>;
  pageBundle: ReturnType<typeof createPageBundles>;
  /** Changes when a page's image fallbacks change, invalidating its retained bundle. */
  imageRevision: (page: number) => number;
}) {
  /** One view per composite-list position, rewritten for each frame's crop. */
  const croppedViews: { buffer: typeof background.view; group: typeof background.group }[] = [];

  return {
    /** Bytes of the cropped view uniforms allocated so far. */
    get resourceBytes() {
      return croppedViews.length * d.sizeOf(View);
    },
    /** Records the layer into `pass`; composited pages also submit their offscreen work first. */
    paintPages(pass: GPURenderPassEncoder, frame: SceneFrame, { trees, bundles, underlay }: PageLayer) {
      let activeGroup = background.group;
      const visible = spatial(frame);
      const { cacheLevel, exactLevel } = coverageCacheLevel(frame);
      const cacheScale = 2 ** cacheLevel;
      const exactScale = 2 ** exactLevel;
      // Physical pixels per page size, along the longer screen axis.
      const pagePixels = Math.max(Math.abs(frame.mul[0]) * frame.width, Math.abs(frame.mul[1]) * frame.height) / 2;
      background.writeView(frame, [2 / frame.width, 2 / frame.height], 0);

      const compositePages = frame.visible.filter(({ index }) =>
        trees(index).some((node) => 'children' in node || node.blend !== 0)
      );
      const composedIndices = new Set(compositePages.map(({ index }) => index));
      const ordinaryPages = frame.visible.filter(({ index }) => !composedIndices.has(index));
      const paintBackground = (pass: GPURenderPassEncoder) => {
        background.draw(pass);
        underlay?.();
      };
      const paint = (
        encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
        run: Exclude<PaintNode, { children: PaintNode[] }>,
        shapeOnly = false
      ) => {
        // Retained bundles record every leaf so pans can reuse them; direct passes skip invisible leaves.
        if ('executeBundles' in encoder && !visible.rect(run)) {
          return;
        }

        const mode: PaintMode = shapeOnly ? 'shape' : 'normal';
        const draw = (pipeline: CurvePipeline, first: number, count: number) => {
          const ranges =
            'executeBundles' in encoder && frame.visible.length <= 4
              ? visible.ranges(first, count)
              : [{ first, count }];

          for (const span of ranges) {
            withEncoder(pipeline.with(activeGroup), encoder).drawIndexed(6, span.count, 0, 0, span.first);
          }
        };

        if (run.image !== undefined) {
          const image = raster.get(run.image);

          if (image) {
            draw(pipelines.image[mode].with(image), run.first, run.count);
          }
          return;
        }

        if (frame.vectorOnly) {
          draw(pipelines.fills.curve[mode], run.first, run.count);
          return;
        }

        const batches = curveBatches.get(`${run.first}:${run.count}`)!;

        for (const span of selectFillBatches(batches, cacheScale, exactScale)) {
          const end = span.first + span.count;
          let next = span.first;

          // Magnified figures draw as cells between the span's other instances, keeping paint order. Retained
          // bundles, recorded for small overview pages, never need them.
          if ('executeBundles' in encoder) {
            for (const batch of batches) {
              for (const { index, norm } of batch.large) {
                if (index < next || index >= end || norm * pagePixels < cellOutlinePixels) {
                  continue;
                }

                if (index > next) {
                  draw(pipelines.fills[span.kind][mode], next, index - next);
                }

                // About one cell per cellPixels on screen; the first vertex carries the cells per side.
                const cells = Math.min(maxCells, Math.max(minCells, Math.ceil((norm * pagePixels) / cellPixels)));
                pipelines.cells[mode]
                  .with(activeGroup)
                  .with(encoder)
                  .draw(6 * cells * cells, 1, cells << cellGridShift, index);
                next = index + 1;
              }
            }
          }

          if (next < end) {
            draw(pipelines.fills[span.kind][mode], next, end - next);
          }
        }
      };

      if (compositePages.length > 0) {
        compositor.draw(pass, {
          size: frame,
          pages: compositePages.map(({ index }) => trees(index)),
          bounds: visible.rect,
          painter: {
            preparePage(position, rect, width, height) {
              activeGroup = croppedGroup(position, croppedView(frame, rect, width, height));
            },
            background(pass) {
              paintBackground(pass);
              paintOrdinary(pass);
            },
            paint
          }
        });
      } else {
        paintBackground(pass);
        paintOrdinary(pass);
      }

      // One remaining group must not drag every ordinary page through offscreen
      // compositing. Page rectangles do not overlap, so these draws stay independent.
      function paintOrdinary(pass: GPURenderPassEncoder) {
        activeGroup = background.group;
        // Keep composed foreground inline. Replaying its bundles after tile refinement
        // stalls Chrome 153/Metal; untouched ordinary pages still reuse their bundles.
        if (!frame.vectorOnly && ordinaryPages.length > 4 && bundles) {
          pass.executeBundles(
            ordinaryPages.map(({ index }) =>
              pageBundle(index, paint, `${cacheLevel}:${exactLevel}:${imageRevision(index)}`)
            )
          );
        } else {
          for (const node of ordinaryPages.flatMap(({ index }) => trees(index))) {
            if (!('children' in node)) {
              paint(pass, node);
            }
          }
        }
      }
    }
  };

  /** Writes the crop's view into the uniform for this composite-list position and returns its bindings. */
  function croppedGroup(position: number, view: ReturnType<typeof croppedView>) {
    let cropped = croppedViews[position];

    if (!cropped) {
      const buffer = keep(root.createBuffer(View)).$usage('uniform');
      cropped = { buffer, group: root.createBindGroup(viewLayout, { view: buffer, pages: background.offsets }) };
      croppedViews[position] = cropped;
    }

    cropped.buffer.write(view);
    return cropped.group;
  }

  function withEncoder(pipeline: CurvePipeline, encoder: GPURenderPassEncoder | GPURenderBundleEncoder) {
    const bound = 'executeBundles' in encoder ? pipeline.with(encoder) : pipeline.with(encoder);
    return bound.withIndexBuffer(geometry.quadIndices);
  }
}

/** Quantizes a conservative pixel footprint; cached-only draws never enter the blend/fallback range. */
function coverageCacheLevel(frame: SceneFrame) {
  const [a, b, c, e] = frame.rotation;
  const x = frame.mul[0] * 0.5;
  const y = frame.mul[1] * 0.5;
  const norm = Math.hypot(a! * x * frame.width, b! * x * frame.height, c! * y * frame.width, e! * y * frame.height);

  // The margin covers floating-point rounding between JS and shader f32 arithmetic.
  const determinant = Math.abs((a! * e! - b! * c!) * x * y * frame.width * frame.height);
  const minimum = determinant / Math.max(norm, 1e-20);

  return {
    cacheLevel: Math.floor(Math.log2(1 / (6.01 * norm))),
    exactLevel: Math.ceil(Math.log2(0.71 / Math.max(minimum, 1e-20)))
  };
}

/** Screen size, in physical pixels, from which a large ordinary fill draws as cells instead of one quad. */
const cellOutlinePixels = 256;
/** Target cell size in physical pixels: small enough that boundary cells cover little, large enough to keep vertices few. */
const cellPixels = 32;
/** Fewest and most cells per side; 64² cells of six vertices stay within the first vertex's low 16 bits. */
const minCells = 8;
const maxCells = 64;
