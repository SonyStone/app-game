import { err, ok } from 'neverthrow';
import { d } from 'typegpu';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import { pageVertices, type TextDocument } from '../../document';
import { View, pageLayout, viewLayout } from '../bindings';
import type { SceneFrame } from '../createFrame';
import { pageFragment, pageVertex } from '../pageShader';
import { uploadBuffer } from '../uploadBuffer';
import { buildCurvePreparation } from './buildCurvePreparation';
import { createCompositionBudget } from './createCompositionBudget';
import { croppedView } from './croppedView';
import { Cubic, CurveInstance, curveLayout, shapeOnlySlot } from './curveBindings';
import { analyticCurveFragment, cachedCurveFragment, simpleCurveFragment } from './curveFillShader';
import { curveRuns } from './curveRuns';
import { curveFragment, curveVertex } from './curveShader';
import { createGroupCompositor } from './groupCompositor';
import { rasterFragment, rasterVertex } from './imageShader';
import { createPageBundles } from './pageBundles';
import { createPageTileCache } from './pageTileCache';
import { createPaintBounds } from './paintBounds';
import { type PaintNode } from './paintTree';
import { prepareCoverageTables } from './prepareCoverageTables';
import { prepareRasterImages } from './prepareRasterImages';
import { RadialGradient, radialLayout } from './radialGradient';

/** Uploads reusable cubic outlines; instances remain in PDF paint order within each visible page. */
export async function prepareCurveDocument(
  gpu: GpuContext,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  initialFrame?: SceneFrame
) {
  const { root, device, format } = gpu;
  const coverage = await prepareCoverageTables(gpu, document, keep);
  const rasterResult = prepareRasterImages(gpu, document.rasterImages, keep);

  if (rasterResult.isErr()) {
    return err(rasterResult.error);
  }

  const raster = rasterResult.value;
  const {
    runs,
    trees,
    composition,
    indexed,
    spatial: preparedSpatial,
    placements
  } = document.preparation ?? buildCurvePreparation(document);
  delete document.preparation;
  const compositor = createGroupCompositor(gpu, keep);
  const matchingLayout =
    placements.length === document.pages.length &&
    placements.every((page, index) => page.x === document.pages[index]!.x && page.y === document.pages[index]!.y);
  const spatial = createPaintBounds(document.instances, document.pages, matchingLayout ? preparedSpatial : undefined);
  const curves = keep(root.createBuffer(d.arrayOf(Cubic, Math.max(1, document.curves.byteLength / 32)))).$usage(
    'storage'
  );
  await uploadBuffer(gpu, curves.buffer, document.curves);
  const instances = keep(
    root.createBuffer(d.arrayOf(CurveInstance, Math.max(1, document.instances.byteLength / 80)))
  ).$usage('storage');
  await uploadBuffer(gpu, instances.buffer, indexed.instances);
  const clips = keep(root.createBuffer(d.arrayOf(CurveInstance, Math.max(1, document.clips.byteLength / 80)))).$usage(
    'storage'
  );
  await uploadBuffer(gpu, clips.buffer, indexed.clips);
  const bins = keep(root.createBuffer(d.arrayOf(d.u32, Math.max(1, indexed.bins.byteLength / 4)))).$usage('storage');
  await uploadBuffer(gpu, bins.buffer, indexed.bins);
  const offsets = keep(
    root.createBuffer(
      d.arrayOf(d.vec2f, document.pages.length),
      document.pages.map((p) => d.vec2f(p.x, p.y))
    )
  ).$usage('storage');
  const view = keep(root.createBuffer(View)).$usage('uniform');
  const quadIndices = keep(root.createBuffer(d.arrayOf(d.u16, 6), [0, 1, 2, 2, 1, 5])).$usage('index');
  const group = root.createBindGroup(viewLayout, { view, pages: offsets });
  const pageData = pageVertices(document);
  const pages = keep(
    root.createBuffer(pageLayout.schemaForCount(pageData.length / 2), (buffer) => buffer.write(pageData.buffer))
  ).$usage('vertex');
  const pagePipeline = root
    .createRenderPipeline({
      attribs: { position: pageLayout.attrib },
      vertex: pageVertex,
      fragment: pageFragment,
      targets: { format },
      primitive: { topology: 'triangle-strip' }
    })
    .with(group)
    .with(pageLayout, pages);
  const croppedViews: { buffer: typeof view; group: typeof group }[] = [];
  const geometry = root.createBindGroup(curveLayout, { curves, instances, clips, bins });
  const curveBatches = curveRuns(
    [...trees, ...composition.cached, ...composition.direct],
    document.instances,
    coverage.offsets
  );
  const pageBundle = createPageBundles(device, format, trees, keep);

  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
  };
  const curvePipeline = root
    .createRenderPipeline({ vertex: curveVertex, fragment: curveFragment, targets: { format, blend } })
    .with(group)
    .with(geometry);
  const fills = {
    simple: fillVariants(simpleCurveFragment),
    cached: fillVariants(cachedCurveFragment),
    analytic: fillVariants(analyticCurveFragment)
  };
  const radialData = keep(
    root.createBuffer(d.arrayOf(RadialGradient, Math.max(1, document.rasterImages.table.byteLength / 24)), (buffer) =>
      buffer.write(document.radialGradients)
    )
  ).$usage('storage');
  const radial = root.createBindGroup(radialLayout, { gradients: radialData });
  const imagePipeline = root
    .createRenderPipeline({ vertex: rasterVertex, fragment: rasterFragment, targets: { format, blend } })
    .with(group)
    .with(geometry)
    .with(radial);
  const shapeRoot = root.with(shapeOnlySlot, true);
  const curveShapePipeline = shapeRoot
    .createRenderPipeline({ vertex: curveVertex, fragment: curveFragment, targets: { format, blend } })
    .with(group)
    .with(geometry);
  const imageShapePipeline = shapeRoot
    .createRenderPipeline({ vertex: rasterVertex, fragment: rasterFragment, targets: { format, blend } })
    .with(group)
    .with(geometry)
    .with(radial);
  root.unwrap(pagePipeline);
  root.unwrap(curvePipeline);
  root.unwrap(imagePipeline);
  for (const variants of Object.values(fills)) {
    root.unwrap(variants.normal);
  }
  const initialPages = initialFrame?.visible.map(({ index }) => index);
  const tails = await raster.prepareMipTails(
    initialPages?.flatMap((page) => runs[page]!.flatMap(({ image }) => (image === undefined ? [] : [image])))
  );
  if (tails.isErr()) return err(tails.error);
  await device.queue.onSubmittedWorkDone();

  const cachedPages = composition.pages;
  const tileCache = createPageTileCache(
    gpu,
    document,
    cachedPages,
    keep,
    (pass, frame) => drawDirect(pass, frame, 'cached'),
    (page) => [...composition.images.get(page)!].every((image) => raster.isSettled(image)),
    (page) => [...composition.images.get(page)!].every((image) => !!raster.get(image))
  );
  const directBudget = keep(
    createCompositionBudget(
      () => device.queue.onSubmittedWorkDone(),
      () => tileCache.events.dispatchEvent(new Event('change'))
    )
  );
  const previews = await tileCache.prepare(initialPages?.filter((page) => useComposedPage(page, initialFrame!)));
  if (previews.isErr()) return err(previews.error);

  const imagePages = new Map<number, Set<number>>();
  const readyImages = new Set<number>();
  const imageRevisions = new Uint32Array(document.pages.length);

  for (const [index, pageRuns] of runs.entries()) {
    for (const { image } of pageRuns) {
      if (image === undefined) continue;
      const pages = imagePages.get(image) ?? new Set<number>();
      pages.add(index);
      imagePages.set(image, pages);
    }
  }

  const uploaded = (event: Event) => {
    const image = (event as CustomEvent<{ image: number }>).detail?.image;
    if (image !== undefined && raster.get(image) && !readyImages.has(image)) {
      readyImages.add(image);
      for (const page of imagePages.get(image) ?? []) imageRevisions[page]!++;
    }
    tileCache.invalidate(image === undefined ? cachedPages : (imagePages.get(image) ?? []));
    tileCache.events.dispatchEvent(new Event('change'));
  };
  raster.events.addEventListener('change', uploaded);
  keep({ destroy: () => raster.events.removeEventListener('change', uploaded) });

  return ok({
    events: tileCache.events,
    get refinement() {
      return {
        ...tileCache.refinement,
        directPages: trees.length - cachedPages.size,
        overviewPages: composition.overview.size,
        budgetCachedPages: directBudget.size,
        foregroundPages: [...cachedPages].filter((page) => composition.direct[page]!.length > 0).length
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
        Math.max(32, document.curves.byteLength) +
        Math.max(80, document.instances.byteLength) +
        Math.max(80, document.clips.byteLength) +
        Math.max(4, indexed.bins.byteLength) +
        Math.max(64, (document.rasterImages.table.byteLength / 24) * 64) +
        pageData.byteLength +
        document.pages.length * 8 +
        60 +
        coverage.resourceBytes +
        raster.resourceBytes +
        croppedViews.length * 64 +
        tileCache.resourceBytes +
        compositor.resourceBytes
      );
    },
    draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
      raster.update(
        document.instances,
        frame.visible.flatMap((item) => runs[item.index]!),
        frame,
        frame.visible.flatMap(({ index }) => (useComposedPage(index, frame) ? [...composition.images.get(index)!] : []))
      );

      if (frame.vectorOnly || cachedPages.size === 0) {
        tileCache.pause();
        drawDirect(pass, frame);
        observeDirectCost(frame);
        return;
      }

      const cached = frame.visible.filter(({ index }) => useComposedPage(index, frame));
      if (cached.length === 0) {
        tileCache.pause();
        drawDirect(pass, frame);
        observeDirectCost(frame);
        return;
      }

      drawDirect(pass, frame, 'direct', () => tileCache.draw(pass, { ...frame, visible: cached }));
      observeDirectCost(frame);
    }
  });

  /** Ordinary image pages use their composed prefix only in a multi-page overview. */
  function useComposedPage(index: number, frame: SceneFrame) {
    if (!cachedPages.has(index)) {
      return false;
    }

    if (!composition.overview.has(index) || directBudget.has(index)) {
      return true;
    }

    const [, , c, e] = frame.rotation;
    const height = document.pages[index]!.height / document.pages[0]!.height;
    const screenHeight = (Math.hypot(c! * frame.width, e! * frame.height) * frame.mul[1] * height) / 2;
    return frame.visible.length > 4 && screenHeight <= 512;
  }

  /** Observe only optional prefixes currently bypassed by ordinary rendering. */
  function observeDirectCost(frame: SceneFrame) {
    if (frame.vectorOnly) {
      return;
    }

    directBudget.observe(
      frame.visible
        .filter(({ index }) => composition.overview.has(index) && !useComposedPage(index, frame))
        .map(({ index }) => index)
    );
  }

  function fillVariants(fragment: typeof simpleCurveFragment) {
    const variant = (shape: boolean) =>
      root
        .with(shapeOnlySlot, shape)
        .createRenderPipeline({ vertex: curveVertex, fragment, targets: { format, blend } })
        .with(group)
        .with(geometry)
        .with(coverage.group);

    return { normal: variant(false), shape: variant(true) };
  }

  function withEncoder(pipeline: typeof curvePipeline, encoder: GPURenderPassEncoder | GPURenderBundleEncoder) {
    const bound = 'executeBundles' in encoder ? pipeline.with(encoder) : pipeline.with(encoder);
    return bound.withIndexBuffer(quadIndices);
  }

  function drawDirect(
    pass: GPURenderPassEncoder,
    frame: SceneFrame,
    layer: 'all' | 'cached' | 'direct' = 'all',
    underlay?: () => void
  ) {
    let activeGroup = group;
    const visible = spatial(frame);
    const { cacheLevel, exactLevel } = coverageCacheLevel(frame);
    const cacheScale = 2 ** cacheLevel;
    const exactScale = 2 ** exactLevel;
    view.write({
      mul: frame.mul,
      add: frame.add,
      rotation: frame.rotation,
      rasterTexel: [2 / frame.width, 2 / frame.height],
      debug: 0,
      vectorOnly: frame.vectorOnly ? 1 : 0
    });

    const selectedTrees =
      layer === 'all'
        ? trees
        : layer === 'cached'
          ? composition.cached
          : trees.map((nodes, index) => (useComposedPage(index, frame) ? composition.direct[index]! : nodes));
    const compositePages = frame.visible.filter(({ index }) =>
      selectedTrees[index]!.some((node) => 'children' in node || node.blend !== 0)
    );
    const composedIndices = new Set(compositePages.map(({ index }) => index));
    const ordinaryPages = frame.visible.filter(({ index }) => !composedIndices.has(index));
    const background = (pass: GPURenderPassEncoder) => {
      pagePipeline.with(pass).draw(document.pages.length * 6);
      underlay?.();
    };
    const paint = (
      pass: GPURenderPassEncoder | GPURenderBundleEncoder,
      run: Exclude<PaintNode, { children: PaintNode[] }>,
      shapeOnly = false
    ) => {
      if ('executeBundles' in pass && !visible.rect(run)) {
        return;
      }

      const draw = (pipeline: typeof curvePipeline, first: number, count: number) => {
        const ranges =
          'executeBundles' in pass && frame.visible.length <= 4 ? visible.ranges(first, count) : [{ first, count }];

        for (const span of ranges) {
          withEncoder(pipeline.with(activeGroup), pass).drawIndexed(6, span.count, 0, 0, span.first);
        }
      };

      if (run.image === undefined) {
        if (frame.vectorOnly) {
          draw(shapeOnly ? curveShapePipeline : curvePipeline, run.first, run.count);
          return;
        }

        const batches = curveBatches.get(`${run.first}:${run.count}`)!;
        const selected = batches.map((batch) => {
          if (!batch.simple) {
            return shapeOnly ? curveShapePipeline : curvePipeline;
          }

          if (batch.cacheScale <= cacheScale) {
            return fills.cached[shapeOnly ? 'shape' : 'normal'];
          }

          if (batch.minimumScale >= exactScale) {
            return fills.analytic[shapeOnly ? 'shape' : 'normal'];
          }

          return fills.simple[shapeOnly ? 'shape' : 'normal'];
        });
        const changes = selected.reduce((sum, pipeline, i) => sum + Number(i > 0 && pipeline !== selected[i - 1]), 0);

        // Pipeline switches on tiled mobile GPUs can cost more than the shared shader's
        // extra branches. Keep heterogeneous ordinary runs in one ordered draw.
        if (changes > 2 && batches.every((batch) => batch.simple)) {
          draw(fills.simple[shapeOnly ? 'shape' : 'normal'], run.first, run.count);
          return;
        }

        let first = run.first;
        let count = 0;
        let previous: typeof curvePipeline | undefined;

        for (const [index, batch] of batches.entries()) {
          const pipeline = selected[index]!;

          if (previous && previous !== pipeline) {
            draw(previous, first, count);
            first = batch.first;
            count = 0;
          }

          previous = pipeline;
          count += batch.count;
        }

        if (previous) {
          draw(previous, first, count);
        }
      } else {
        const image = raster.get(run.image);

        if (image) {
          draw((shapeOnly ? imageShapePipeline : imagePipeline).with(image), run.first, run.count);
        }
      }
    };

    if (compositePages.length > 0) {
      compositor.draw(
        pass,
        frame,
        compositePages.map(({ index }) => selectedTrees[index]!),
        visible.rect,
        (index, rect, width, height) => {
          let cropped = croppedViews[index];

          if (!cropped) {
            const buffer = keep(root.createBuffer(View)).$usage('uniform');
            cropped = { buffer, group: root.createBindGroup(viewLayout, { view: buffer, pages: offsets }) };
            croppedViews[index] = cropped;
          }

          cropped.buffer.write(croppedView(frame, rect, width, height));
          activeGroup = cropped.group;
        },
        (pass) => {
          background(pass);
          paintOrdinary(pass);
        },
        paint
      );
    } else {
      background(pass);
      paintOrdinary(pass);
    }

    // One remaining group must not drag every ordinary page through offscreen
    // compositing. Page rectangles do not overlap, so these draws stay independent.
    function paintOrdinary(pass: GPURenderPassEncoder) {
      activeGroup = group;
      // Keep composed foreground inline. Replaying its bundles after tile refinement
      // stalls Chrome 153/Metal; untouched ordinary pages still reuse their bundles.
      if (!frame.vectorOnly && ordinaryPages.length > 4 && layer === 'all') {
        pass.executeBundles(
          ordinaryPages.map(({ index }) => {
            return pageBundle(index, paint, `${cacheLevel}:${exactLevel}:${imageRevisions[index]}`);
          })
        );
      } else {
        for (const node of ordinaryPages.flatMap(({ index }) => selectedTrees[index]!)) {
          if (!('children' in node)) {
            paint(pass, node);
          }
        }
      }
    }
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
