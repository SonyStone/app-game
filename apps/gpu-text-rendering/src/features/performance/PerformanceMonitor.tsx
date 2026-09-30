import { createGpuResource, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { debounce } from '@solid-primitives/scheduled';
import { onCleanup } from 'solid-js';
import { useFrame, useFrameLoop } from '../scene/FrameLoop';
import { RenderLayer } from '../scene/RenderLayer';
import { useViewport } from '../viewport/createViewport';
import { layoutPerformancePanel } from './layoutPerformancePanel';
import { makeFrameCostHistory } from './makeFrameCostHistory';
import { makePerformancePanelRenderer } from './makePerformancePanelRenderer';
import { registerPerformanceMonitor } from './performanceReports';

/**
 * Draws a frame-cost panel in the canvas's top-left corner with the enclosing FrameLoop's GPU pass. Every presented
 * frame is measured, including single on-demand frames such as those of a drag: its main-thread time until submission
 * and the time until the GPU finished its queue. Frame rate appears only while frames run back to back.
 *
 * The panel draws in the pass it measures, so it shows each frame one frame later. Once frames stop, it draws one more,
 * unmeasured frame so the last measured frame and late GPU times appear; it never keeps the loop running otherwise.
 * The last `reportCapacity` frames are also available to agents and scripts through `window.gpuPerformance` and, in
 * development, the dev server's `/__performance` endpoint; see performanceReports. Mount beneath FrameLoop; it takes
 * no pointer events.
 */
export function PerformanceMonitor(props: {
  /** Painter order; default 1000 draws above ordinary scene layers. */
  order?: number;
  /** Names this monitor in reports, read when a report is requested. Default "canvas". */
  label?: string;
}) {
  const { device } = useGpuCanvas();
  const viewport = useViewport();
  const loop = useFrameLoop();
  const renderer = createGpuResource(({ root, format }) => makePerformancePanelRenderer(root, format));
  const history = makeFrameCostHistory(reportCapacity);

  let idle = true;
  let refreshing = false;
  const settle = debounce(() => {
    idle = true;
    refresh();
  }, settleMs);

  /** Redraws the panel with a frame that is not measured. */
  function refresh() {
    refreshing = true;
    loop.invalidate();
  }

  onCleanup(
    registerPerformanceMonitor({
      label: () => props.label ?? 'canvas',
      samples: () => history.samples,
      idle: () => idle,
      canvas: () => {
        const { pixels, dpr } = viewport.size();
        return { width: pixels.width, height: pixels.height, dpr };
      },
      reset: () => {
        history.reset();
        refresh();
      }
    })
  );

  useFrame(() => renderer.write(layoutPerformancePanel(history.samples, idle, viewport.size())));

  useFrame(
    (frame) => {
      const submitted = performance.now();

      if (refreshing) {
        refreshing = false;
        return;
      }

      idle = false;
      const sample = history.record(frame, submitted - frame.timestamp);

      void device.queue.onSubmittedWorkDone().then(() => {
        sample.gpuMs = performance.now() - submitted;
        settle();
      });
      settle();
    },
    { phase: 'present' }
  );

  return <RenderLayer order={props.order ?? 1000} draw={({ pass }) => renderer.draw(pass)} />;
}

/** Milliseconds without a presented frame after which the panel refreshes once and reports idle. */
const settleMs = 150;

/** Frames kept for reports, about 30 seconds of continuous rendering at 120 Hz. The panel shows the latest few. */
const reportCapacity = 3600;
