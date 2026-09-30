import { describe, expect, it, vi } from 'vitest';
import { drawPerformancePanel, type PanelContext } from './drawPerformancePanel';
import {
  fontRows,
  glyphRows,
  historyLength,
  layoutPerformancePanel,
  performancePanelSize
} from './layoutPerformancePanel';
import { makeFrameCostHistory, summarizeFrameCosts, type FrameCostSample } from './makeFrameCostHistory';
import {
  answerPerformanceRequests,
  describeMonitor,
  makePerformanceReports,
  type PerformanceHot,
  type PerformanceMonitorSource
} from './makePerformanceReports';

const size = { pixels: { width: 1600, height: 1200 }, dpr: 2 };

describe('makeFrameCostHistory', () => {
  it('records every frame, with intervals only between back-to-back frames, up to its capacity', () => {
    const history = makeFrameCostHistory(3);

    history.record({ timestamp: 0, delta: 0 }, 2);
    history.record({ timestamp: 16, delta: 16 }, 3);
    history.record({ timestamp: 500, delta: 0 }, 4);
    history.record({ timestamp: 520, delta: 20 }, 5);

    expect(history.samples).toEqual([
      { timestamp: 16, cpuMs: 3, intervalMs: 16 },
      { timestamp: 500, cpuMs: 4, intervalMs: undefined },
      { timestamp: 520, cpuMs: 5, intervalMs: 20 }
    ]);

    history.reset();
    history.record({ timestamp: 540, delta: 20 }, 1);
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

  it('snaps quads to device pixels in the top-left corner, within performancePanelSize', () => {
    const samples = Array.from({ length: historyLength + 5 }, () => ({
      timestamp: 0,
      cpuMs: 99.9,
      gpuMs: 50,
      intervalMs: 16
    }));
    const quads = layoutPerformancePanel(samples, false, size);
    const panel = quads[0]!;

    expect(panel.rect).toEqual([16 / 800 - 1, 1 - 16 / 600, expect.any(Number), expect.any(Number)]);
    expect(quads.filter((quad) => quad.glyph >= 0).length).toBeGreaterThan(20);

    for (const { rect } of quads) {
      expect(rect.every((value) => value >= -1 && value <= 1)).toBe(true);
      const left = ((rect[0] + 1) / 2) * size.pixels.width;
      expect(left).toBeCloseTo(Math.round(left), 6);
      expect(((rect[2] + 1) / 2) * size.pixels.width).toBeLessThanOrEqual(performancePanelSize.width * size.dpr);
      expect(((1 - rect[3]) / 2) * size.pixels.height).toBeLessThanOrEqual(performancePanelSize.height * size.dpr);
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

describe('drawPerformancePanel', () => {
  it('clears the canvas, fills solid quads in device pixels and one rectangle per lit glyph pixel', () => {
    const context: PanelContext = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    const pixels = { width: 200, height: 100 };

    drawPerformancePanel(
      context,
      [
        { rect: [-1, 1, 0, 0], color: [1, 0, 0, 0.5], glyph: -1 },
        { rect: [0, 0, 0.5, -1], color: [0, 1, 0, 1], glyph: 0 }
      ],
      pixels
    );

    const litPixels = fontRows.slice(0, glyphRows).reduce((total, bits) => total + bitCount(bits), 0);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(context.fillRect).toHaveBeenCalledTimes(1 + litPixels);
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 100, 50);
    expect(context.fillStyle).toBe('rgb(0 255 0 / 1)');
  });
});

describe('makePerformanceReports', () => {
  const samples: FrameCostSample[] = [
    { timestamp: 100, cpuMs: 1, gpuMs: 2 },
    { timestamp: 116, cpuMs: 3, gpuMs: 20, intervalMs: 16 },
    { timestamp: 132, cpuMs: 2, intervalMs: 16 }
  ];
  const monitor = (): PerformanceMonitorSource => ({
    label: () => 'pane 1',
    samples: () => samples,
    idle: () => true,
    canvas: () => ({ width: 1600, height: 1200, dpr: 2 }),
    reset: vi.fn()
  });

  it('summarizes CPU, settled GPU and total costs with nearest-rank percentiles and budget overruns', () => {
    const source = monitor();
    const report = describeMonitor(source, true);

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
    expect(describeMonitor(source, false)).not.toHaveProperty('samples');
    expect(describeMonitor({ ...source, samples: () => [] }, false)).toMatchObject({
      frames: 0,
      fps: null,
      cpuMs: null,
      gpuMs: null,
      totalMs: null
    });
  });

  it('reports and resets registered monitors until they are removed', () => {
    const reports = makePerformanceReports();
    const source = monitor();
    const remove = reports.register(source);

    expect(reports.report()).toMatchObject({ url: location.href, budgetMs: 16.67, monitors: [{ frames: 3 }] });
    reports.reset();
    expect(source.reset).toHaveBeenCalledOnce();

    remove();
    expect(reports.report().monitors).toEqual([]);
  });

  it('answers dev-server requests on its channel until unsubscribed', () => {
    const listeners = new Map<string, (payload: any) => void>();
    const hot: PerformanceHot = {
      on: (event, listener) => listeners.set(event, listener),
      off: (event) => listeners.delete(event),
      send: vi.fn()
    };
    const reports = { report: vi.fn(() => ({ url: 'page', budgetMs: 16.67, monitors: [] })), reset: vi.fn() };
    const stop = answerPerformanceRequests(hot, reports, 'demo-performance');

    listeners.get('demo-performance:request')!({ id: 'a', samples: true });
    listeners.get('demo-performance:reset')!(undefined);

    expect(reports.report).toHaveBeenCalledWith({ samples: true });
    expect(hot.send).toHaveBeenCalledWith('demo-performance:report', {
      id: 'a',
      report: { url: 'page', budgetMs: 16.67, monitors: [] }
    });
    expect(reports.reset).toHaveBeenCalledOnce();

    stop();
    expect(listeners.size).toBe(0);
  });
});

function bitCount(bits: number) {
  let count = 0;

  for (let rest = bits; rest > 0; rest >>= 1) {
    count += rest & 1;
  }

  return count;
}
