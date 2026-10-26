/** A diagnostic sample. Byte counts are estimates unless the name explicitly says otherwise. */
export type PsdPerformanceSample = {
  name: string;
  start: number;
  duration: number;
  value?: number;
};

/** Opt-in, bounded diagnostics. Recording failures must never affect document operations. */
export function makePerformanceRecorder(enabled = false) {
  const samples: PsdPerformanceSample[] = [];

  function record(name: string, start = performance.now(), value?: number) {
    if (!enabled) {
      return;
    }

    try {
      const duration = Math.max(0, performance.now() - start);
      samples.push({ name, start, duration, value });
      if (samples.length > 10_000) {
        samples.shift();
      }

      performance.measure(`psd:${name}`, { start, duration, detail: value });
      performance.clearMeasures(`psd:${name}`);
    } catch {
      // Diagnostics are optional, including on browsers without User Timing Level 3.
    }
  }

  return {
    record,
    enable: (value: boolean) => {
      enabled = value;
    },
    take: () => samples.splice(0)
  };
}

/** Main-thread recorder, enabled by `?telemetry=1`; workers send their samples with ordinary replies. */
export const viewerPerformance = makePerformanceRecorder(
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('telemetry') === '1'
);

/** Whether the benchmark requested diagnostics. No document behavior depends on this value. */
export function performanceEnabled() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('telemetry') === '1';
}
