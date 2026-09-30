import { render } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { FrameLoop, useFrameLoop } from '../scene/FrameLoop';
import type { Viewport } from '../viewport/createViewport';
import { fontRows, glyphRows, historyLength, layoutPerformancePanel } from './layoutPerformancePanel';
import { makeFrameCostHistory, summarizeFrameCosts, type FrameCostSample } from './makeFrameCostHistory';
import { maxPanelQuads } from './makePerformancePanelRenderer';
import { PerformanceMonitor } from './PerformanceMonitor';
import { describeMonitor, type PerformanceMonitorSource } from './performanceReports';

vi.mock('@app-game/solid-gpu/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));

const size = { css: { width: 800, height: 600 }, pixels: { width: 1600, height: 1200 }, dpr: 2 };
const viewport = {
  size: () => size,
  clientToScreen: (point: { x: number; y: number }) => point,
  screenToClip: (point: { x: number; y: number }) => point
} as Viewport;

let gpu: ReturnType<typeof gpuFixture>['gpu'];
let draws: number[];
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const cleanups: (() => void)[] = [];

beforeEach(() => {
  draws = [];
  gpu = gpuFixture().gpu;
  const pipeline = { with: () => pipeline, draw: (_vertices: number, instances: number) => draws.push(instances) };
  Object.assign(gpu, {
    format: 'bgra8unorm',
    root: {
      createBuffer: vi.fn(() => ({ $usage: () => ({ write: vi.fn(), destroy: vi.fn() }) })),
      createBindGroup: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => pipeline)
    }
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  frames.clear();
  vi.unstubAllGlobals();
});

describe('makeFrameCostHistory', () => {
  it('records every frame, with intervals only between back-to-back frames, up to its capacity', () => {
    const history = makeFrameCostHistory(3);

    history.record(frame(0, 0), 2);
    history.record(frame(16), 3);
    history.record(frame(500, 0), 4);
    history.record(frame(520), 5);

    expect(history.samples).toEqual([
      { timestamp: 16, cpuMs: 3, intervalMs: 16 },
      { timestamp: 500, cpuMs: 4, intervalMs: undefined },
      { timestamp: 520, cpuMs: 5, intervalMs: 20 }
    ]);

    history.reset();
    history.record(frame(540), 1);
    expect(history.samples).toEqual([{ timestamp: 540, cpuMs: 1, intervalMs: undefined }]);
  });
});

describe('summarizeFrameCosts', () => {
  it('reports the latest cost, the range including GPU time, and the frame rate of the trailing run', () => {
    const samples: FrameCostSample[] = [
      { timestamp: 0, cpuMs: 1, gpuMs: 9, intervalMs: 5 },
      { timestamp: 0, cpuMs: 2 },
      { timestamp: 0, cpuMs: 3, gpuMs: 1, intervalMs: 10 },
      { timestamp: 0, cpuMs: 1, intervalMs: 30 }
    ];

    expect(summarizeFrameCosts(samples)).toEqual({ latestMs: 1, minMs: 1, maxMs: 10, fps: 50 });
  });

  it('has no frame rate after idle and no costs without frames', () => {
    expect(summarizeFrameCosts([{ timestamp: 0, cpuMs: 4 }]).fps).toBeUndefined();
    expect(summarizeFrameCosts([])).toEqual({
      latestMs: undefined,
      minMs: undefined,
      maxMs: undefined,
      fps: undefined
    });
  });
});

describe('layoutPerformancePanel', () => {
  it('packs one 7-row bitmap per glyph', () => {
    expect(fontRows.length % glyphRows).toBe(0);
    expect(fontRows.every((row) => row >= 0 && row < 32)).toBe(true);
  });

  it('snaps quads to device pixels in the top-left corner and fits a full history in the quad buffer', () => {
    const samples = Array.from({ length: historyLength + 5 }, () => ({
      timestamp: 0,
      cpuMs: 99.9,
      gpuMs: 50,
      intervalMs: 16
    }));
    const quads = layoutPerformancePanel(samples, false, size);
    const panel = quads[0]!;

    expect(panel.rect).toEqual([16 / 800 - 1, 1 - 16 / 600, expect.any(Number), expect.any(Number)]);
    expect(quads.length).toBeLessThanOrEqual(maxPanelQuads);
    expect(quads.filter((quad) => quad.glyph >= 0).length).toBeGreaterThan(20);

    for (const { rect } of quads) {
      expect(rect.every((value) => value >= -1 && value <= 1)).toBe(true);
      const left = ((rect[0] + 1) / 2) * size.pixels.width;
      expect(left).toBeCloseTo(Math.round(left), 6);
    }
  });

  it('draws one bar per frame, stacking GPU time above CPU time', () => {
    const solid = (samples: FrameCostSample[]) =>
      layoutPerformancePanel(samples, true, size).filter((quad) => quad.glyph < 0).length;
    const empty = solid([]);

    expect(solid([{ timestamp: 0, cpuMs: 4 }]) - empty).toBe(1);
    expect(solid([{ timestamp: 0, cpuMs: 4, gpuMs: 2 }]) - empty).toBe(2);
  });
});

describe('describeMonitor', () => {
  it('summarizes CPU, settled GPU and total costs with nearest-rank percentiles and budget overruns', () => {
    const samples: FrameCostSample[] = [
      { timestamp: 100, cpuMs: 1, gpuMs: 2 },
      { timestamp: 116, cpuMs: 3, gpuMs: 20, intervalMs: 16 },
      { timestamp: 132, cpuMs: 2, intervalMs: 16 }
    ];
    const monitor: PerformanceMonitorSource = {
      label: () => 'pane 1',
      samples: () => samples,
      idle: () => true,
      canvas: () => ({ width: 1600, height: 1200, dpr: 2 }),
      reset: vi.fn()
    };

    const report = describeMonitor(monitor, true);

    expect(report).toMatchObject({
      label: 'pane 1',
      idle: true,
      frames: 3,
      spanMs: 32,
      fps: 62.5,
      cpuMs: { mean: 2, p50: 2, p95: 3, max: 3 },
      gpuMs: { mean: 11, p50: 2, p95: 20, max: 20 },
      totalMs: { p50: 3, max: 23 },
      overBudget: 1
    });
    expect(report.samples).toEqual(samples);
    expect(report.samples![0]).not.toBe(samples[0]);
    expect(describeMonitor(monitor, false)).not.toHaveProperty('samples');
    expect(describeMonitor({ ...monitor, samples: () => [] }, false)).toMatchObject({
      frames: 0,
      fps: null,
      cpuMs: null,
      gpuMs: null,
      totalMs: null
    });
  });
});

describe('PerformanceMonitor', () => {
  it('measures on-demand frames, then refreshes once without measuring or keeping the loop running', async () => {
    let loop!: ReturnType<typeof useFrameLoop>;

    function Probe() {
      loop = useFrameLoop();
      return null;
    }

    cleanups.push(
      render(
        () => (
          <FrameLoop viewport={viewport} onError={vi.fn()}>
            <Probe />
            <PerformanceMonitor />
          </FrameLoop>
        ),
        document.createElement('div')
      )
    );
    flush();

    await tick(1000);
    expect(frames.size).toBe(0);

    loop.invalidate();
    await tick(1100);
    expect(draws).toHaveLength(2);
    expect(frames.size).toBe(0);

    // Each frame shows the frames measured before it. One refresh then shows the second measured frame; it is not
    // measured itself, so no further refresh follows.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await tick(1400);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(frames.size).toBe(0);
    expect(draws).toHaveLength(3);
    expect(draws[1]!).toBeGreaterThan(draws[0]!);
    expect(draws[2]!).toBeGreaterThan(draws[1]!);
  });

  it('reports through window.gpuPerformance while mounted, and resets without measuring the cleared redraw', async () => {
    const [mounted, setMounted] = createSignal(true);

    cleanups.push(
      render(
        () => (
          <FrameLoop viewport={viewport} onError={vi.fn()}>
            <Show when={mounted()}>
              <PerformanceMonitor label="pane 1" />
            </Show>
          </FrameLoop>
        ),
        document.createElement('div')
      )
    );
    flush();
    await tick(1000);

    const [report] = window.gpuPerformance!.report().monitors;
    expect(report).toMatchObject({ label: 'pane 1', frames: 1, canvas: { width: 1600, height: 1200, dpr: 2 } });

    window.gpuPerformance!.reset();
    expect(window.gpuPerformance!.report().monitors[0]!.frames).toBe(0);
    await tick(1100);
    expect(window.gpuPerformance!.report().monitors[0]!.frames).toBe(0);

    setMounted(false);
    flush();
    expect(window.gpuPerformance!.report().monitors).toEqual([]);
  });
});

/** A presented frame at `timestamp`; a zero `delta` marks the first frame after idle, resume or a redraw. */
function frame(timestamp: number, delta = 0.016) {
  return { timestamp, delta, time: timestamp / 1000 };
}

async function tick(timestamp: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(timestamp));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
}
