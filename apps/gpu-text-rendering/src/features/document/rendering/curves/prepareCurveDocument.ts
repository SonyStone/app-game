import { err, ok } from 'neverthrow';
import type { ResultValue } from '../../../../shared/errors';
import type { GpuDevice } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { TextDocument } from '../../document';
import { buildCurvePreparation } from '../../plan/buildCurvePreparation';
import type { SceneFrame } from '../createFrame';
import { createPageBackground } from '../createPageBackground';
import type { DocumentWorkers } from '../DocumentWorkers';
import type { PreparedDocument } from '../preparedDocument';
import { createComposedPagePolicy } from './createComposedPagePolicy';
import { createCompositionBudget } from './createCompositionBudget';
import { createCurvePipelines } from './createCurvePipelines';
import { createImageRevisions } from './createImageRevisions';
import { createPagePainter, type PageLayer } from './createPagePainter';
import { curveRuns } from './curveRuns';
import { createGroupCompositor } from './groupCompositor';
import { createPageBundles } from './pageBundles';
import { createPageTileCache } from './pageTileCache';
import { createPaintBounds } from './paintBounds';
import { prepareCoverageTables } from './prepareCoverageTables';
import { prepareRasterImages } from './prepareRasterImages';
import { uploadCurveGeometry } from './uploadCurveGeometry';

/**
 * Uploads reusable cubic outlines; instances remain in PDF paint order within each visible page.
 *
 * Consumes the document's loader-built staging data: `document.coverage` and `document.preparation`
 * are deleted from the caller's object after use so the live document does not pin them on the CPU.
 * A later preparation of the same document rebuilds them (coverage via `workers.coverage`, paint plans
 * on the calling thread). Resolves typed coverage-worker, GPU-lifetime and image-cache errors.
 *
 * Each frame draws either every page directly, or — when visible pages use their composed prefix
 * ({@link createComposedPagePolicy}) — cached prefix tiles under their direct foreground.
 */
export async function prepareCurveDocument(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  workers: DocumentWorkers,
  initialFrame?: SceneFrame
) {
  const uploaded = await uploadCurveResources(gpu, document, keep, workers);
  if (uploaded.isErr()) {
    return err(uploaded.error);
  }

  const resources = uploaded.value;
  const initialPages = initialFrame?.visible.map(({ index }) => index);

  const prewarmed = await prewarmInitialImages(gpu, resources, initialPages);
  if (prewarmed.isErr()) {
    return err(prewarmed.error);
  }

  const engine = createPaintEngine(gpu, document, keep, resources);

  const previews = await engine.tileCache.prepare(
    initialPages?.filter((page) => engine.policy.useComposedPage(page, initialFrame!))
  );
  if (previews.isErr()) {
    return err(previews.error);
  }

  return ok(createCurveDrawing(resources, engine));
}

/**
 * Stage 1, upload: coverage tables, raster images, the paint plan, outline geometry, page paper and the curve
 * pipelines, compiled before the first frame. Coverage failures resolve before any other allocation.
 */
async function uploadCurveResources(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  workers: DocumentWorkers
) {
  const { root, format } = gpu;
  const coverage = await prepareCoverageTables(gpu, document, keep, workers.coverage);

  if (coverage.isErr()) {
    return err(coverage.error);
  }

  const raster = prepareRasterImages(gpu, document.rasterImages, document.instances, keep, workers.raster);
  const plan = document.preparation ?? buildCurvePreparation(document);
  delete document.preparation;
  const compositor = createGroupCompositor(gpu, keep);
  const spatial = createPaintBounds(
    document.instances,
    document.pages,
    matchesLayout(plan.placements, document.pages) ? plan.spatial : undefined
  );
  const geometry = await uploadCurveGeometry(gpu, document, plan.indexed, keep);
  const background = createPageBackground(gpu, document, keep);
  const pipelines = createCurvePipelines(root, format, {
    view: background.group,
    geometry: geometry.group,
    radial: geometry.radial,
    coverage: coverage.value.group
  });
  background.compile();
  pipelines.compile();

  return ok({ coverage: coverage.value, raster, plan, compositor, spatial, geometry, background, pipelines });
}

/** GPU resources and the paint plan uploaded by stage 1. */
type CurveResources = ResultValue<Awaited<ReturnType<typeof uploadCurveResources>>>;

/**
 * Stage 2, prewarm: prepares low-resolution image fallbacks for the initial pages (every page when omitted), then
 * waits for the uploads so the first frame does not stall.
 */
async function prewarmInitialImages(gpu: GpuDevice, { raster, plan }: CurveResources, initialPages?: number[]) {
  const tails = await raster.prepareMipTails(
    initialPages?.flatMap((page) => plan.runs[page]!.flatMap(({ image }) => (image === undefined ? [] : [image])))
  );
  if (tails.isErr()) {
    return err(tails.error);
  }

  await gpu.device.queue.onSubmittedWorkDone();

  return ok();
}

/**
 * Stage 3, paint engine: the page painter, the tile cache of composed page prefixes, and the policy that chooses
 * between composed and direct drawing within a GPU cost budget. Streaming images and tile refinement dispatch
 * `change` on the returned events.
 */
function createPaintEngine(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  resources: CurveResources
) {
  const { root, device, format } = gpu;
  const { coverage, raster, plan, compositor, spatial, geometry, background, pipelines } = resources;
  const { runs, trees, composition } = plan;

  const events = new EventTarget();
  const changed = () => events.dispatchEvent(new Event('change'));
  const cachedLayer: PageLayer = { trees: (page) => composition.cached[page]!, bundles: false };
  // Images painted by a page's composed prefix gate its tile refinement and need fallback tails.
  const prefixImages = (page: number) => composition.images.get(page)!;
  const tileCache = createPageTileCache(gpu, {
    document,
    pages: composition.pages,
    keep,
    render: (pass, frame) => painter.paintPages(pass, frame, cachedLayer),
    sourcesReady: (page) => [...prefixImages(page)].every((image) => raster.isSettled(image)),
    fallbacksReady: (page) => [...prefixImages(page)].every((image) => raster.hasFallback(image)),
    changed
  });
  const imageRevision = createImageRevisions(raster, runs, tileCache, keep);
  raster.events.addEventListener('change', changed);
  keep({ destroy: () => raster.events.removeEventListener('change', changed) });
  const painter = createPagePainter({
    root,
    keep,
    background,
    geometry,
    pipelines,
    compositor,
    raster,
    spatial,
    curveBatches: curveRuns(
      [...trees, ...composition.cached, ...composition.direct],
      document.instances,
      coverage.offsets
    ),
    pageBundle: createPageBundles(device, format, trees, keep),
    imageRevision
  });
  const budget = keep(createCompositionBudget(() => device.queue.onSubmittedWorkDone(), changed));
  const policy = createComposedPagePolicy(document, composition, budget);

  return { events, tileCache, painter, budget, policy, prefixImages };
}

/**
 * Stage 4, drawing: each view's frame streams its visible images, then paints every page directly, or paints composed
 * pages as cached prefix tiles under their direct foreground. Views share every resource; image streaming and tile
 * refinement follow their merged working sets.
 */
function createCurveDrawing(
  { coverage, raster, plan, compositor, geometry, background }: CurveResources,
  { events, tileCache, painter, budget, policy, prefixImages }: ReturnType<typeof createPaintEngine>
): PreparedDocument {
  const { runs, trees, composition } = plan;
  const fullLayer: PageLayer = { trees: (page) => trees[page]!, bundles: true };

  return {
    events,
    get refinement() {
      return {
        ...tileCache.refinement,
        directPages: trees.length - composition.pages.size,
        overviewPages: composition.overview.size,
        budgetCachedPages: budget.size,
        foregroundPages: [...composition.pages].filter((page) => composition.direct[page]!.length > 0).length
      };
    },
    async settle() {
      await raster.settle();
      await tileCache.settle();
    },
    get failure() {
      return raster.failure ?? tileCache.failure;
    },
    get resourceBytes() {
      return (
        geometry.resourceBytes +
        background.resourceBytes +
        coverage.resourceBytes +
        raster.resourceBytes +
        painter.resourceBytes +
        tileCache.resourceBytes +
        compositor.resourceBytes
      );
    },
    createView() {
      // Identifies this view's requests to the image and tile caches.
      const view = {};

      return {
        draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
          const composed = policy.composedPages(frame);
          raster.update(
            frame.visible.flatMap((item) => runs[item.index]!),
            frame,
            [...composed].flatMap((page) => [...prefixImages(page)]),
            view
          );

          if (frame.vectorOnly || composed.size === 0) {
            // Diagnostic vector rendering and reading-scale frames draw every page directly.
            tileCache.pause(view);
            painter.paintPages(pass, frame, fullLayer);
          } else {
            const tiles = { ...frame, visible: frame.visible.filter(({ index }) => composed.has(index)) };
            painter.paintPages(pass, frame, {
              trees: (page) => (composed.has(page) ? composition.direct[page]! : trees[page]!),
              bundles: false,
              underlay: () => tileCache.draw(pass, tiles, view)
            });
          }

          policy.observeDirectCost(frame, composed);
        },
        destroy() {
          raster.forgetView(view);
          tileCache.forgetView(view);
        }
      };
    }
  };
}

/** Whether worker-built spatial data used the same page placement as the live layout. */
function matchesLayout(placements: readonly { x: number; y: number }[], pages: readonly { x: number; y: number }[]) {
  return (
    placements.length === pages.length &&
    placements.every((page, index) => page.x === pages[index]!.x && page.y === pages[index]!.y)
  );
}
