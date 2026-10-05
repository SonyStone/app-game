// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerformanceMonitor } from './createPerformanceMonitor';
import { PerformancePanel } from './PerformancePanel';

const cleanups: (() => void)[] = [];
let now = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createPerformanceMonitor', () => {
  it('records engine frames while enabled and reports them through window.paintPerformance', () => {
    const [enabled, setEnabled] = createSignal(false);
    const monitor = createRoot((dispose) => {
      cleanups.push(dispose);
      return createPerformanceMonitor({ enabled, label: () => 'worker', size: () => ({ width: 400, height: 300 }) });
    });
    flush();

    arrive(10, { renderMs: 2, queueWaitMs: 3 });
    expect(monitor.samples()).toEqual([]);
    expect(window.paintPerformance!.report().monitors).toEqual([]);

    setEnabled(true);
    flush();
    arrive(100, { renderMs: 2, queueWaitMs: 3 });
    arrive(116, { renderMs: 1, queueWaitMs: 4 });
    arrive(400, { renderMs: 1, queueWaitMs: 1 });
    flush();

    // Starts are the arrival time minus the engine's CPU and GPU wait; only frames 100 ms apart or less are back to back.
    expect(monitor.samples()).toEqual([
      { timestamp: 95, cpuMs: 2, gpuMs: 3, intervalMs: undefined },
      { timestamp: 111, cpuMs: 1, gpuMs: 4, intervalMs: 16 },
      { timestamp: 398, cpuMs: 1, gpuMs: 1, intervalMs: undefined }
    ]);
    expect(monitor.idle()).toBe(false);

    const [report] = window.paintPerformance!.report({ samples: true }).monitors;
    expect(report).toMatchObject({
      label: 'worker',
      idle: false,
      frames: 3,
      canvas: { width: 400 * devicePixelRatio, height: 300 * devicePixelRatio, dpr: devicePixelRatio },
      cpuMs: { max: 2 },
      gpuMs: { max: 4 }
    });
    expect(report!.samples).toHaveLength(3);

    vi.advanceTimersByTime(150);
    flush();
    expect(monitor.idle()).toBe(true);

    window.paintPerformance!.reset();
    expect(window.paintPerformance!.report().monitors[0]!.frames).toBe(0);

    arrive(500, { renderMs: 1, queueWaitMs: 1 });
    setEnabled(false);
    flush();
    expect(monitor.samples()).toEqual([]);
    expect(window.paintPerformance!.report().monitors).toEqual([]);

    /** Delivers an engine frame event at `time` on the main thread's clock. */
    function arrive(time: number, frame: { renderMs: number; queueWaitMs: number }) {
      now = time;
      monitor.record(frame);
    }
  });
});

describe('PerformancePanel', () => {
  it('draws the panel on its own 2D canvas and redraws when frames arrive', () => {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const [samples, setSamples] = createSignal([{ timestamp: 0, cpuMs: 4, gpuMs: 2 }]);
    const root = document.createElement('div');
    cleanups.push(render(() => <PerformancePanel samples={samples()} idle />, root));
    flush();

    const canvas = root.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-label')).toBe('Frame performance');
    expect(canvas.width).toBe(Math.round(parseFloat(canvas.style.width) * devicePixelRatio));
    expect(context.clearRect).toHaveBeenCalledOnce();
    expect(context.fillRect).toHaveBeenCalled();

    setSamples([...samples(), { timestamp: 16, cpuMs: 3, gpuMs: 1 }]);
    flush();
    expect(context.clearRect).toHaveBeenCalledTimes(2);
  });
});
