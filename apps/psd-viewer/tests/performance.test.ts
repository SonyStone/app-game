import { expect, it, vi } from 'vitest';
import { makePerformanceRecorder } from '../src/features/telemetry/performance';

it('keeps telemetry optional and tolerates unavailable performance measures', () => {
  const recorder = makePerformanceRecorder();
  recorder.record('disabled');
  expect(recorder.take()).toEqual([]);
  recorder.enable(true);
  const measure = vi.spyOn(performance, 'measure').mockImplementation(() => {
    throw new Error('unavailable');
  });
  try {
    expect(() => recorder.record('render', performance.now(), 1)).not.toThrow();
    expect(recorder.take()).toMatchObject([{ name: 'render', value: 1 }]);
    expect(recorder.take()).toEqual([]);
  } finally {
    measure.mockRestore();
  }
});
