import { loadBrushLibrary } from '@app-game/abr-brush/library';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import { verifyAbrBrush } from '../gpu/abrBrushVerification';
import { verifyAbrColorMixing } from '../gpu/abrColorMixingVerification';
import { verifyActivePreview } from '../gpu/activePreviewVerification';
import { verifyBrushBatches } from '../gpu/brushBatchVerification';
import { verifyFlowAccumulation } from '../gpu/flowAccumulationVerification';
import { verifyLargeBrush } from '../gpu/largeBrushVerification';
import { verifyLayerComposite } from '../gpu/layerCompositeVerification';
import { verifyLiveTail } from '../gpu/liveTailVerification';
import { verifyColdNavigation } from '../gpu/navigationStreamingVerification';
import { verifyOverviewQuality } from '../gpu/overviewQualityVerification';
import { verifyPatternRegions } from '../gpu/patternRegionVerification';
import { verifyPatternRetouch } from '../gpu/patternRetouchVerification';
import { verifyPersistentOverview } from '../gpu/persistentOverviewVerification';
import { verifyPressureSpacing } from '../gpu/pressureVerification';
import { verifyReadbackQueue } from '../gpu/readbackVerification';
import { verifyRefinement } from '../gpu/refinementVerification';
import { verifySelection } from '../gpu/selectionVerification';
import { verifyStreaming } from '../gpu/streamingVerification';
import { verifyStrokeFiltering } from '../gpu/strokeFilteringVerification';
import { verifyPaintSymmetry } from '../gpu/symmetryVerification';
import { verifyCanvasTargets } from '../gpu/targetVerification';
import { verifyTexturedBrush } from '../gpu/texturedBrushVerification';
import { verifyTipUploads } from '../gpu/tipUploadVerification';
import { verifyGpu } from '../gpu/verification';
import { verifyMainThread } from './mainThreadVerification';
import { verifyWorker } from './workerVerification';

type Report = (message: string) => void;

/**
 * Sampled Paintbrush masks accumulated in shared GPU batches must equal the one-stamp-per-dispatch reference byte for
 * byte at every tip size, with and without a dual brush or Color Dynamics, across input batching, progress
 * presentation and eviction.
 */
async function verifyAbrMaskBatches(report: Report) {
  for (const size of [24, 80, 222, 500]) {
    for (const dualBrush of [true, false]) {
      for (const progress of [false, true]) {
        await verifyAbrBrush(report, true, true, 'sampledBrush', 'sampledBrush', size, { dualBrush, progress });
      }

      // Color Dynamics stores straight color bytes and accumulates through its own batched kernel.
      await verifyAbrBrush(report, false, true, 'sampledBrush', 'sampledBrush', size, { dualBrush });
    }

    report(`PASS: ${size}px sampled masks match the unbatched reference`);
  }
}

/**
 * Every real-GPU verification, by name. `tests/browser/verifications.browser.mjs` opens `harness.html` in Chromium with
 * WebGPU and runs each one in a fresh page; the manual QA page (`apps/web/paint-studio-qa.html`) calls the same
 * functions. Each resolves when all of its checks pass and throws on the first failure. Benchmarks
 * (`tests/gpu/performance.ts`, `smudgePerformanceVerification.ts`) are measurements, not verifications, and stay on the
 * QA page.
 */
export const verifications = {
  gpu: verifyGpu,
  readback: verifyReadbackQueue,
  'brush-batches': verifyBrushBatches,
  'active-preview': verifyActivePreview,
  refinement: verifyRefinement,
  'overview-quality': verifyOverviewQuality,
  'large-brush': verifyLargeBrush,
  'flow-accumulation': verifyFlowAccumulation,
  'layer-composite': verifyLayerComposite,
  pressure: verifyPressureSpacing,
  'stroke-filtering': verifyStrokeFiltering,
  'live-tail': verifyLiveTail,
  'persistent-overview': verifyPersistentOverview,
  'cold-navigation': verifyColdNavigation,
  streaming: verifyStreaming,
  'abr-mixing': verifyAbrColorMixing,
  'abr-brush': verifyAbrBrush,
  'abr-mask-batches': verifyAbrMaskBatches,
  'textured-brush': (report: Report) => verifyTexturedBrush(report, loadFixtureTip),
  'canvas-targets': verifyCanvasTargets,
  lasso: verifySelection,
  symmetry: verifyPaintSymmetry,
  'tip-uploads': verifyTipUploads,
  'pattern-regions': verifyPatternRegions,
  'pattern-retouch': verifyPatternRetouch,
  'execution-modes': verifyMainThread,
  worker: verifyWorker
} satisfies Record<string, (report: Report) => Promise<unknown>>;

declare global {
  interface Window {
    /** Set by the harness page; the browser runner calls these through `page.evaluate`. */
    paintVerifications: typeof verifications;
  }
}

window.paintVerifications = verifications;

/**
 * First decodable tip of Adobe's Spatter pack. The browser runner serves the pinned fixture at this path; on a plain dev
 * server the request fails and the textured-brush check reports the missing fixture.
 */
async function loadFixtureTip(): Promise<BrushResource> {
  const response = await fetch('/__fixtures/spatter_brushes.abr');

  if (!response.ok) {
    throw new Error('Serve spatter_brushes.abr at /__fixtures/ (the browser runner does this) to check textured brushes.');
  }

  await initAbr();
  const library = loadBrushLibrary(await response.arrayBuffer());
  const tip = library.brushes.find((brush) => brush.tipImage?.data.some((value) => value > 0))?.tipImage;

  if (!tip) {
    throw new Error(`No decoded ABR tip: ${library.errors.join('; ')}`);
  }

  return { id: 'abr-fixture', width: tip.width, height: tip.height, format: 'r8unorm', pixels: tip.data };
}
