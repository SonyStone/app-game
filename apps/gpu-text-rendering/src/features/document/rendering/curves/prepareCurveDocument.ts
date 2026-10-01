import type { ResultValue } from '@app-game/solid-gpu/errors';
import type { GpuDevice, KeepGpuResource } from '@app-game/solid-gpu/gpu';
import { err, ok } from 'neverthrow';
import type { TextDocument } from '../../document';
import { buildCurvePreparation } from '../../plan/buildCurvePreparation';
import type { SceneFrame } from '../createFrame';
import { createPageBackground } from '../createPageBackground';
import type { DocumentWorkers } from '../DocumentWorkers';
import type { PreparedDocument } from '../preparedDocument';
import { createComposedPagePolicy } from './createComposedPagePolicy';
import { createCompositionBudget } from './createCompositionBudget';
import { createCurvePipelines } from './createCurvePipelines';
import { createDirectDrawPressure } from './createDirectDrawPressure';
import { createImageRevisions } from './createImageRevisions';
import { createPagePainter, type PageLayer } from './createPagePainter';
import { curveRuns } from './curveRuns';
import { createDetailTables } from './detailTables';
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
 * ({@link createComposedPagePolicy}) — cached prefix tiles under their direct foreground. In a multi-page overview,
 * pages may instead draw complete whole-page tiles with no direct foreground.
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

  const engine = createPaintEngine(gpu, document, keep, resources, workers);

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
 * Stage 3, paint engine: the page painter, the tile caches of composed page prefixes and of whole overview pages,
 * magnified coverage tables built on demand, and the policy that chooses between tiles and direct drawing within a
 * GPU cost budget. Streaming images, tile refinement and new tables dispatch `change` on the returned events.
 */
function createPaintEngine(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  resources: CurveResources,
  workers: DocumentWorkers
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
    expensive: (page) => composition.densePages.has(page),
    // Dense pages always draw from composed tiles; cached coverage keeps each tile render from stalling the GPU.
    prepared: (page, frame) => detailTables.ready(page, frame),
    changed
  });
  const fullLayer: PageLayer = { trees: (page) => trees[page]!, bundles: false };
  const pageImages = runs.map((pageRuns) => pageRuns.flatMap(({ image }) => (image === undefined ? [] : [image])));
  const wholeCache =
    composition.wholePages.size > 0
      ? createPageTileCache(gpu, {
          document,
          pages: composition.wholePages,
          keep,
          render: (pass, frame) => painter.paintPages(pass, frame, fullLayer),
          sourcesReady: (page) => pageImages[page]!.every((image) => raster.isSettled(image)),
          fallbacksReady: (page) => pageImages[page]!.every((image) => raster.hasFallback(image)),
          expensive: (page) => composition.densePages.has(page),
          prepared: (page, frame) => detailTables.ready(page, frame),
          changed
        })
      : undefined;
  const imageRevision = createImageRevisions(
    raster,
    runs,
    {
      invalidate(pages) {
        const changedPages = pages && [...pages];
        tileCache.invalidate(changedPages);
        wholeCache?.invalidate(changedPages);
      }
    },
    keep
  );
  // Prefetched fallbacks of offscreen images change nothing on screen; tile caches report their own refinement.
  const imageChanged = (event: Event) => {
    const image = (event as CustomEvent<{ image: number } | undefined>).detail?.image;
    if (image === undefined || raster.isVisible(image)) {
      changed();
    }
  };
  raster.events.addEventListener('change', imageChanged);
  keep({ destroy: () => raster.events.removeEventListener('change', imageChanged) });
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
  const pressure = keep(createDirectDrawPressure(() => device.queue.onSubmittedWorkDone(), changed));
  const policy = createComposedPagePolicy(document, composition, budget);
  const detailTables = keep(
    createDetailTables({
      device,
      detail: coverage.detail,
      baseOffsets: coverage.offsets,
      document,
      worker: workers.tables,
      changed
    })
  );

  return {
    events,
    tileCache,
    wholeCache,
    detailTables,
    painter,
    budget,
    pressure,
    policy,
    prefixImages,
    pageImages
  };
}

/**
 * Stage 4, drawing: each view's frame streams its visible images, then paints every page directly, or paints composed
 * pages as cached prefix tiles under their direct foreground. Views share every resource; image streaming and tile
 * refinement follow their merged working sets.
 */
function createCurveDrawing(
  { coverage, raster, plan, compositor, geometry, background }: CurveResources,
  {
    events,
    tileCache,
    wholeCache,
    detailTables,
    painter,
    budget,
    pressure,
    policy,
    prefixImages,
    pageImages
  }: ReturnType<typeof createPaintEngine>
): PreparedDocument {
  const { runs, trees, composition } = plan;
  const fullLayer: PageLayer = { trees: (page) => trees[page]!, bundles: true };
  let prefetching = false;

  return {
    events,
    get refinement() {
      return {
        ...tileCache.refinement,
        directPages: trees.length - composition.pages.size,
        overviewPages: composition.overview.size,
        budgetCachedPages: budget.size,
        foregroundPages: [...composition.pages].filter((page) => composition.direct[page]!.length > 0).length,
        wholeTilePages: composition.wholePages.size,
        overviewConstrained: pressure.constrained,
        overview: wholeCache?.refinement
      };
    },
    async settle() {
      await raster.settle();
      await detailTables.settle();
      await tileCache.settle();
      await wholeCache?.settle();
    },
    get failure() {
      return raster.failure ?? tileCache.failure ?? wholeCache?.failure;
    },
    get resourceBytes() {
      return (
        geometry.resourceBytes +
        background.resourceBytes +
        coverage.resourceBytes +
        raster.resourceBytes +
        painter.resourceBytes +
        tileCache.resourceBytes +
        (wholeCache?.resourceBytes ?? 0) +
        compositor.resourceBytes
      );
    },
    createView() {
      // Identifies this view's requests to the image and tile caches.
      const view = {};
      /** Pages this view draws from composed tiles, updated by the policy's `enterComposedPages`. */
      const composed = new Set<number>();
      /** Pages this view draws from whole-page overview tiles, updated by the policy's `enterWholePages`. */
      const whole = new Set<number>();

      return {
        draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
          const overview = wholeCache ? policy.overviewTilePages(frame, whole) : new Set<number>();
          const wanted = policy.composedPages(frame);
          updateWholePages(frame, overview);
          detailTables.request(
            frame,
            frame.visible.filter(({ index }) => !whole.has(index)).map(({ index }) => index)
          );

          // Pages drawn from whole-page tiles need no composed prefix. On a slow device, overview pages enter those
          // tiles as soon as their prefetched fallback exists, so composing their prefix as well would only repeat
          // the group compositor's work.
          for (const page of pressure.constrained ? [...whole, ...overview] : whole) {
            wanted.delete(page);
          }

          raster.update(
            frame.visible.flatMap((item) => runs[item.index]!),
            frame,
            [
              ...[...wanted].flatMap((page) => [...prefixImages(page)]),
              ...[...overview].flatMap((page) => pageImages[page]!)
            ],
            view
          );

          if (frame.vectorOnly || (wanted.size === 0 && whole.size === 0)) {
            // Diagnostic vector rendering and reading-scale frames draw every page directly.
            composed.clear();
            tileCache.pause(view);
            painter.paintPages(pass, frame, fullLayer);
          } else {
            if (wanted.size > 0) {
              tileCache.request({ ...frame, visible: frame.visible.filter(({ index }) => wanted.has(index)) }, view);
            } else {
              tileCache.pause(view);
            }

            policy.enterComposedPages(composed, wanted, (page) => tileCache.covers(page, view));
            const tiles = { ...frame, visible: frame.visible.filter(({ index }) => composed.has(index)) };
            const wholeTiles = { ...frame, visible: frame.visible.filter(({ index }) => whole.has(index)) };
            painter.paintPages(pass, frame, {
              trees: (page) => (whole.has(page) ? [] : composed.has(page) ? composition.direct[page]! : trees[page]!),
              bundles: false,
              underlay: () => {
                tileCache.draw(pass, tiles, view);
                wholeCache?.draw(pass, wholeTiles, view);
              }
            });
          }

          policy.observeDirectCost(frame, new Set([...composed, ...whole]));

          // Overview pages still drawn directly measure whether this device should enter tiles before they refine.
          if ([...overview].some((page) => !whole.has(page))) {
            pressure.observe();
          }

          startPrefetching();
        },
        destroy() {
          raster.forgetView(view);
          tileCache.forgetView(view);
          wholeCache?.forgetView(view);
        }
      };

      /**
       * Requests the overview pages' whole-page tiles and moves ready pages from direct to tile drawing. A device too
       * slow for direct drawing may show their pinned fallback while detail refines.
       */
      function updateWholePages(frame: SceneFrame, overview: ReadonlySet<number>) {
        if (!wholeCache) {
          return;
        }

        if (overview.size > 0) {
          wholeCache.request({ ...frame, visible: frame.visible.filter(({ index }) => overview.has(index)) }, view);
        } else {
          wholeCache.pause(view);
        }

        policy.enterWholePages(whole, overview, {
          covered: (page) => wholeCache.covers(page, view),
          based: (page) => wholeCache.hasBase(page),
          early: pressure.constrained
        });
      }
    }
  };

  /**
   * Starts idle prefetching once a view has registered its visible working set, so it never precedes visible work.
   * Whole-page fallbacks let a later zoom-out switch to tiles without drawing every page's vectors first; image pages
   * need their tails before a tile can be built, and dense pages wait for cached coverage of their dense outlines.
   */
  function startPrefetching() {
    if (prefetching || !wholeCache) {
      return;
    }

    prefetching = true;
    const pages = [...composition.wholePages];
    raster.prefetchTails(pages.flatMap((page) => pageImages[page]!));
    wholeCache.prefetch(pages);
  }
}

/** Whether worker-built spatial data used the same page placement as the live layout. */
function matchesLayout(placements: readonly { x: number; y: number }[], pages: readonly { x: number; y: number }[]) {
  return (
    placements.length === pages.length &&
    placements.every((page, index) => page.x === pages[index]!.x && page.y === pages[index]!.y)
  );
}
